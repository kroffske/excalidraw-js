import assert from 'node:assert/strict';
import { Scene, diagram, fitText } from '@kroffske/excalidraw-diagrams';
import { Bounds } from '@kroffske/excalidraw-diagrams/layout';

const scene = new Scene({ seed: 20261023 });
const flow = diagram.flow(scene, { title: 'Installed tarball probe' });
flow.node('a', { title: 'Source' });
flow.node('b', { title: 'Target' });
flow.row('nodes', ['a', 'b']);
flow.edge('a', 'b', { label: 'installed' });
flow.layout();
const document = scene.toObject();
assert.ok(document.elements.length > 2);
assert.ok(document.elements.every(element => Number.isFinite(element.x) && Number.isFinite(element.y)));
assert.ok(fitText('Installed public API', { width: 200 }).lines.length > 0);
assert.ok(new Bounds(0, 0, 20, 10));
console.log(JSON.stringify({ package: '@kroffske/excalidraw-diagrams', elements: document.elements.length, publicApi: 'executed' }));
