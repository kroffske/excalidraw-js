#!/usr/bin/env node
// Stage 0 only: current installed package and a separate feasibility prototype.
// Usage: node scripts/layout-migration/probe-installed.mjs --output <new-directory>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowserSession } from './probe/browser-session.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const templates = join(root, 'scripts/layout-migration/probe');
const args = process.argv.slice(2);
assert.equal(args.length, 2, 'Usage: --output <new-directory>');
assert.equal(args[0], '--output', 'Usage: --output <new-directory>');
const output = resolve(args[1]);
const allowed = join(root, '.local/layout-migration-stage0/package') + sep;
assert.ok(output.startsWith(allowed), `Output must be a new directory under ${allowed}`);
await mkdir(dirname(output), { recursive: true });
assert.equal(await realpath(dirname(output)), dirname(output), 'Output parent must not be a symlink');
await mkdir(output); // Deliberately refuses overwriting an existing evidence run.
const work = await mkdtemp(join(tmpdir(), 'excalidraw-layout-stage0-'));
const commands = [];
let sequence = 0;

function run(command, argv, cwd, { allowFailure = false } = {}) {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', timeout: 180_000,
    env: { ...process.env, npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' } });
  const record = { command, argv, cwd, exitCode: result.status, signal: result.signal,
    error: result.error ? String(result.error) : undefined, stdout: result.stdout, stderr: result.stderr };
  const name = `${String(++sequence).padStart(2, '0')}-${command.split('/').at(-1)}.json`;
  commands.push({ ...record, log: name });
  // This is generated command evidence, not authored source.
  return writeFile(join(output, name), JSON.stringify(record, null, 2)).then(() => {
    if (!allowFailure && result.status !== 0) {
      throw new Error(`${command} ${argv.join(' ')} failed (${result.status}); see ${name}\n${result.stderr}\n${result.stdout}`);
    }
    return record;
  });
}

async function manifest(directory, dependencies = {}) {
  await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }, null, 2));
}

async function copyTemplate(name, directory, target = name) {
  await cp(join(templates, name), join(directory, target));
}

async function listTree(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await listTree(join(directory, entry.name), name));
    else result.push({ path: name, bytes: (await stat(join(directory, entry.name))).size });
  }
  return result;
}

async function browserProbe(directory, { coreOnly = false } = {}) {
  const modulePath = process.env.LAYOUT_PROBE_PLAYWRIGHT
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const require = createRequire(import.meta.url);
  const { chromium } = require(modulePath);
  const dist = join(directory, 'dist');
  const httpRequests = [];
  const server = createServer(async (request, response) => {
    const path = resolve(dist, '.' + new URL(request.url, 'http://localhost').pathname);
    if (path !== dist && !path.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
    try {
      const file = path === dist ? join(dist, 'index.html') : path;
      const bytes = await readFile(file);
      const contentType = ({ '.wasm': 'application/wasm', '.js': 'text/javascript', '.html': 'text/html', '.txt': 'text/plain' })[extname(file)] ?? 'application/octet-stream';
      httpRequests.push({ url: request.url, status: 200, bytes: bytes.length, contentType });
      response.writeHead(200, { 'content-type': contentType }).end(bytes);
    } catch {
      httpRequests.push({ url: request.url, status: 404 });
      response.writeHead(404).end();
    }
  });
  await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return withBrowserSession(server, chromium, async browser => {
    const page = await browser.newPage();
    const requests = [], responses = [], errors = [];
    page.on('request', request => requests.push(request.url()));
    page.on('response', response => responses.push({ url: response.url(), status: response.status() }));
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.stage0?.status), 'cold');
    const coldRequests = [...requests];
    assert.ok(!coldRequests.some(url => /wasm|engines|graphviz|libavoid/.test(url)), 'Cold browser import must not load engines');
    if (coreOnly) {
      const core = await page.evaluate(() => window.stage0);
      assert.equal(core.prototype, 'stage0-packaging-only');
      assert.equal(core.rootPrototype, core.prototype);
      assert.equal(core.missingRuntime, 'LAYOUT_RUNTIME_REQUIRED');
      assert.deepEqual(errors, []);
      return { origin, browserVersion: browser.version(), coldRequests, responses, core, errors, httpRequests };
    }
    const computation = await page.evaluate(() => window.runStage0());
    assert.equal(computation.status, 'passed', JSON.stringify(computation));
    const wasm = responses.find(response => response.url.endsWith('/layout-runtime/libavoid.wasm'));
    assert.equal(wasm?.status, 200, 'Browser must request the deployment-owned WASM over HTTP');
    assert.ok(requests.every(url => new URL(url).origin === origin), 'No CDN or external runtime requests');
    const wasmResponse = await page.request.get(wasm.url);
    const wasmBytes = await wasmResponse.body();
    assert.deepEqual([...wasmBytes.subarray(0, 4)], [0, 97, 115, 109]);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(output, 'browser.png'), fullPage: true });
    return { origin, browserVersion: browser.version(), playwrightModule: modulePath,
      executable: chromium.executablePath(), coldRequests, requests, responses, errors,
      wasm: { bytes: wasmBytes.length, magic: [...wasmBytes.subarray(0, 4)] }, computation, httpRequests };
  });
}

const results = { kind: 'stage0-feasibility-not-production', work, node: process.version, commands };
try {
  const packs = join(work, 'packs');
  await mkdir(packs);
  await run('npm', ['run', 'prepack'], root);
  const currentPack = await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packs], root);
  const currentTarball = join(packs, JSON.parse(currentPack.stdout)[0].filename);
  await cp(currentTarball, join(output, 'current-package.tgz'));
  const current = join(work, 'current');
  await manifest(current);
  await run('npm', ['install', '--ignore-scripts', '--save-exact', currentTarball, 'vite@7.1.12'], current);
  await copyTemplate('current-node.mjs', current);
  results.currentNode = await run(process.execPath, ['current-node.mjs'], current);
  await copyTemplate('current-browser.mjs', current);
  await copyTemplate('current.html', current, 'index.html');
  results.currentBrowserBuild = await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], current, { allowFailure: true });
  assert.notEqual(results.currentBrowserBuild.exitCode, 0, 'Expected the current root entry to expose its known Node builtin dependency');
  assert.match(results.currentBrowserBuild.stderr, /not exported by.*browser-external|node:|externalized/);

  const prototypeSource = join(work, 'prototype-source');
  await cp(join(templates, 'package'), prototypeSource, { recursive: true });
  await cp(join(root, 'LICENSE'), join(prototypeSource, 'LICENSE'));
  const prototypePack = await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packs], prototypeSource);
  const prototypeTarball = join(packs, JSON.parse(prototypePack.stdout)[0].filename);
  await cp(prototypeTarball, join(output, 'isolated-prototype.tgz'));
  const absent = join(work, 'without-peers');
  await manifest(absent);
  await run('npm', ['install', '--ignore-scripts', '--save-exact', prototypeTarball, 'vite@7.1.12'], absent);
  await copyTemplate('cold-node.mjs', absent);
  await copyTemplate('missing-node.mjs', absent);
  results.coldNode = await run(process.execPath, ['cold-node.mjs'], absent);
  results.missingPeers = await run(process.execPath, ['missing-node.mjs'], absent);
  results.absentTree = await run('npm', ['ls', '--all'], absent);
  await copyTemplate('cold-browser.mjs', absent, 'browser.mjs');
  await copyTemplate('cold.html', absent, 'index.html');
  results.absentBrowserBuild = await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], absent);
  results.absentBrowser = await browserProbe(absent, { coreOnly: true });

  const installed = join(work, 'with-peers');
  await manifest(installed);
  await run('npm', ['install', '--ignore-scripts', '--save-exact', prototypeTarball,
    '@hpcc-js/wasm-graphviz@1.29.2', 'libavoid-js@0.5.0-beta.5', 'vite@7.1.12'], installed);
  const installedPackage = join(installed, 'node_modules/@excalidraw-js-stage0/layout-prototype');
  assert.equal((await lstat(installedPackage)).isSymbolicLink(), false);
  await mkdir(join(installed, 'public'));
  await copyTemplate('cold-node.mjs', installed);
  await copyTemplate('prototype-node.mjs', installed);
  results.installedCold = await run(process.execPath, ['cold-node.mjs'], installed);
  results.prototypeNode = await run(process.execPath, ['prototype-node.mjs'], installed);
  results.installedTree = await run('npm', ['ls', '--all'], installed);
  await copyTemplate('browser.mjs', installed);
  await copyTemplate('index.html', installed);
  results.prototypeBrowserBuild = await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], installed);
  results.browser = await browserProbe(installed);
  assert.deepEqual(results.browser.computation.result, JSON.parse(results.prototypeNode.stdout).result,
    'Node and browser must compute the same probe geometry');
  results.distribution = await listTree(join(installed, 'dist'));
  await cp(join(installed, 'dist'), join(output, 'browser-dist'), { recursive: true });
  await cp(join(installed, 'package-lock.json'), join(output, 'prototype-consumer-lock.json'));
  await cp(join(absent, 'package-lock.json'), join(output, 'without-peers-consumer-lock.json'));
  results.packedPrototype = JSON.parse(prototypePack.stdout)[0];
  results.packedCurrent = JSON.parse(currentPack.stdout)[0];
  results.browserDeadline = await run(process.execPath, [join(templates, 'deadline-check.mjs')], work);
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, work, currentNode: 'passed', currentBrowser: 'expected unsupported root build',
    installedPrototypeNode: 'passed', installedPrototypeBrowser: 'passed', lazyAndMissingPeers: 'passed' }, null, 2));
} catch (error) {
  results.failure = { message: String(error), stack: error.stack };
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  throw error;
}
