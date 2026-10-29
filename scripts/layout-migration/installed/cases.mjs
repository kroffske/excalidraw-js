// The same neutral, public-API requests run in the installed Node and browser consumers.
export function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function automaticRequest() {
  return {
    nodes: [
      { id: 'input', width: 160, height: 90, shape: 'rectangle' },
      { id: 'decision', width: 180, height: 120, shape: 'diamond' },
      { id: 'output', width: 160, height: 90, shape: 'rectangle' },
    ],
    edges: [
      { id: 'accept', from: 'decision', to: 'output', label: 'Deliver' },
      { id: 'inspect', from: 'input', to: 'decision', label: 'Validate' },
    ],
    direction: 'LR',
    profile: { baseNodeGap: null, wideLabelCorridors: false, alignAdjacentRows: false,
      preferContentLabels: false, routeNudge: 12 },
    labelTypography: { fontSize: 18, lineHeight: 1.25, paddingX: 12, paddingY: 6 },
    fit: { viewport: { width: 1898, height: 909 }, minZoom: 0.1, maxZoom: 30,
      paddingFraction: 0.94, maxSideDrop: 0.2 },
  };
}

export function explicitRequest() {
  return { ...automaticRequest(),
    positions: { input: { x: 80, y: 80 }, decision: { x: 420, y: 65 }, output: { x: 780, y: 80 } },
    routes: {
      inspect: { sourceSide: 'right', targetSide: 'left' },
      accept: { sourceSide: 'right', targetSide: 'left' },
    },
  };
}

// Preserve ordered values, geometry, port sides, labels, diagnostics and fit state without digest pins.
export function geometryValues(result) {
  const constraints = result.constraints;
  return JSON.parse(JSON.stringify({
    boxes: [...result.boxes], direction: result.direction, orderedEdges: result.orderedEdges,
    containers: [...result.containers], edgeRoutes: [...result.edgeRoutes], areas: [...result.areas],
    diagnostics: result.diagnostics, fitComparison: result.fitComparison,
    constraints: { ...constraints, rows: constraints.ids.map(id => [id, constraints.rows.find(id)]),
      groups: [...constraints.groups], placements: [...constraints.placements],
      sidePlacements: [...constraints.sidePlacements], topGroups: [...constraints.topGroups],
      bottomGroups: [...constraints.bottomGroups], orderedGroups: [...constraints.orderedGroups] },
  }));
}

function immutable(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

function equalValues(actual, expected, message) {
  requireValue(JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
}

function componentChecks(layoutComponent) {
  const values = {};
  for (const [name, direction, labelFontSize, corridor] of [
    ['currentLR', 'LR', 20, 360], ['legacyLR', 'LR', 16, 300], ['legacyTB', 'TB', 16, 300],
  ]) {
    // Node inventory, roots, children and relations deliberately use different orders.
    const request = immutable({
      nodes: [
        { id: 'a-leaf', width: 100, height: 60, children: [] },
        { id: 'z-leaf', width: 120, height: 70, children: [] },
        { id: 'a-root', width: 200, height: 100, children: ['m-branch', 'a-leaf'] },
        { id: 'm-branch', width: 180, height: 190, children: ['z-leaf'] },
        { id: 'z-root', width: 90, height: 50, children: [] },
      ],
      roots: ['z-root', 'a-root'],
      relations: [
        { id: 'z-header', from: 'a-root', to: 'm-branch', label: '123456789012345678901234567890', headerRail: true },
        { id: 'a-forward', from: 'm-branch', to: 'a-leaf', label: 'go', headerRail: false },
        { id: 'm-reverse', from: 'a-leaf', to: 'm-branch', label: 'return', headerRail: false },
        { id: 'b-self', from: 'z-leaf', to: 'z-leaf', label: 'repeat', headerRail: false },
        { id: 'c-root', from: 'z-root', to: 'a-root', label: 'next', headerRail: false },
      ],
      direction, labelFontSize,
    });
    const before = JSON.stringify(request), result = layoutComponent(request);
    requireValue(result.boxes instanceof Map && result.containers instanceof Set && result.edgeGeometry instanceof Map,
      `${name}: component geometry lost its public Map/Set types`);
    const actual = { boxes: [...result.boxes], containers: [...result.containers],
      direction: result.direction, edgeGeometry: [...result.edgeGeometry] };
    const horizontal = direction === 'LR';
    equalValues(actual, {
      boxes: [
        ['z-root', { width: 90, height: 50, x: 80, y: 80 }],
        ['a-root', { width: horizontal ? 412 + corridor : 312, height: horizontal ? 548 : 608 + corridor, x: 80, y: 226 }],
        ['m-branch', { width: 216, height: 320, x: 128, y: 406 }],
        ['z-leaf', { width: 120, height: 70, x: 176, y: 608 }],
        ['a-leaf', { width: 100, height: 60, x: horizontal ? 344 + corridor : 128, y: horizontal ? 406 : 726 + corridor }],
      ],
      containers: ['a-root', 'm-branch'], direction,
      edgeGeometry: [
        ['z-header', { x: 344, y: 274, points: [[0, 0], [0, 132]] }],
        ['a-forward', horizontal
          ? { x: 344, y: 530, points: [[0, 0], [corridor, -130]] }
          : { x: 200, y: 726, points: [[0, 0], [-58, corridor]] }],
        ['m-reverse', horizontal
          ? { x: 344 + corridor, y: 472, points: [[0, 0], [-corridor, 130]] }
          : { x: 214, y: 726 + corridor, points: [[0, 0], [58, -corridor]] }],
        ['b-self', { x: 296, y: 632.5, points: [[0, 0], [56, 0], [56, 46], [0, 46]] }],
        ['c-root', { x: 125, y: 130, points: [[0, 0], [horizontal ? 161 + corridor / 2 : 111, 96]] }],
      ],
    }, `${name}: nested, ordered, header/self/reverse component geometry differs`);
    equalValues(request, JSON.parse(before), `${name}: component input mutated`);
    values[name] = actual;
  }
  const empty = layoutComponent(immutable({ nodes: [], roots: [], relations: [], direction: 'LR', labelFontSize: 20 }));
  requireValue(empty.boxes.size === 0 && empty.containers.size === 0 && empty.edgeGeometry.size === 0,
    'Empty component layout needs no engines');
  return values;
}

function sequenceChecks(layoutSequence) {
  const values = {};
  for (const wrapLabels of [true, false]) {
    const request = immutable({
      participants: [
        { id: 'z-left', width: 300, height: 90 },
        { id: 'm-middle', width: 260, height: 130 },
        { id: 'a-right', width: 300, height: 100 },
      ],
      messages: [
        { id: 'z-reverse', from: 'a-right', to: 'z-left', label: 'first\nsecond\nthird' },
        { id: 'a-self', from: 'm-middle', to: 'm-middle', label: 'MMMM MMMM MMMM MMMM' },
        { id: 'm-forward', from: 'z-left', to: 'a-right', label: 'A to C' },
        { id: 'b-adjacent', from: 'm-middle', to: 'a-right', label: 'M to C' },
      ],
      wrapLabels, labelFontSize: 20,
    });
    const before = JSON.stringify(request), result = layoutSequence(request);
    requireValue(result.boxes instanceof Map && result.messageLabels instanceof Map
      && result.lifelines instanceof Map && result.edgeGeometry instanceof Map,
    'Sequence geometry lost its public Map types');
    const actual = { boxes: [...result.boxes], direction: result.direction,
      messageTop: result.messageTop, messageGap: result.messageGap, messageLabels: [...result.messageLabels],
      lifelines: [...result.lifelines], edgeGeometry: [...result.edgeGeometry] };
    const gap = wrapLabels ? 136 : 87, top = wrapLabels ? 346 : 297;
    equalValues(actual, {
      boxes: [
        ['z-left', { width: 300, height: 90, x: 80, y: 80 }],
        ['m-middle', { width: 260, height: 130, x: 428, y: 80 }],
        ['a-right', { width: 300, height: 100, x: 736, y: 80 }],
      ],
      direction: 'LR', messageTop: top, messageGap: gap,
      messageLabels: wrapLabels ? [
        ['z-reverse', { text: 'first\nsecond\nthird', centerX: 394 }],
        ['a-self', { text: 'MMMM\nMMMM\nMMMM\nMMMM', centerX: 614 }],
        ['m-forward', { text: 'A to C', centerX: 394 }],
        ['b-adjacent', { text: 'M to C', centerX: 722 }],
      ] : [],
      lifelines: [
        ['z-left', { x: 229, y: 170, width: 2, height: wrapLabels ? 720 : 475 }],
        ['m-middle', { x: 557, y: 210, width: 2, height: wrapLabels ? 680 : 435 }],
        ['a-right', { x: 885, y: 180, width: 2, height: wrapLabels ? 710 : 465 }],
      ],
      edgeGeometry: [
        ['z-reverse', { x: 886, y: top, points: wrapLabels ? [[0, 0], [-492, 0], [-656, 0]] : [[0, 0], [-656, 0]] }],
        ['a-self', { x: 558, y: top + gap, points: [[0, 0], [56, 0], [56, 36], [0, 36]] }],
        ['m-forward', { x: 230, y: top + 2 * gap, points: wrapLabels ? [[0, 0], [164, 0], [656, 0]] : [[0, 0], [656, 0]] }],
        ['b-adjacent', { x: 558, y: top + 3 * gap, points: wrapLabels ? [[0, 0], [164, 0], [328, 0]] : [[0, 0], [328, 0]] }],
      ],
    }, `${wrapLabels ? 'current' : 'legacy'}: ordered sequence, lifeline, self/reverse or corridor geometry differs`);
    equalValues(request, JSON.parse(before), 'Sequence input mutated');
    values[wrapLabels ? 'current' : 'legacy'] = actual;
  }
  const empty = layoutSequence(immutable({ participants: [], messages: [], wrapLabels: true, labelFontSize: 20 }));
  requireValue(empty.boxes.size === 0 && empty.lifelines.size === 0 && empty.edgeGeometry.size === 0
    && empty.messageLabels.size === 0 && empty.messageTop === 251 && empty.messageGap === 87,
  'Empty sequence geometry changed');
  return values;
}

export function coldChecks(layoutGraph, layoutComponent, layoutSequence) {
  const request = explicitRequest(), before = JSON.stringify(request);
  const explicit = layoutGraph(request);
  requireValue(JSON.stringify(request) === before, 'Explicit layout mutated its request');
  for (const [id, position] of Object.entries(request.positions)) {
    const box = explicit.boxes.get(id);
    requireValue(box.x === position.x && box.y === position.y, `Pin changed: ${id}`);
  }
  requireValue([...explicit.edgeRoutes.values()].every(route => route.manual), 'Explicit routes lost manual ownership');
  const empty = layoutGraph({ ...automaticRequest(), nodes: [], edges: [] });
  requireValue(empty.boxes.size === 0 && empty.edgeRoutes.size === 0, 'Empty graph needs no engines');
  let missing;
  try { layoutGraph(automaticRequest()); } catch (error) { missing = error; }
  requireValue(missing?.code === 'PLACEMENT_FAILED', 'Missing Graphviz must fail explicitly');
  const pinned = explicitRequest();
  delete pinned.routes;
  let routing;
  try { layoutGraph(pinned); } catch (error) { routing = error; }
  requireValue(routing?.code === 'ROUTING_FAILED', 'Missing Avoid must fail explicitly');
  return { explicit: geometryValues(explicit), empty: geometryValues(empty),
    missingPlacement: { code: missing.code, diagnostics: missing.diagnostics },
    missingRouting: { code: routing.code, diagnostics: routing.diagnostics },
    component: componentChecks(layoutComponent), sequence: sequenceChecks(layoutSequence) };
}

function resourceChecks(layoutGraph, runtime) {
  const observations = [];
  for (const failure of ['none', 'constructor', 'configuration', 'shape', 'connector', 'transaction', 'extraction']) {
    let allocated = 0, deleted = 0, values = 0, valueDeletes = 0, transactions = 0;
    const cause = new Error(`installed acceptance: ${failure}`);
    // Keep real Graphviz and real Avoid allocations. Only the selected failure is injected.
    const Avoid = new Proxy(runtime.Avoid, { get(target, name) {
      if (name === 'Router') return function Router(...args) {
        if (failure === 'constructor') throw cause;
        const router = new target.Router(...args);
        allocated += 1;
        const dispose = router.delete.bind(router);
        router.delete = () => { deleted += 1; dispose(); };
        if (failure === 'configuration') router.setRoutingParameter = () => { throw cause; };
        const transact = router.processTransaction.bind(router);
        router.processTransaction = () => {
          transactions += 1;
          if (failure === 'transaction') throw cause;
          return transact();
        };
        return router;
      };
      if (name === 'ShapeRef' && failure === 'shape') return function ShapeRef() { throw cause; };
      if (name === 'ConnRef' && ['connector', 'extraction'].includes(failure)) return function ConnRef(...args) {
        if (failure === 'connector') throw cause;
        const connector = new target.ConnRef(...args);
        connector.displayRoute = () => { throw cause; };
        return connector;
      };
      if (['Point', 'Rectangle', 'Polygon', 'ConnEnd'].includes(name)) return function OwnedValue(...args) {
        const value = new target[name](...args);
        values += 1;
        const dispose = value.delete.bind(value);
        value.delete = () => { valueDeletes += 1; dispose(); };
        return value;
      };
      return Reflect.get(target, name);
    } });
    let caught;
    try { layoutGraph(automaticRequest(), { runtime: { ...runtime, Avoid } }); }
    catch (error) { caught = error; }
    if (failure === 'none') requireValue(!caught && allocated > 0 && transactions > 0, 'Real routing did not run');
    else requireValue(caught?.code === 'ROUTING_FAILED' && caught.cause === cause,
      `${failure} failure lost its routing code or original cause: ${caught}`);
    requireValue(allocated === deleted, `${failure} leaked an allocated router`);
    requireValue(values === valueDeletes, `${failure} leaked an owned Avoid value`);
    observations.push({ failure, allocated, deleted, values, valueDeletes, transactions, code: caught?.code ?? null });
  }
  return observations;
}

export function runtimeChecks(layoutGraph, runtime) {
  const request = automaticRequest(), before = JSON.stringify(request);
  const result = layoutGraph(request, { runtime });
  requireValue(JSON.stringify(request) === before, 'Automatic layout mutated its request');
  requireValue(result.boxes.size === 3 && result.edgeRoutes.size === 2, 'Incomplete automatic geometry');
  requireValue(JSON.stringify(result.orderedEdges) === JSON.stringify([...request.edges].sort((left, right) => left.id < right.id ? -1 : 1)),
    'Layout changed directed edge identity, label text or stable order');
  const input = result.boxes.get('input'), output = result.boxes.get('output');
  requireValue(input.x < output.x, 'Graphviz did not enforce LR placement');
  for (const route of result.edgeRoutes.values()) {
    requireValue(!route.manual && route.points.length >= 2, 'Automatic route did not use Avoid');
    requireValue(route.points.flat().every(Number.isFinite), 'Non-finite route');
    requireValue(route.labelCenter?.every(Number.isFinite), 'Missing measured label anchor');
  }
  const resources = resourceChecks(layoutGraph, runtime);
  const repeated = geometryValues(layoutGraph(automaticRequest(), { runtime }));
  requireValue(JSON.stringify(repeated) === JSON.stringify(geometryValues(result)), 'Runtime failed to recover after routing failures');
  return { graphvizVersion: runtime.graphviz.version(), automatic: geometryValues(result), resources };
}
