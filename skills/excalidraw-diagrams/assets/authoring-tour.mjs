import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Scene, diagram, buildDiagramSpec } from '@kroffske/excalidraw-diagrams';

/** One fictional dataset, explicitly mapped to each existing API's own fields. */
export function authoringTour({ edited = false } = {}) {
  const components = [
    { id: 'api', name: edited ? 'Validated orders API' : 'Orders API',
      description: edited ? 'Validates orders before dispatch.' : 'Accepts orders for processing.', technology: 'Node.js' },
    { id: 'worker', name: 'Order worker', description: 'Processes orders and reports completion.', technology: 'Node.js' },
  ];
  const relationship = { id: 'submit', from: 'api', to: 'worker',
    description: edited ? 'Submits validated order' : 'Submits order', technology: 'Queue' };
  const c4 = buildDiagramSpec({
    template: 'c4.container', title: 'Order service structure', palette: 'c4-blue',
    system: { id: 'orders', name: 'Order service', description: 'Owns order intake and processing.', containers: components },
    relationships: [relationship],
  }, { seed: 42 });
  if (!c4.ok) throw new Error(JSON.stringify(c4.diagnostics));

  const flow = new Scene({ seed: 42 });
  const graph = diagram.flow(flow, { title: 'Order handoff', defaults: { layout: { preset: 'lr-flow' }, node: { strict: true } } });
  for (const component of components) graph.node(component.id, { title: component.name, bullets: [component.description] });
  graph.row('handoff', components.map(component => component.id));
  graph.edge(relationship.from, relationship.to, { id: relationship.id, label: relationship.description, kind: 'primary' });
  graph.layout();
  graph.assertHealthy();
  return { components, relationship, c4, flow };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ options: { edited: { type: 'boolean' } }, allowPositionals: true });
  if (positionals.length !== 1) throw new Error('Usage: node authoring-tour.mjs NEW-OUTPUT-DIRECTORY [--edited]');
  const result = authoringTour({ edited: values.edited });
  const output = resolve(positionals[0]);
  await mkdir(output);
  result.c4.scene.write(join(output, 'structure.excalidraw'));
  result.flow.write(join(output, 'handoff.excalidraw'));
  await writeFile(join(output, 'authored-data.json'), JSON.stringify({ components: result.components, relationship: result.relationship }, null, 2) + '\n');
  console.log(JSON.stringify({ output, scenes: ['structure.excalidraw', 'handoff.excalidraw'] }));
}
