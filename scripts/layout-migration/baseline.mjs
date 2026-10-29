import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { baselineCases } from './baseline-cases.mjs';

export const SCHEMA = 'map-layout-migration-baseline.v1';
export const DEFAULT_BASELINE = fileURLToPath(new URL('../../tests/fixtures/map-layout-migration/baseline.json', import.meta.url));

// Preserve array/Map order and absence versus null; reject lossy JSON values.
export function valueRecord(value) {
  if (value instanceof Map) return [...value].map(([key, item]) => [key, valueRecord(item)]);
  if (value instanceof Set) return [...value].map(valueRecord);
  if (Array.isArray(value)) return value.map(valueRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).map(([key, item]) => [key, valueRecord(item)]));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Cannot retain non-finite baseline value');
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new Error(`Cannot retain baseline value of type ${typeof value}`);
  }
  return value;
}

export function differences(expected, actual, path = '$') {
  if (Object.is(expected, actual)) return [];
  if (typeof expected !== typeof actual || expected === null || actual === null
    || typeof expected !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) {
    return [{ path, expected, actual }];
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...keys].flatMap(key => {
    const child = Array.isArray(expected) ? `${path}[${key}]` : `${path}.${key}`;
    if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) return [{ path: child, expected: expected[key], actual: actual[key] }];
    return differences(expected[key], actual[key], child);
  });
}

export function validateBaseline(document) {
  assert.equal(document?.schema, SCHEMA, 'Unsupported baseline schema');
  assert.equal(typeof document.provenance?.map?.revision, 'string', 'Map revision is required');
  assert.ok(document.provenance.map.revision.length > 0);
  assert.ok(Array.isArray(document.provenance.map.dirtyPaths), 'Dirty-state caveat is required');
  assert.ok(document.provenance.runtime?.engines, 'Engine versions are required');
  assert.ok(Array.isArray(document.cases) && document.cases.length > 0, 'Baseline cases are required');
  const ids = new Set();
  for (const item of document.cases) {
    assert.equal(typeof item.id, 'string');
    assert.ok(item.id.length && !ids.has(item.id), `Duplicate/empty case ID: ${item.id}`);
    ids.add(item.id);
    assert.ok(Array.isArray(item.sources) && item.sources.length > 0, `${item.id}: source provenance required`);
    assert.equal(typeof item.recipe, 'string');
    assert.equal(typeof item.operation, 'string');
    assert.ok(Object.hasOwn(item, 'input'), `${item.id}: immutable input required`);
    assert.ok(['geometry', 'error', 'validation', 'hint-check'].includes(item.result?.status), `${item.id}: unsupported result`);
    assert.equal(item.inputUnchanged, true, `${item.id}: input preservation was not checked`);
    assert.equal(item.repeatedRunEqual, true, `${item.id}: repeated equality was not checked`);
    if (item.result.status === 'geometry') {
      assert.ok(Array.isArray(item.result.layout?.boxes) && item.result.layout.boxes.length > 0, `${item.id}: boxes required`);
      assert.ok(Array.isArray(item.result.layout.orderedEdges), `${item.id}: edge order required`);
      assert.ok(Array.isArray(item.result.layout.diagnostics), `${item.id}: diagnostics required`);
      for (const [id, box] of item.result.layout.boxes) {
        assert.equal(typeof id, 'string');
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(box[key]), `${item.id}/${id}/${key}: finite geometry required`);
        assert.ok(box.width > 0 && box.height > 0, `${item.id}/${id}: positive box required`);
      }
      for (const edge of item.result.layout.orderedEdges) {
        for (const key of ['id', 'from', 'to']) assert.equal(typeof edge[key], 'string', `${item.id}: edge ${key} required`);
      }
      if (item.result.layout.edgeRoutes) for (const [id, route] of item.result.layout.edgeRoutes) {
        assert.equal(typeof id, 'string');
        assert.ok(Array.isArray(route.points) && route.points.length >= 2 && route.points.length <= 17, `${item.id}/${id}: route budget`);
        for (const point of route.points) assert.ok(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite), `${item.id}/${id}: finite route point`);
        for (const side of ['sourceSide', 'targetSide']) assert.ok(['top', 'bottom', 'left', 'right'].includes(route[side]), `${item.id}/${id}: port side required`);
        assert.ok(Array.isArray(route.labelCenter) && route.labelCenter.length === 2 && route.labelCenter.every(Number.isFinite), `${item.id}/${id}: label anchor required`);
        for (const key of ['left', 'top', 'right', 'bottom']) assert.ok(Number.isFinite(route.labelBox?.[key]), `${item.id}/${id}: label box required`);
      }
    }
  }
  valueRecord(document);
  return document;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

async function loadMap(root) {
  const load = path => import(pathToFileURL(resolve(root, path)).href);
  const require = createRequire(resolve(root, 'package.json'));
  const shared = await import(pathToFileURL(require.resolve('@kroffske/excalidraw-diagrams/graph-layout')).href);
  const [layout, skeleton, engines, contract, areas, dsl, fixtures, hints, metrics, mapTranslation] = await Promise.all([
    load('src/adapter/layout.js'), load('src/adapter/skeleton.js'), load('src/adapter/autoLayout/engines.js'),
    load('src/contract/index.js'), load('src/adapter/areas.js'),
    load('src/authoring/excalidrawDsl.js'), load('tests/chain/fixtures.js'), load('src/contract/layoutHints.js'),
    load('src/adapter/autoLayout/metrics.js'), load('src/adapter/autoLayout/shared.js'),
  ]);
  return { ...layout, ...skeleton, ...contract, ...areas, ...dsl, ...fixtures, ...hints, ...metrics,
    routeEdges: shared.routeEdges, checkPlacementHints: shared.checkPlacementHints,
    mapDiagnostic: mapTranslation.mapDiagnostic,
    engines: await engines.initLayoutEngines(), readJson: async path => JSON.parse(await readFile(resolve(root, path), 'utf8')) };
}

function layoutRecord(layout) {
  const constraints = layout.constraints;
  return valueRecord({ boxes: layout.boxes, direction: layout.direction,
    orderedEdges: layout.orderedEdges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, order: edge.order })),
    containers: layout.containers, edgeRoutes: layout.edgeRoutes && new Map([...layout.edgeRoutes].map(([id, { edge, ...route }]) => [id, route])),
    messageTop: layout.messageTop, messageGap: layout.messageGap, messageLabels: layout.messageLabels,
    constraints: constraints && { orderedGroups: constraints.orderedGroups, belowEdges: constraints.belowEdges,
      placements: constraints.placements, sidePlacements: constraints.sidePlacements, defaultInitiators: constraints.defaultInitiators },
    diagnostics: layout.diagnostics ?? [], fitComparison: layout.fitComparison });
}

function sceneRecord(elements) {
  // Retain paint order, bounds, node text tiers, lifelines and native edge labels.
  // Glyph paths and style records are outside this geometry migration baseline.
  return elements.filter(element => ['shape', 'arrow', 'lifeline'].includes(element.customData?.locusMap?.role)
    || (element.type === 'text' && element.customData?.locusMap?.kind === 'node')
    || element.id.startsWith('lm:area:')).map(element => valueRecord({
    id: element.id, type: element.type, semantic: element.customData?.locusMap,
    x: element.x, y: element.y, width: element.width, height: element.height,
    points: element.points, start: element.start, end: element.end, text: element.text, originalText: element.originalText,
    fontSize: element.fontSize, fontFamily: element.fontFamily, lineHeight: element.lineHeight,
    label: element.label && { id: element.label.id, text: element.label.text, originalText: element.label.originalText,
      fontSize: element.label.fontSize, fontFamily: element.label.fontFamily },
  }));
}

function expectedError(run, code) {
  try { run(); } catch (error) {
    assert.equal(error.code, code, `Unexpected error: ${error.message}`);
    return valueRecord({ status: 'error', name: error.name, code: error.code, message: error.message, diagnostics: error.diagnostics });
  }
  throw new Error(`Expected ${code} refusal did not occur`);
}

function captureCase(map, item) {
  const input = freeze(structuredClone(item.input));
  const before = structuredClone(input);
  const op = item.operation;
  let result;
  if (op === 'missing-engines') result = expectedError(() => map.layoutModel(input), 'LAYOUT_ENGINES_REQUIRED');
  else if (op === 'hint-conflict') result = expectedError(() => map.layoutModel(input, map.engines), 'HINT_CONFLICT');
  else if (op === 'route-point-limit') result = expectedError(() => map.layoutModel(input, map.engines), 'ROUTE_POINT_LIMIT');
  else if (op === 'port-capacity') {
    result = expectedError(() => map.routeEdges(new Map(input.boxes), input.edges,
      { Avoid: map.engines.Avoid, nodes: input.nodes.map(node => ({ id: node.id, shape: node.kind === 'decision' ? 'diamond' : 'rectangle' })) }), 'PORT_CAPACITY_EXCEEDED');
    // Compare the retained Map-facing shape through its real translation owner;
    // generic subject IDs are checked separately by the public API regressions.
    result.diagnostics = result.diagnostics.map(map.mapDiagnostic);
  }
  else if (op === 'validate') {
    const validation = map.validateModel(input);
    assert.equal(validation.valid, false, 'Budget violation must be refused');
    result = { status: 'validation', ...validation };
  } else if (op === 'check-hints') {
    const layout = map.layoutModel(input.model, map.engines);
    layout.boxes.get(input.movedNode).y = input.y;
    const diagnostics = map.checkPlacementHints(layout.boxes, map.compileLayoutHints(input.model), 'error').map(map.mapDiagnostic);
    assert.ok(diagnostics.some(item => item.code === 'PLACEMENT_HINT_UNMET' && item.severity === 'error'));
    result = { status: 'hint-check', boxes: valueRecord(layout.boxes), diagnostics };
  } else {
    let model = input;
    if (op === 'compose-areas') model = map.composeDslModel(input, ({ nodes, layout }) => layout.area({ id: 'whole', title: 'Processing boundary' },
      layout.row({ actor: layout.area({ id: 'outside', title: 'Input' }, nodes.actor),
        inside: layout.area({ id: 'inside', title: 'Processing' }, layout.column({ system: nodes.system, api: nodes.api, store: nodes.store }, { gap: 180 })),
      }, { gap: 300 })));
    let engines = op === 'explicit-scene' ? undefined : map.engines;
    if (op === 'no-placement-scene') engines = { ...engines, graphviz: { layout() { throw new Error('Complete pins must bypass Graphviz'); } } };
    if (op === 'reference-failure') {
      let requests = 0;
      engines = { ...engines, graphviz: { layout(...args) {
        if (++requests === 2) throw new Error('reference engine unavailable');
        return map.engines.graphviz.layout(...args);
      } } };
    }
    const layout = map.layoutModel(model, engines);
    result = { status: 'geometry', layout: layoutRecord(layout) };
    if (op === 'compose-areas') result.composedModel = model;
    if (op !== 'reference-failure') {
      let diagnostics;
      const elements = map.createSceneSkeleton(model, engines, { onLayoutDiagnostics: value => { diagnostics = value; } });
      assert.deepEqual(diagnostics, layout.diagnostics ?? [], `${item.id}: callback diagnostics disagree with layout`);
      result.scene = sceneRecord(elements);
      result.areas = valueRecord(map.areaGeometries(model, layout.boxes));
      result.areaDiagnostics = map.inspectAreaLayout(model, elements);
      if (model.layout.family === 'semantic' || model.layout.family === 'decision') {
        result.quality = valueRecord(map.inspectC4Layout(model, elements, { viewport: { width: 1898, height: 909 } }));
      }
    }
  }
  assert.deepEqual(input, before, `${item.id}: capture mutated its source input`);
  return valueRecord(result);
}

export function parseGitStatus(stdout) {
  // The first two porcelain columns are status, including meaningful spaces.
  return stdout.split(/\r?\n/).filter(line => line !== '');
}

async function provenance(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const require = createRequire(resolve(root, 'package.json'));
  const engines = {};
  for (const name of ['@hpcc-js/wasm-graphviz', 'libavoid-js', '@excalidraw/excalidraw', '@kroffske/excalidraw-diagrams']) {
    // Read the installed package, including packages that do not export package.json.
    let directory = dirname(require.resolve(name));
    for (;;) {
      try {
        const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
        if (pkg.name === name) { engines[name] = pkg.version; break; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const parent = dirname(directory);
      if (parent === directory) throw new Error(`Installed package metadata not found: ${name}`);
      directory = parent;
    }
  }
  return { map: { revision: git('rev-parse', 'HEAD').trimEnd(), branch: git('branch', '--show-current').trimEnd(),
    dirtyPaths: parseGitStatus(git('status', '--porcelain=v1')),
    caveat: 'Results use this working tree, including listed uncommitted changes; revision alone does not reproduce dirty sources.' },
    runtime: { node: process.version, platform: process.platform, arch: process.arch, engines },
    policy: { viewport: { width: 1898, height: 909 }, sideFitWarningDrop: 0.2,
      comparison: 'Exact domain values and array order; object key order is immaterial; no digest pins.',
      scope: 'Node pipeline and official skeleton only; no official conversion, browser, renderer, PNG or visual-quality proof.' },
    pipelineSources: ['src/adapter/layout.js', 'src/adapter/skeleton.js', 'src/adapter/areas.js', 'src/adapter/autoLayout/shared.js',
      '@kroffske/excalidraw-diagrams/graph-layout',
      'src/adapter/autoLayout/metrics.js', 'src/contract/layoutHints.js', 'src/authoring/excalidrawDsl.js'] };
}

export async function captureBaseline(mapRoot) {
  const root = resolve(mapRoot);
  const map = await loadMap(root);
  const cases = [];
  for (const item of await baselineCases(map)) {
    const result = captureCase(map, item);
    assert.deepEqual(captureCase(map, item), result, `${item.id}: repeated capture differs`);
    cases.push({ ...item, result, inputUnchanged: true, repeatedRunEqual: true });
  }
  return validateBaseline({ schema: SCHEMA, provenance: await provenance(root), cases });
}

export async function createBaseline(path, document) {
  validateBaseline(document);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
}

export function compareBaselines(expected, actual) {
  validateBaseline(expected);
  validateBaseline(actual);
  return [...differences(expected.provenance.runtime.engines, actual.provenance.runtime.engines, '$.provenance.runtime.engines'),
    ...differences(expected.provenance.policy, actual.provenance.policy, '$.provenance.policy'),
    ...differences(expected.cases, actual.cases, '$.cases')];
}

export async function main(args) {
  let mapRoot;
  let output = DEFAULT_BASELINE;
  let create = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--create') create = true;
    else if ((arg === '--map-root' || arg === '--baseline') && args[index + 1] && !args[index + 1].startsWith('--')) {
      const value = args[++index];
      if (arg === '--map-root') mapRoot = value;
      else output = resolve(value);
    } else throw new Error(`Unknown/incomplete argument: ${arg}`);
  }
  if (!mapRoot) throw new Error('Usage: node scripts/layout-migration/baseline.mjs --map-root <Map checkout> [--baseline <file>] [--create]');
  // Read first: a missing baseline in check mode must never start creation.
  const expected = create ? undefined : validateBaseline(JSON.parse(await readFile(output, 'utf8')));
  const actual = await captureBaseline(mapRoot);
  if (create) {
    await createBaseline(output, actual);
    console.log(`Created ${actual.cases.length} repeatable cases: ${output}`);
  } else {
    const changed = compareBaselines(expected, actual);
    if (changed.length) {
      console.error(JSON.stringify({ status: 'mismatch', differences: changed.slice(0, 30), total: changed.length }, null, 2));
      return 1;
    }
    console.log(`PASS: ${actual.cases.length} baseline cases; repeated equality and immutable inputs verified.`);
    if (differences(expected.provenance.map, actual.provenance.map).length) console.log('Source provenance changed; retained semantic and geometry values still match.');
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  });
}
