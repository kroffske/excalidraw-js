import assert from 'node:assert/strict';
import { createLayoutRuntime } from '@kroffske/excalidraw-diagrams/graph-layout/engines';

await assert.rejects(createLayoutRuntime(), error => {
  assert.equal(error.code, 'LAYOUT_RUNTIME_INITIALIZATION_FAILED');
  assert.equal(error.cause?.code, 'ERR_MODULE_NOT_FOUND');
  return true;
});
console.log(JSON.stringify({ missingPeers: 'explicit initialization refusal', status: 'passed' }));
