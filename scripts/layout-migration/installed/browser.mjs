import { layoutGraph, layoutComponent, layoutSequence } from '@kroffske/excalidraw-diagrams/graph-layout';
import { coldChecks, requireValue, runtimeChecks } from './cases.mjs';

window.installedAcceptance = { status: 'cold', checks: coldChecks(layoutGraph, layoutComponent, layoutSequence) };
window.runInstalledAcceptance = async () => {
  const { createLayoutRuntime } = await import('@kroffske/excalidraw-diagrams/graph-layout/engines');
  const failures = [];
  const refuse = async (options, expected) => {
    let caught;
    try { await createLayoutRuntime(options); } catch (error) { caught = error; }
    requireValue(caught?.code === expected, `Expected ${expected}; got ${caught?.code}: ${caught}`);
    failures.push({ code: caught.code, cause: caught.cause ? String(caught.cause) : undefined });
  };
  const beforeRefusals = structuredClone(window.runtimeEffects);
  await refuse({}, 'LAYOUT_WASM_URL_REQUIRED');
  await refuse({ avoidWasmUrl: 'https://invalid.example.test/libavoid.wasm' }, 'LAYOUT_WASM_URL_INVALID');
  requireValue(JSON.stringify(beforeRefusals) === JSON.stringify(window.runtimeEffects), 'URL refusal acquired resources');
  for (const [filename, code] of [['missing.wasm', 'LAYOUT_WASM_UNAVAILABLE'],
    ['invalid.wasm', 'LAYOUT_WASM_INVALID'], ['empty.wasm', 'LAYOUT_WASM_INVALID']]) {
    await refuse({ avoidWasmUrl: `/failure/${filename}` }, code);
    requireValue(window.runtimeEffects.created.length === 0, 'Failed validation created a Blob URL');
  }
  const options = { avoidWasmUrl: new URL('/layout-runtime/libavoid.wasm', location.href) };
  const pending = createLayoutRuntime(options);
  requireValue(createLayoutRuntime(options) === pending, 'Concurrent browser runtime was not shared');
  await refuse({ avoidWasmUrl: '/conflict.wasm' }, 'LAYOUT_RUNTIME_CONFLICT');
  const runtime = await pending;
  requireValue(await createLayoutRuntime(options) === runtime, 'Ready browser runtime was not reused');
  requireValue(Object.isFrozen(runtime), 'Ready runtime is mutable');
  const checks = runtimeChecks(layoutGraph, runtime);
  await refuse({ avoidWasmUrl: '/conflict.wasm' }, 'LAYOUT_RUNTIME_CONFLICT');
  const effects = structuredClone(window.runtimeEffects);
  requireValue(effects.created.length === 1 && effects.revoked.length === 1
    && effects.created[0] === effects.revoked[0], 'Validated browser Blob was not released exactly once');
  window.installedAcceptance = { status: 'passed', failures, checks, effects };
  document.querySelector('pre').textContent = JSON.stringify(window.installedAcceptance, null, 2);
  return window.installedAcceptance;
};
document.querySelector('pre').textContent = JSON.stringify(window.installedAcceptance, null, 2);
