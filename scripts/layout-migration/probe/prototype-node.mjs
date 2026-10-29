import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeProbe, prototype } from '@excalidraw-js-stage0/layout-prototype/graph-layout';
import { createLayoutRuntime } from '@excalidraw-js-stage0/layout-prototype/graph-layout/engines';
import { prepareLayoutAssets } from '@excalidraw-js-stage0/layout-prototype/prepare-assets';

assert.equal(prototype, 'stage0-packaging-only');
const assets = await prepareLayoutAssets(new URL('./public/layout-runtime', import.meta.url).pathname);
await assert.rejects(prepareLayoutAssets(assets.destination), /EEXIST/);
assert.throws(() => import.meta.resolve('libavoid-js/dist/libavoid.wasm'),
  error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
for (const [file, heading] of [
  ['libavoid-js-LICENSE.txt', 'GNU LESSER GENERAL PUBLIC LICENSE'],
  ['wasm-graphviz-LICENSE.txt', 'Apache License'],
]) {
  assert.ok((await readFile(new URL(`./public/layout-runtime/${file}`, import.meta.url), 'utf8')).includes(heading));
}
const runtime = await createLayoutRuntime();
const result = computeProbe(runtime);
assert.equal(await createLayoutRuntime(), runtime);
console.log(JSON.stringify({ assets, result }));
