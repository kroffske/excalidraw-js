import assert from 'node:assert/strict';
import { createLayoutRuntime } from '@excalidraw-js-stage0/layout-prototype/graph-layout/engines';

let previous;
for (let attempt = 1; attempt <= 2; attempt += 1) {
  const pending = createLayoutRuntime();
  assert.notEqual(pending, previous, 'An initialization failure must allow a fresh attempt');
  await assert.rejects(pending, error => {
    assert.equal(error.cause.code, 'ERR_MODULE_NOT_FOUND');
    return true;
  });
  previous = pending;
}
console.log(JSON.stringify({ optionalPeersAbsent: true, initializationAttempts: 2, retryableFailure: 'passed' }));
