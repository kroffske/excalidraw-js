#!/usr/bin/env node
// Real consumer verification. Retained expected values are never updated here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
assert.equal(args.length, 4, 'Usage: --map-root <checkout> --output <new-directory>');
assert.equal(args[0], '--map-root');
assert.equal(args[2], '--output');
const mapRoot = await realpath(resolve(args[1]));
const output = resolve(args[3]);
const allowed = [1, 2].map(stage => join(root, `.local/layout-migration-stage${stage}`) + sep);
assert.ok(allowed.some(directory => output.startsWith(directory)), `Output must be a new directory under ${allowed.join(' or ')}`);
await mkdir(dirname(output), { recursive: true });
assert.equal(await realpath(dirname(output)), dirname(output), 'Output parent must not be a symlink');
await mkdir(output);
const receipt = { mapRoot, node: process.version, commands: [], pages: [] };

async function run(name, command, argv, cwd) {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  const record = { command, argv, cwd, exitCode: result.status, signal: result.signal,
    error: result.error ? String(result.error) : undefined, stdout: result.stdout, stderr: result.stderr };
  await writeFile(join(output, name + '.json'), JSON.stringify(record, null, 2));
  receipt.commands.push({ name, exitCode: result.status });
  assert.equal(result.status, 0, `${name} failed; inspect ${name}.json`);
}

try {
  await run('01-library-typecheck', 'npm', ['run', 'typecheck'], root);
  await run('02-library-tests', 'npm', ['test'], root);
  await run('03-baseline-node24', process.execPath,
    [join(root, 'scripts/layout-migration/baseline.mjs'), '--map-root', mapRoot], root);
  await run('04-baseline-node20', 'npm', ['exec', '--yes', '--package=node@20.20.2', '--', 'node',
    join(root, 'scripts/layout-migration/baseline.mjs'), '--map-root', mapRoot], mapRoot);
  await run('05-map-tests', 'npm', ['test'], mapRoot);
  await run('06-map-build', 'npm', ['run', 'build'], mapRoot);

  const require = createRequire(join(mapRoot, 'package.json'));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const { chromium } = createRequire(import.meta.url)(process.env.LAYOUT_PROBE_PLAYWRIGHT
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  const server = await createServer({ root: mapRoot, logLevel: 'warn', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, timeout: 30000 });
    receipt.browserVersion = browser.version();
    for (const [name, path, engineFree = false] of [
      ['engine-free-families', '/tests/adapter/family-layout-browser.html', true],
      ['automatic', '/tests/adapter/browser.html'],
      ['explicit-and-saved', '/tests/adapter/explicit-layout-browser.html'],
      ['warnings', '/tests/app/layout-warnings-browser.html'],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const record = { name, path, engineFree, errors: [], failedRequests: [], wasmResponses: [], engineRequests: [] };
      receipt.pages.push(record);
      const isEngineResource = url => /(?:libavoid|@hpcc-js[\/_]|wasm-graphviz|graph-layout\/engines|\.wasm(?:$|\?))/u.test(decodeURIComponent(url));
      page.on('request', request => { if (isEngineResource(request.url())) record.engineRequests.push(request.url()); });
      if (engineFree) await page.route('**/*', route => isEngineResource(route.request().url()) ? route.abort() : route.continue());
      page.on('pageerror', error => record.errors.push(String(error)));
      page.on('requestfailed', request => record.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));
      page.on('response', response => {
        if (response.url().includes('libavoid.wasm')) record.wasmResponses.push({ url: response.url(), status: response.status() });
      });
      try {
        await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => {
          const value = document.querySelector('#result')?.textContent?.trim();
          return value && value !== 'pending';
        }, undefined, { timeout: 60000 });
        record.result = JSON.parse(await page.locator('#result').textContent());
        assert.equal(record.result.ok, true, JSON.stringify(record.result));
        assert.deepEqual(record.errors, []);
        assert.deepEqual(record.failedRequests, []);
        if (engineFree) {
          assert.deepEqual(record.engineRequests, [], `${name}: engine modules or WASM were requested`);
          assert.deepEqual(record.result.wasmCalls, [], `${name}: WebAssembly was used`);
        } else {
          assert.ok(record.wasmResponses.some(response => response.url === origin + '/layout-runtime/libavoid.wasm' && response.status === 200),
            `${name}: real fresh generation must load the prepared local WASM`);
        }
        // Fit each official SVG preview into the same readable screen region;
        // this changes screenshot framing only, never the generated scene.
        await page.addStyleTag({ content: '#previews img { max-width: 1800px; height: auto; } #result {white-space:pre-wrap;max-width:1800px;}' });
        await page.screenshot({ path: join(output, name + '.png'), fullPage: true, timeout: 30000 });
        record.passed = true;
      } finally {
        await page.close();
      }
    }
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
  }
  receipt.passed = true;
} catch (error) {
  receipt.passed = false;
  receipt.failure = { message: String(error), stack: error.stack };
  process.exitCode = 1;
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
