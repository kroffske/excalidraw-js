import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { layoutGraph, layoutComponent, layoutSequence } from '@kroffske/excalidraw-diagrams/graph-layout';
import { createLayoutRuntime } from '@kroffske/excalidraw-diagrams/graph-layout/engines';
import { prepareLayoutAssets } from '@kroffske/excalidraw-diagrams/graph-layout/prepare-assets';
import { coldChecks, runtimeChecks } from './cases.mjs';

const require = createRequire(import.meta.url);
const mode = process.argv[2];
assert.ok(['default', 'prepared'].includes(mode));
const cold = coldChecks(layoutGraph, layoutComponent, layoutSequence);
const runtimeErrors = [];
let assets;
let options = {};
if (mode === 'prepared') {
  await mkdir('public');
  assets = await prepareLayoutAssets(join(process.cwd(), 'public/layout-runtime'));
  assert.deepEqual(assets.assets, ['libavoid.wasm', 'libavoid-js-LICENSE.txt', 'wasm-graphviz-LICENSE.txt']);
  await assert.rejects(prepareLayoutAssets(assets.destination), { code: 'EEXIST' });
  for (const [peer, filename] of [['libavoid-js', 'libavoid-js-LICENSE.txt'],
    ['@hpcc-js/wasm-graphviz', 'wasm-graphviz-LICENSE.txt']]) {
    const upstream = join(dirname(dirname(require.resolve(peer))), 'LICENSE');
    assert.deepEqual(await readFile(join(assets.destination, filename)), await readFile(upstream));
  }
  assert.throws(() => import.meta.resolve('libavoid-js/dist/libavoid.wasm'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  for (const [filename, bytes, code] of [
    ['missing.wasm', undefined, 'LAYOUT_RUNTIME_INITIALIZATION_FAILED'],
    ['invalid.wasm', Buffer.from('not WebAssembly'), 'LAYOUT_WASM_INVALID'],
    ['empty.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]), 'LAYOUT_WASM_INVALID'],
  ]) {
    if (bytes) await writeFile(filename, bytes, { flag: 'wx' });
    await assert.rejects(createLayoutRuntime({ avoidWasmUrl: join(process.cwd(), filename) }), error => {
      assert.equal(error.code, code);
      if (!bytes) assert.equal(error.cause?.code, 'ENOENT');
      runtimeErrors.push({ filename, code: error.code, causeCode: error.cause?.code });
      return true;
    });
    assert.deepEqual(await readdir(tmpdir()), [], 'Failed preparation left temporary files');
  }
  options = { avoidWasmUrl: new URL('./public/layout-runtime/libavoid.wasm', import.meta.url) };
}
const pending = createLayoutRuntime(options);
assert.equal(createLayoutRuntime(options), pending, 'Concurrent initialization must share the promise');
await assert.rejects(createLayoutRuntime({ avoidWasmUrl: join(process.cwd(), 'conflict.wasm') }), { code: 'LAYOUT_RUNTIME_CONFLICT' });
const runtime = await pending;
assert.equal(await createLayoutRuntime(options), runtime);
assert.ok(Object.isFrozen(runtime));
assert.deepEqual(await readdir(tmpdir()), [], 'Successful initialization left its snapshot behind');
const checks = runtimeChecks(layoutGraph, runtime);
await assert.rejects(createLayoutRuntime({ avoidWasmUrl: join(process.cwd(), 'conflict.wasm') }), { code: 'LAYOUT_RUNTIME_CONFLICT' });
console.log(JSON.stringify({ status: 'passed', mode, assets, cold, runtimeErrors, checks }));
