import { layoutGraph, layoutComponent, layoutSequence } from '@kroffske/excalidraw-diagrams/graph-layout';
import { coldChecks } from './cases.mjs';

window.installedAcceptance = { status: 'cold', checks: coldChecks(layoutGraph, layoutComponent, layoutSequence) };
document.querySelector('pre').textContent = JSON.stringify(window.installedAcceptance, null, 2);
