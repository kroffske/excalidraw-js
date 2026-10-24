// Fixture recipes follow the cited Map tests; Map remains the implementation owner.
export async function baselineCases(map) {
  const semanticPath = 'tests/fixtures/layouts/semantic.json';
  const hintsTest = 'tests/adapter/auto-layout/placement-hints.test.js';
  const automaticTest = 'tests/adapter/auto-layout/auto-layout.test.js';
  const semantic = await map.readJson(semanticPath);
  const cases = [];
  const add = (id, input, sources, recipe, operation = 'scene') => {
    cases.push({ id, sources, recipe, operation, input });
  };
  for (const family of ['semantic', 'decision', 'component', 'sequence']) {
    const path = `tests/fixtures/layouts/${family}.json`;
    add(`${family}-automatic`, await map.readJson(path), [path], 'Unmodified retained layout fixture.');
  }
  const algoPath = 'tests/fixtures/auto-layout/algo-integrated.json';
  add('semantic-algo', await map.readJson(algoPath), [algoPath, automaticTest],
    'Unmodified automatic C4 threshold fixture.');

  const explicitPath = 'tests/fixtures/explicit-layout/overview.json';
  add('explicit-positions-and-routes', await map.readJson(explicitPath),
    [explicitPath, 'tests/adapter/explicit-layout.test.js'],
    'Unmodified complete authored positions and manual route sides/waypoints; no engines supplied.', 'explicit-scene');

  const pinned = structuredClone(semantic);
  pinned.layout = { family: 'semantic', direction: 'LR', nodeHints: { client: { order: 0 } },
    hints: [{ node: 'client', place: 'left' }] };
  const positions = model => Object.fromEntries([...map.layoutModel(model, map.engines).boxes]
    .map(([id, box]) => [id, { x: box.x, y: box.y }]));
  const pins = positions(pinned);
  pins.client = { x: 5000, y: 80 };
  for (const mode of ['partial', 'complete']) {
    const input = structuredClone(pinned);
    input.layout.positions = mode === 'partial' ? { client: pins.client } : pins;
    add(`${mode}-pins-unmet-hint`, input, [semanticPath, hintsTest],
      'Retain exact client pin at (5000,80); unmet left hint warns. Other complete pins come from current automatic layout.',
      mode === 'complete' ? 'no-placement-scene' : 'scene');
  }

  const side = structuredClone(semantic);
  side.layout = { family: 'semantic', hints: [{ row: ['api', 'worker', 'store'] }, { node: 'client', place: 'left' }] };
  add('side-fit-measured', side, [semanticPath, hintsTest], 'Side fit comparison with a measured drop above twenty percent.');
  const sidePins = structuredClone(side);
  sidePins.layout.positions = positions(side);
  add('side-fit-unverified', sidePins, [semanticPath, hintsTest], 'Complete automatic positions retained as pins; side fit cannot become a pass.', 'no-placement-scene');
  const unavailable = structuredClone(semantic);
  unavailable.layout = { family: 'semantic', hints: [{ node: 'client', place: 'left' }] };
  add('side-fit-unavailable', unavailable, [semanticPath, hintsTest],
    'Inject failure only into the second Graphviz request (the fit reference); actual placement/routing use real engines.', 'reference-failure');

  const synthetic = map.syntheticModel();
  add('nested-dsl-areas', synthetic, ['tests/chain/fixtures.js', 'tests/authoring/structured-dsl.test.js', 'src/authoring/excalidrawDsl.js'],
    'Use the retained whole/outside/inside area recipe, row gap 300 and inner column gap 180.', 'compose-areas');
  add('missing-engines', semantic, [semanticPath, automaticTest], 'Call fresh semantic layout without engines.', 'missing-engines');
  const conflict = structuredClone(semantic);
  conflict.edges = [];
  conflict.layout.hints = [{ node: 'api', place: 'bottom' }, { node: 'worker', below: 'api' }];
  add('conflicting-extreme-hints', conflict, [semanticPath, automaticTest], 'Bottom api conflicts with worker below api.', 'hint-conflict');
  add('automatic-unmet-hint-error', { model: { ...structuredClone(semantic), layout: { family: 'semantic', hints: [{ node: 'api', place: 'top' }] } },
    movedNode: 'api', y: 5000 }, [semanticPath, hintsTest], 'Move final api box to y=5000 and validate automatic hints with error severity.', 'check-hints');
  add('port-capacity-refusal', {
    boxes: [['a', { x: 0, y: 0, width: 4, height: 4 }], ['b', { x: 100, y: 0, width: 4, height: 4 }], ['c', { x: 100, y: 20, width: 4, height: 4 }]],
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c' }],
  }, [automaticTest], 'Two exclusive ports cannot fit on the tiny source card; use real Avoid runtime.', 'port-capacity');
  const tooManyPoints = await map.readJson(explicitPath);
  tooManyPoints.layout.routes['e-engine-market'].waypoints = Array.from({ length: 17 }, (_, index) => ({ x: index, y: 0 }));
  add('authored-waypoint-budget', tooManyPoints, [explicitPath, 'tests/adapter/explicit-layout.test.js'],
    'Seventeen authored interior waypoints exceed the admitted contract budget.', 'validate');
  const routeBudget = structuredClone(semantic);
  routeBudget.layout.positions = positions(semantic);
  routeBudget.layout.routes = { queue: { sourceSide: 'bottom', targetSide: 'top',
    waypoints: Array.from({ length: 16 }, (_, index) => ({ x: Math.floor(index / 2) * 20 + 600, y: Math.ceil(index / 2) * 20 + 850 })) } };
  add('route-point-limit', routeBudget,
    ['src/adapter/autoLayout/labels.js', 'src/adapter/autoLayout/pipeline.js'],
    'Sixteen admitted authored waypoints plus endpoints overflow the 17-point anchoring budget in the real layout pipeline.', 'route-point-limit');
  return cases;
}
