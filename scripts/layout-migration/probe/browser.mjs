import { computeProbe, prototype } from '@excalidraw-js-stage0/layout-prototype/graph-layout';

window.stage0 = { status: 'cold', prototype };
window.runStage0 = async () => {
  try {
    const { createLayoutRuntime } = await import('@excalidraw-js-stage0/layout-prototype/graph-layout/engines');
    const runtime = await createLayoutRuntime({ avoidWasmUrl: new URL('./layout-runtime/libavoid.wasm', location.href).href });
    const result = computeProbe(runtime);
    window.stage0 = { status: 'passed', result };
  } catch (error) {
    window.stage0 = { status: 'failed', error: String(error), cause: String(error.cause) };
  }
  document.querySelector('pre').textContent = JSON.stringify(window.stage0, null, 2);
  return window.stage0;
};
document.querySelector('button').addEventListener('click', window.runStage0);
