import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const seen = [];
registerHooks({ resolve(specifier, context, nextResolve) {
  seen.push(specifier);
  if (/wasm-graphviz|libavoid-js/.test(specifier)) throw new Error(`Unexpected eager engine: ${specifier}`);
  return nextResolve(specifier, context);
} });
const root = await import('@excalidraw-js-stage0/layout-prototype');
const core = await import('@excalidraw-js-stage0/layout-prototype/graph-layout');
assert.equal(root.prototype, core.prototype);
assert.throws(() => core.computeProbe(), error => error.code === 'LAYOUT_RUNTIME_REQUIRED');
console.log(JSON.stringify({ rootAndCoreColdImport: 'passed', missingRuntime: 'LAYOUT_RUNTIME_REQUIRED', seen }));
