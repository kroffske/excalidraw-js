#!/usr/bin/env node
// Actual Stage 2 distribution with retained Stage 1 coverage; Stage 0 evidence stays separate.
// Usage: node scripts/layout-migration/verify-installed.mjs --output <new-directory>
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withBrowserSession } from './probe/browser-session.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const templates = join(root, 'scripts/layout-migration/installed');
const args = process.argv.slice(2);
assert.equal(args.length, 2, 'Usage: --output <new-directory>');
assert.equal(args[0], '--output', 'Usage: --output <new-directory>');
const output = resolve(args[1]);
const allowed = ['stage1', 'stage2'].map(stage => join(root, `.local/layout-migration-${stage}/installed`) + sep);
assert.ok(allowed.some(directory => output.startsWith(directory)), `Output must be a new directory under ${allowed.join(' or ')}`);
await mkdir(dirname(output), { recursive: true });
assert.equal(await realpath(dirname(output)), dirname(output), 'Evidence parent must not be linked');
await mkdir(output);
const work = await realpath(await mkdtemp(join(tmpdir(), 'excalidraw-layout-stage2-installed-')));
const commands = [];
const results = { kind: 'stage2-actual-installed-package', retainedCoverage: 'stage1-runtime-and-failures',
  work, node: process.version, commands };

async function run(command, argv, cwd, env = {}) {
  const record = { command, argv, cwd };
  const log = `${String(commands.length + 1).padStart(2, '0')}-${command.split('/').at(-1)}.json`;
  commands.push({ ...record, log });
  const started = Date.now();
  const child = spawn(command, argv, { cwd, detached: process.platform !== 'win32',
    env: { ...process.env, NODE_PATH: '', npm_config_update_notifier: 'false', npm_config_audit: 'false',
      npm_config_fund: 'false', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', failure, forced;
  const stop = () => {
    const signal = kind => {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, kind); }
      catch (error) { if (error.code !== 'ESRCH') failure ??= error; }
    };
    signal('SIGTERM');
    forced = setTimeout(() => signal('SIGKILL'), 1_000);
  };
  const timer = setTimeout(() => { failure = new Error('Subprocess exceeded 180000 ms'); stop(); }, 180_000);
  const capture = field => bytes => {
    const remaining = 16 * 1024 * 1024 - stdout.length - stderr.length;
    if (remaining <= 0) return;
    const chunk = String(bytes);
    if (field === 'stdout') stdout += chunk.slice(0, remaining);
    else stderr += chunk.slice(0, remaining);
    if (!failure && chunk.length >= remaining) {
      failure = new Error('Subprocess exceeded 16 MiB output limit');
      stop();
    }
  };
  child.stdout.on('data', capture('stdout'));
  child.stderr.on('data', capture('stderr'));
  const outcome = await new Promise(resolveExit => {
    child.on('error', error => { failure = error; });
    child.on('close', (exitCode, signal) => resolveExit({ exitCode, signal }));
  });
  clearTimeout(timer);
  clearTimeout(forced);
  Object.assign(record, outcome, { elapsedMs: Date.now() - started, stdout, stderr, error: failure ? String(failure) : undefined });
  Object.assign(commands.at(-1), record);
  await writeFile(join(output, log), JSON.stringify(record, null, 2));
  assert.ok(!failure && outcome.exitCode === 0,
    `${command} ${argv.join(' ')} failed (${outcome.exitCode}); ${log}\n${failure ?? ''}\n${stderr}\n${stdout}`);
  console.log(`Passed ${log}`);
  return record;
}

async function consumer(name, dependencies) {
  const directory = join(work, name);
  await mkdir(directory);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }, null, 2));
  await mkdir(join(directory, 'temporary'));
  for (const filename of ['cases.mjs', 'vite.config.mjs', 'index.html']) await cp(join(templates, filename), join(directory, filename));
  // Optional peers are not auto-installed; retain Vite/Rollup's own platform dependencies.
  await run('npm', ['install', '--ignore-scripts'], directory);
  const packageDirectory = join(directory, 'node_modules/@kroffske/excalidraw-diagrams');
  assert.equal((await lstat(packageDirectory)).isSymbolicLink(), false, 'Installed library must not be linked');
  assert.equal(await realpath(packageDirectory), packageDirectory, 'Installed package must resolve inside its clean consumer');
  return directory;
}

async function tree(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = join(prefix, entry.name), path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await tree(path, name));
    else files.push({ path: name, bytes: (await stat(path)).size });
  }
  return files;
}

async function browserChecks(directory, { coldOnly = false } = {}) {
  const playwrightModule = process.env.LAYOUT_PROBE_PLAYWRIGHT
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const { chromium } = createRequire(import.meta.url)(playwrightModule);
  const dist = join(directory, 'dist'), httpRequests = [];
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const path = resolve(dist, '.' + pathname);
    const respond = (status, bytes, contentType = 'application/octet-stream') => {
      httpRequests.push({ path: pathname, status, bytes: bytes?.length ?? 0, contentType });
      response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' }).end(bytes);
    };
    if (path !== dist && !path.startsWith(dist + sep)) { respond(403); return; }
    if (pathname === '/failure/invalid.wasm') { respond(200, Buffer.from('not WebAssembly'), 'application/wasm'); return; }
    if (pathname === '/failure/empty.wasm') { respond(200, Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]), 'application/wasm'); return; }
    try {
      const file = path === dist ? join(dist, 'index.html') : path;
      respond(200, await readFile(file), ({ '.wasm': 'application/wasm', '.js': 'text/javascript',
        '.html': 'text/html', '.txt': 'text/plain' })[extname(file)]);
    } catch (error) {
      if (error.code !== 'ENOENT') { respond(500, Buffer.from(String(error))); return; }
      respond(404);
    }
  });
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return withBrowserSession(server, chromium, async browser => {
    const page = await browser.newPage(), requests = [], responses = [], errors = [], external = [];
    page.on('request', request => requests.push(request.url()));
    page.on('response', response => responses.push({ url: response.url(), status: response.status() }));
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (new URL(url).origin !== origin) { external.push(url); await route.abort(); }
      else await route.continue();
    });
    await page.addInitScript(() => {
      window.runtimeEffects = { fetches: [], created: [], revoked: [], wasmCalls: [] };
      const fetch = window.fetch.bind(window);
      window.fetch = (...args) => { window.runtimeEffects.fetches.push(String(args[0])); return fetch(...args); };
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = value => { const url = create(value); window.runtimeEffects.created.push(url); return url; };
      URL.revokeObjectURL = url => { window.runtimeEffects.revoked.push(url); return revoke(url); };
      for (const name of ['compile', 'compileStreaming', 'instantiate', 'instantiateStreaming']) {
        const operation = WebAssembly[name].bind(WebAssembly);
        WebAssembly[name] = (...args) => { window.runtimeEffects.wasmCalls.push(name); return operation(...args); };
      }
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    const cold = await page.evaluate(() => window.installedAcceptance);
    assert.equal(cold?.status, 'cold', JSON.stringify(errors));
    const coldEffects = await page.evaluate(() => structuredClone(window.runtimeEffects));
    assert.deepEqual(coldEffects, { fetches: [], created: [], revoked: [], wasmCalls: [] },
      'Cold browser geometry fetched resources or initialized a runtime');
    const coldRequests = [...requests];
    assert.ok(!coldRequests.some(url => /engines|graphviz|libavoid|\.wasm/.test(url)), 'Cold browser imported engines');
    const inventory = JSON.parse(await readFile(join(dist, 'module-inventory.json'), 'utf8'));
    const loaded = new Set(coldRequests.map(url => new URL(url).pathname.slice(1)));
    const coldModules = inventory.filter(chunk => loaded.has(chunk.file)).flatMap(chunk => chunk.modules);
    assert.ok(!coldModules.some(id => /node_modules\/(?:@hpcc-js\/wasm-graphviz|libavoid-js)\//.test(id)
      || /\/graph-layout\/engines(?:-core|-node)?\.js$/.test(id)), 'Cold-loaded chunks contain engine modules');
    let computation;
    if (!coldOnly) {
      computation = await page.evaluate(() => window.runInstalledAcceptance());
      assert.equal(computation.status, 'passed');
      assert.deepEqual(httpRequests.filter(item => item.path.startsWith('/failure/')).map(item => [item.path, item.status]),
        [['/failure/missing.wasm', 404], ['/failure/invalid.wasm', 200], ['/failure/empty.wasm', 200]]);
      const wasm = httpRequests.filter(item => item.path === '/layout-runtime/libavoid.wasm');
      assert.equal(wasm.length, 1, 'Validated WASM must be acquired over HTTP exactly once');
      assert.equal(wasm[0].status, 200);
      assert.ok(wasm[0].bytes > 8);
      assert.ok(!httpRequests.some(item => item.path === '/conflict.wasm'), 'Runtime conflict acquired a resource');
    }
    assert.deepEqual(external, [], 'No external/CDN runtime requests');
    assert.deepEqual(errors, [], 'Unhandled browser errors');
    const name = coldOnly ? 'without-peers' : 'with-peers';
    await page.screenshot({ path: join(output, `${name}-browser.png`), fullPage: true });
    return { origin, browserVersion: browser.version(), playwrightModule, executable: chromium.executablePath(),
      cold, coldEffects, coldRequests, coldModules, requests, responses, errors, external, computation, httpRequests };
  }, { deadlineMs: 45_000 });
}

try {
  const packs = join(work, 'packs');
  await mkdir(packs);
  await run('npm', ['run', 'prepack'], root);
  const pack = JSON.parse((await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packs], root)).stdout)[0];
  const tarball = join(packs, pack.filename);
  await cp(tarball, join(output, 'package.tgz'));
  // npm's generated integrity fields are packaging metadata, not acceptance pins.
  results.package = { name: pack.name, version: pack.version, filename: pack.filename, size: pack.size,
    unpackedSize: pack.unpackedSize, files: pack.files };
  for (const path of ['dist/graph-layout/index.js', 'dist/graph-layout/component.js', 'dist/graph-layout/component.d.ts',
    'dist/graph-layout/sequence.js', 'dist/graph-layout/sequence.d.ts', 'dist/graph-layout/engines.js',
    'dist/graph-layout/engines-node.js', 'dist/graph-layout/prepare-assets.js']) {
    assert.ok(pack.files.some(file => file.path === path), `Tarball omitted ${path}`);
  }
  const base = { '@kroffske/excalidraw-diagrams': `file:${tarball}`, vite: '5.4.21' };
  const absent = await consumer('without-peers', base);
  for (const peer of ['@hpcc-js/wasm-graphviz', 'libavoid-js']) {
    await assert.rejects(lstat(join(absent, 'node_modules', peer)), { code: 'ENOENT' });
  }
  for (const name of ['cold.mjs', 'cold-loader.mjs', 'missing-peers.mjs']) await cp(join(templates, name), join(absent, name));
  const resolutions = join(output, 'cold-node-resolutions.jsonl');
  results.coldNode = JSON.parse((await run(process.execPath, ['--experimental-loader', pathToFileURL(join(absent, 'cold-loader.mjs')).href, 'cold.mjs'],
    absent, { LAYOUT_ACCEPTANCE_RESOLUTIONS: resolutions })).stdout);
  results.missingPeers = JSON.parse((await run(process.execPath, ['missing-peers.mjs'], absent)).stdout);
  await cp(join(templates, 'cold-browser.mjs'), join(absent, 'browser.mjs'));
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], absent);
  results.coldBrowser = await browserChecks(absent, { coldOnly: true });
  assert.deepEqual(results.coldBrowser.cold.checks, results.coldNode.checks, 'Engine-free Node/browser values differ');
  await cp(join(absent, 'dist'), join(output, 'without-peers-browser-dist'), { recursive: true });
  const installed = await consumer('with-peers', { ...base,
    '@hpcc-js/wasm-graphviz': '1.29.2', 'libavoid-js': '0.5.0-beta.5' });
  for (const peer of ['@hpcc-js/wasm-graphviz', 'libavoid-js']) {
    const path = join(installed, 'node_modules', peer);
    assert.equal((await lstat(path)).isSymbolicLink(), false, 'Engine peers must be installed locally');
    assert.equal(await realpath(path), path);
  }
  for (const name of ['cold.mjs', 'cold-loader.mjs']) await cp(join(templates, name), join(installed, name));
  results.withPeersColdNode = JSON.parse((await run(process.execPath,
    ['--experimental-loader', pathToFileURL(join(installed, 'cold-loader.mjs')).href, 'cold.mjs'], installed,
    { LAYOUT_ACCEPTANCE_RESOLUTIONS: join(output, 'with-peers-cold-node-resolutions.jsonl') })).stdout);
  assert.deepEqual(results.withPeersColdNode, results.coldNode, 'Installed peers changed cold Node geometry or effects');
  await cp(join(templates, 'node.mjs'), join(installed, 'node.mjs'));
  const environment = { TMPDIR: join(installed, 'temporary'), TMP: join(installed, 'temporary'), TEMP: join(installed, 'temporary') };
  results.defaultNode = JSON.parse((await run(process.execPath, ['node.mjs', 'default'], installed, environment)).stdout);
  results.preparedNode = JSON.parse((await run(process.execPath, ['node.mjs', 'prepared'], installed, environment)).stdout);
  assert.deepEqual(results.defaultNode.checks, results.preparedNode.checks, 'Default and prepared Node values differ');
  assert.deepEqual(results.defaultNode.cold, results.coldNode.checks, 'Default runtime consumer changed cold geometry');
  assert.deepEqual(results.preparedNode.cold, results.coldNode.checks, 'Prepared runtime consumer changed cold geometry');
  await cp(join(templates, 'browser.mjs'), join(installed, 'browser.mjs'));
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], installed);
  results.browser = await browserChecks(installed);
  assert.deepEqual(results.browser.cold.checks, results.coldNode.checks, 'Installed cold consumers differ');
  assert.deepEqual(results.browser.computation.checks, results.preparedNode.checks, 'Real installed Node/browser geometry or resource outcomes differ');
  const publicAssets = join(installed, 'public/layout-runtime');
  for (const name of results.preparedNode.assets.assets) {
    assert.deepEqual(await readFile(join(installed, 'dist/layout-runtime', name)), await readFile(join(publicAssets, name)),
      `Production distribution changed prepared asset ${name}`);
  }
  results.distribution = await tree(join(installed, 'dist'));
  await cp(join(installed, 'dist'), join(output, 'browser-dist'), { recursive: true });
  for (const [name, directory] of [['with-peers', installed], ['without-peers', absent]]) {
    await cp(join(directory, 'package-lock.json'), join(output, `${name}-package-lock.json`));
    await run('npm', ['ls', '--all'], directory);
  }
  results.status = 'passed';
  console.log(JSON.stringify({ status: results.status, output, work, package: results.package.name,
    node: process.version, browser: results.browser.browserVersion, installedNodeBrowserParity: 'passed' }, null, 2));
} catch (error) {
  results.status = 'failed';
  results.failure = { message: String(error), stack: error.stack };
  throw error;
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
}
