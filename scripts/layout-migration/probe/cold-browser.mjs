import { prototype as rootPrototype } from '@excalidraw-js-stage0/layout-prototype';
import { computeProbe, prototype } from '@excalidraw-js-stage0/layout-prototype/graph-layout';

let missingRuntime;
try { computeProbe(); } catch (error) { missingRuntime = error.code; }
window.stage0 = { status: 'cold', prototype, rootPrototype, missingRuntime };
document.body.textContent = JSON.stringify(window.stage0);
