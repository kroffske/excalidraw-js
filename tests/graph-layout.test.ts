import { beforeAll, describe, expect, it } from 'vitest';
import { areaGeometries, areaGeometry, compileConstraints, layoutFit, layoutGraph, measureText, routeEdges } from '../src/graph-layout/index.js';
import { createLayoutRuntime } from '../src/graph-layout/engines-node.js';
import type { AvoidOwned, AvoidRuntime, LayoutRuntime } from '../src/graph-layout/runtime-types.js';
import type { GraphLayoutRequest, Box, LayoutEdge, RoutingNode } from '../src/graph-layout/types.js';
import type { RoutingOptions } from '../src/graph-layout/routing.js';

function request(): GraphLayoutRequest {
  return {
    nodes: [
      { id: 'a', width: 120, height: 80, shape: 'rectangle' },
      { id: 'b', width: 160, height: 100, shape: 'diamond' },
      { id: 'c', width: 100, height: 80, shape: 'rectangle' },
    ],
    edges: [
      { id: 'ab', from: 'a', to: 'b', label: 'Submit [ready]' },
      { id: 'bc', from: 'b', to: 'c', label: 'Continue' },
    ],
    defaultTopIds: ['a'],
    profile: { baseNodeGap: null, wideLabelCorridors: true, alignAdjacentRows: true, preferContentLabels: true, routeNudge: 64 },
    labelTypography: { fontSize: 18, lineHeight: 1.25, paddingX: 12, paddingY: 6 },
    fit: { viewport: { width: 1898, height: 909 }, minZoom: 0.1, maxZoom: 30, paddingFraction: 0.94, maxSideDrop: 0.2 },
  };
}

function explicitRequest(): GraphLayoutRequest {
  const value = request();
  value.nodes = value.nodes.slice(0, 2);
  value.edges = [{ id: 'ab', from: 'a', to: 'b', label: 'Submit [ready]' }];
  value.positions = { a: { x: 0, y: 0 }, b: { x: 500, y: 0 } };
  value.routes = { ab: { sourceSide: 'right', targetSide: 'left' } };
  return value;
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe('shared graph geometry', () => {
  let runtime: LayoutRuntime;
  beforeAll(async () => { runtime = await createLayoutRuntime(); });

  it('runs real DOT rank subgraphs and shape routing with preserved values', () => {
    const input = request(), before = structuredClone(input);
    freeze(input);
    const result = layoutGraph(input, { runtime });
    expect([...result.boxes]).toEqual([
      ['a', { width: 120, height: 80, x: 100, y: 80 }],
      ['b', { width: 160, height: 100, x: 80, y: 320 }],
      ['c', { width: 100, height: 80, x: 110, y: 580 }],
    ]);
    expect([...result.edgeRoutes].map(([id, route]) => [id, route.points, route.sourceSide, route.targetSide, route.labelBox])).toEqual([
      ['ab', [[160, 160], [160, 240], [160, 320]], 'bottom', 'top', { left: 93.5, top: 225.75, right: 226.5, bottom: 254.25 }],
      ['bc', [[160, 420], [160, 500], [160, 580]], 'bottom', 'top', { left: 116, top: 485.75, right: 204, bottom: 514.25 }],
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(input).toEqual(before);
    expect(layoutGraph(input, { runtime })).toEqual(result);
  });

  it('bypasses both engines for complete positions and routes', () => {
    const input = explicitRequest(), before = structuredClone(input);
    freeze(input);
    const result = layoutGraph(input);
    expect(result.boxes.get('a')).toEqual({ width: 120, height: 80, x: 0, y: 0 });
    expect(result.edgeRoutes.get('ab')).toMatchObject({ manual: true, sourceSide: 'right', targetSide: 'left' });
    expect(result.edgeRoutes.get('ab')!.points[0]).toEqual([120, 40]);
    expect(result.edgeRoutes.get('ab')!.points.at(-1)).toEqual([500, 50]);
    expect(input).toEqual(before);
  });

  it('keeps partial pins exact and uses explicit constraints over top preferences', () => {
    const input = request();
    input.positions = { c: { x: 915, y: 720 } };
    input.constraints = [{ type: 'below', node: 'a', other: 'b', index: 3 }];
    const result = layoutGraph(input, { runtime });
    expect(result.boxes.get('c')).toMatchObject(input.positions.c);
    const a = result.boxes.get('a')!, b = result.boxes.get('b')!;
    expect(a.y).toBeGreaterThanOrEqual(b.y + b.height);
    expect(result.edgeRoutes.get('ab')!.edge).toEqual(input.edges[0]);
    expect(result.constraints.topGroups.has(result.constraints.rows.find('a'))).toBe(false);
  });

  it('preserves warnings and explicit-position fit uncertainty', () => {
    const input = explicitRequest();
    input.constraints = [{ type: 'place', node: 'a', place: 'left', index: 2 }, { type: 'below', node: 'b', other: 'b', index: 3 }];
    expect(() => layoutGraph(input)).toThrowError(expect.objectContaining({ code: 'HINT_CONFLICT' }));
    input.constraints = [{ type: 'place', node: 'a', place: 'left', index: 2 }];
    const result = layoutGraph(input);
    expect(result.fitComparison).toEqual({ status: 'unverified', reason: 'complete_positions', actualFit: layoutFit(result, input.fit) });
    expect(result.diagnostics.at(-1)).toMatchObject({ code: 'PLACEMENT_FIT_UNVERIFIED', severity: 'warning' });
    input.constraints = [{ type: 'below', node: 'a', other: 'b', index: 4 }];
    expect(layoutGraph(input).diagnostics[0]).toMatchObject({ code: 'PLACEMENT_HINT_UNMET', path: '/layout/hints/4', severity: 'warning', constraintIndex: 4, nodeId: 'a' });
  });

  it('reports missing engines at the required phase', () => {
    expect(() => layoutGraph(request())).toThrowError(expect.objectContaining({ code: 'PLACEMENT_FAILED' }));
    const input = explicitRequest();
    delete input.routes;
    expect(() => layoutGraph(input)).toThrowError(expect.objectContaining({ code: 'ROUTING_FAILED' }));
  });

  it('refuses label anchoring that exceeds the retained route point limit', () => {
    const input = explicitRequest();
    input.routes!.ab.waypoints = Array.from({ length: 18 }, (_, index) => ({ x: 140 + index * 15, y: index % 2 ? 150 : 100 }));
    expect(() => layoutGraph(input)).toThrowError(expect.objectContaining({ code: 'ROUTE_POINT_LIMIT' }));
  });

  it('retains no-slot diagnostics and fallback label geometry for arbitrary stable IDs', () => {
    const input = explicitRequest();
    input.nodes[0].id = 'node/a~b'; input.nodes[1].id = 'node/c~d';
    input.defaultTopIds = ['node/a~b'];
    input.positions = { 'node/a~b': { x: 0, y: 0 }, 'node/c~d': { x: 500, y: 0 } };
    input.edges[0] = { id: 'edge/a~b', from: 'node/a~b', to: 'node/c~d', label: 'W'.repeat(1000) };
    input.routes = { 'edge/a~b': { sourceSide: 'right', targetSide: 'left' } };
    const before = structuredClone(input);
    freeze(input);
    const result = layoutGraph(input);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'LABEL_NO_SLOT', path: '/layout/labels/edge~1a~0b', edgeId: 'edge/a~b' }));
    expect(result.edgeRoutes.get('edge/a~b')!.labelCenter!.every(Number.isFinite)).toBe(true);
    expect(input).toEqual(before);
  });

  it('keeps node identity in placement failures without deriving it from paths', () => {
    const input = request();
    input.nodes[0].id = 'node/a~b'; input.edges[0].from = 'node/a~b'; input.defaultTopIds = ['node/a~b'];
    const broken: LayoutRuntime = { ...runtime, graphviz: { ...runtime.graphviz,
      layout: () => JSON.stringify({ bb: '0,0,100,100', objects: [{ name: 'node/a~b', pos: 'NaN,NaN' }] }),
    } };
    expect(() => layoutGraph(input, { runtime: broken })).toThrowError(expect.objectContaining({
      code: 'PLACEMENT_FAILED', diagnostics: [expect.objectContaining({ path: '/layout/nodes/node~1a~0b', nodeId: 'node/a~b' })],
    }));
  });

  it('reports explicit route limits with the unescaped edge identity', () => {
    const input = explicitRequest();
    input.edges[0].id = 'edge/a~b';
    input.routes = { 'edge/a~b': { sourceSide: 'right', targetSide: 'left',
      waypoints: Array.from({ length: 18 }, (_, index) => ({ x: 140 + index * 15, y: index % 2 ? 150 : 100 })),
    } };
    expect(() => layoutGraph(input)).toThrowError(expect.objectContaining({
      code: 'ROUTE_POINT_LIMIT', diagnostics: [expect.objectContaining({ edgeId: 'edge/a~b', path: '/layout/routes/edge~1a~0b' })],
    }));
  });

  it('requires explicit shape coverage and distinguishes real diamond contours', () => {
    const boxes = new Map<string, Box>([
      ['a', { x: 0, y: 0, width: 200, height: 200 }], ['b', { x: 500, y: 0, width: 100, height: 100 }],
      ['c', { x: 500, y: 120, width: 100, height: 100 }],
    ]);
    const edges = [{ id: 'ab', from: 'a', to: 'b', label: 'Move' }, { id: 'ac', from: 'a', to: 'c', label: 'Continue' }];
    const partners: RoutingNode[] = [{ id: 'b', shape: 'rectangle' }, { id: 'c', shape: 'rectangle' }];
    const diamond = routeEdges(boxes, edges, { Avoid: runtime.Avoid, nodes: [{ id: 'a', shape: 'diamond' }, ...partners] }).get('ab')!.points[0];
    const rectangle = routeEdges(boxes, edges, { Avoid: runtime.Avoid, nodes: [{ id: 'a', shape: 'rectangle' }, ...partners] }).get('ab')!.points[0];
    expect(diamond[0]).toBeLessThan(200);
    expect(Math.abs(diamond[0] - 100) / 100 + Math.abs(diamond[1] - 100) / 100).toBeCloseTo(1, 10);
    expect(rectangle[0]).toBe(200);
  });

  it.each([
    ['nonfinite node size', (v: GraphLayoutRequest) => { v.nodes[0].width = Infinity; }],
    ['missing shape', (v: GraphLayoutRequest) => { delete (v.nodes[0] as Partial<typeof v.nodes[0]>).shape; }],
    ['duplicate node', (v: GraphLayoutRequest) => { v.nodes[1].id = 'a'; }],
    ['foreign endpoint', (v: GraphLayoutRequest) => { v.edges[0].to = 'foreign'; }],
    ['nonfinite pin', (v: GraphLayoutRequest) => { v.positions = { a: { x: NaN, y: 0 } }; }],
    ['foreign manual route', (v: GraphLayoutRequest) => { v.routes = { missing: { sourceSide: 'right', targetSide: 'left' } }; }],
    ['invalid fit', (v: GraphLayoutRequest) => { v.fit.viewport.width = 0; }],
    ['invalid typography', (v: GraphLayoutRequest) => { v.labelTypography.fontSize = 0; }],
    ['foreign constraint node', (v: GraphLayoutRequest) => { v.constraints = [{ type: 'below', node: 'missing', other: 'a', index: 0 }]; }],
    ['area cycle', (v: GraphLayoutRequest) => { v.areas = [{ id: 'one', nodeIds: ['a'], parentId: 'two', title: 'One', typography: { fontSize: 24, lineHeight: 1.25 } }, { id: 'two', nodeIds: [], parentId: 'one', title: 'Two', typography: { fontSize: 24, lineHeight: 1.25 } }]; }],
  ])('refuses malformed %s before engines are needed', (_name, mutate) => {
    const input = request();
    mutate(input);
    expect(() => layoutGraph(input)).toThrowError(expect.objectContaining({ code: 'INVALID_LAYOUT_REQUEST' }));
  });

  it('supports an empty graph without engines', () => {
    const input = request();
    input.nodes = []; input.edges = []; input.defaultTopIds = [];
    const result = layoutGraph(input);
    expect(result.boxes.size).toBe(0);
    expect(layoutFit(result, input.fit)).toBe(input.fit.minZoom);
  });

  it('measures nested area headers with explicit typography and retained Cyrillic advances', () => {
    const typography = { fontSize: 24, lineHeight: 1.25 };
    const boxes = new Map([['a', { x: 100, y: 150, width: 120, height: 80 }]]);
    const child = areaGeometry('Название', [...boxes.values()], typography);
    expect(child).toEqual({ x: 68, y: 68, width: 184, height: 194, text: 'Название', headerHeight: 58 });
    const areas = areaGeometries([
      { id: 'outer', nodeIds: [], title: 'Outer', typography },
      { id: 'inner', parentId: 'outer', nodeIds: ['a'], title: 'Название', typography },
    ], boxes);
    expect(areas.get('inner')).toEqual(child);
    expect(areas.get('outer')).toEqual(areaGeometry('Outer', [child], typography));
    expect(measureText('Название', 24)).toBeLessThan(140);
  });

  it('uses one constraint compiler for cycles, merged rows and stable original ordering', () => {
    expect(compileConstraints(['c', 'b', 'a'], []).orderedGroups).toEqual(new Map([['c', ['c']], ['b', ['b']], ['a', ['a']]]));
    const cycle = compileConstraints(['a', 'b'], [
      { type: 'rightOf', node: 'b', other: 'a', index: 1 },
      { type: 'rightOf', node: 'a', other: 'b', index: 2 },
    ]);
    expect(cycle.valid).toBe(false);
    expect(cycle.diagnostics[0]).toMatchObject({ code: 'HINT_CONFLICT', path: '/layout/hints/1', constraintIndex: 1 });
    expect(compileConstraints(['a', 'b', 'c'], [
      { type: 'row', ids: ['a', 'b'], index: 4 }, { type: 'row', ids: ['b', 'c'], index: 6 },
    ]).diagnostics[0]).toMatchObject({ code: 'HINT_CONFLICT', path: '/layout/hints/6', constraintIndex: 6 });
    expect(compileConstraints(['node/a~b'], [
      { type: 'place', node: 'node/a~b', place: 'top', index: 8 }, { type: 'place', node: 'node/a~b', place: 'bottom', index: 9 },
    ]).diagnostics[0]).toMatchObject({ code: 'HINT_CONFLICT', nodeId: 'node/a~b', constraintIndex: 9, path: '/layout/hints/9' });
  });
});

type FailureStage = 'router' | 'configure' | 'shape' | 'pin' | 'connector' | 'transaction' | 'extraction' | 'validation' | undefined;
function routingRuntime(failure?: FailureStage, cleanup?: 'router' | 'value') {
  const state = { routers: 0, routerDeletes: 0, values: 0, valueDeletes: 0 };
  const fail = (stage: FailureStage) => { if (failure === stage) throw new Error(`failure:${stage}`); };
  class Value {
    constructor() { state.values++; }
    delete() { state.valueDeletes++; if (cleanup === 'value') throw new Error('cleanup:value'); }
  }
  class Point extends Value { constructor(public x: number, public y: number) { super(); } }
  class Polygon extends Value { setPoint() {} }
  class Router {
    constructor() { fail('router'); state.routers++; }
    setRoutingParameter() { fail('configure'); }
    setRoutingOption() {}
    processTransaction() { fail('transaction'); }
    delete() { state.routerDeletes++; if (cleanup === 'router') throw new Error('cleanup:router'); }
  }
  class Shape { constructor() { fail('shape'); } delete() {} }
  class Pin { constructor() { fail('pin'); } setExclusive() {} delete() {} }
  class End extends Value { constructor(_shape: AvoidOwned, _classId?: number) { super(); } }
  class Connector {
    constructor() { fail('connector'); }
    setRoutingType() {} setHateCrossings() {} delete() {}
    displayRoute() {
      fail('extraction');
      const points = failure === 'validation' ? [{ x: NaN, y: 50 }] : [{ x: 100, y: 50 }, { x: 400, y: 50 }];
      return { size: () => points.length, at: (index: number) => points[index] };
    }
  }
  const parameter = { value: 1 };
  const Avoid: AvoidRuntime = {
    Router, Point, Polygon, Rectangle: Polygon, ShapeRef: Shape, ShapeConnectionPin: Pin, ConnEnd: End, ConnRef: Connector,
    RouterFlag: { OrthogonalRouting: parameter }, ConnType: { ConnType_Orthogonal: parameter },
    RoutingParameter: { shapeBufferDistance: parameter, idealNudgingDistance: parameter, segmentPenalty: parameter, crossingPenalty: parameter, reverseDirectionPenalty: parameter },
    RoutingOption: { nudgeOrthogonalSegmentsConnectedToShapes: parameter, nudgeSharedPathsWithCommonEndPoint: parameter, penaliseOrthogonalSharedPathsAtConnEnds: parameter, performUnifyingNudgingPreprocessingStep: parameter },
  };
  return { Avoid, state };
}

describe('routing resource lifetime', () => {
  const boxes = new Map<string, Box>([['a', { x: 0, y: 0, width: 100, height: 100 }], ['b', { x: 400, y: 0, width: 100, height: 100 }]]);
  const edges: LayoutEdge[] = [{ id: 'edge', from: 'a', to: 'b', label: 'Move' }];
  const nodes: RoutingNode[] = [{ id: 'a', shape: 'rectangle' }, { id: 'b', shape: 'rectangle' }];
  it.each(['router', 'configure', 'shape', 'pin', 'connector', 'transaction', 'extraction', 'validation'] as const)('releases acquired resources after %s failure', stage => {
    const { Avoid, state } = routingRuntime(stage);
    expect(() => routeEdges(boxes, edges, { Avoid, nodes })).toThrowError(expect.objectContaining({ code: 'ROUTING_FAILED' }));
    expect(state.routerDeletes).toBe(stage === 'router' ? 0 : 1);
    expect(state.valueDeletes).toBe(state.values);
  });
  it('releases resources after successful route extraction', () => {
    const { Avoid, state } = routingRuntime();
    expect(routeEdges(boxes, edges, { Avoid, nodes }).get('edge')!.points).toEqual([[100, 50], [400, 50]]);
    expect(state.routerDeletes).toBe(1);
    expect(state.valueDeletes).toBe(state.values);
  });
  it.each(['router', 'value'] as const)('preserves transaction failure and attempts every release after %s cleanup failure', cleanup => {
    const { Avoid, state } = routingRuntime('transaction', cleanup);
    let error: unknown;
    try { routeEdges(boxes, edges, { Avoid, nodes }); } catch (cause) { error = cause; }
    expect(error).toMatchObject({ code: 'ROUTING_FAILED', cause: expect.any(AggregateError) });
    const failures = (error as Error & { cause: AggregateError }).cause.errors as Error[];
    expect(failures.map(cause => cause.message)).toContain('failure:transaction');
    expect(failures.map(cause => cause.message)).toContain(`cleanup:${cleanup}`);
    expect(state.routerDeletes).toBe(1);
    expect(state.valueDeletes).toBe(state.values);
  });
  it.each([
    ['omitted', undefined],
    ['incomplete', [{ id: 'a', shape: 'rectangle' }]],
    ['duplicate', [{ id: 'a', shape: 'rectangle' }, { id: 'a', shape: 'diamond' }, { id: 'b', shape: 'rectangle' }]],
    ['unsupported', [{ id: 'a', shape: 'ellipse' }, { id: 'b', shape: 'rectangle' }]],
    ['missing shape', [{ id: 'a' }, { id: 'b', shape: 'rectangle' }]],
    ['foreign', [{ id: 'a', shape: 'rectangle' }, { id: 'b', shape: 'rectangle' }, { id: 'foreign', shape: 'rectangle' }]],
  ])('refuses %s contour declarations before acquiring a Router', (_name, declarations) => {
    const { Avoid, state } = routingRuntime();
    // Deliberately cross the typed boundary to exercise malformed JavaScript callers.
    const options = { Avoid, nodes: declarations } as unknown as RoutingOptions;
    expect(() => routeEdges(boxes, edges, options)).toThrowError(expect.objectContaining({ code: 'INVALID_LAYOUT_REQUEST' }));
    expect(state.routers).toBe(0);
    expect(state.values).toBe(0);
  });
  it('reports the exact escaped node location for a missing contour', () => {
    const { Avoid } = routingRuntime();
    const namedBoxes = new Map<string, Box>([['node/a~b', boxes.get('a')!], ['b', boxes.get('b')!]]);
    expect(() => routeEdges(namedBoxes, [{ id: 'edge/a~b', from: 'node/a~b', to: 'b', label: 'Move' }], { Avoid, nodes: [{ id: 'b', shape: 'rectangle' }] }))
      .toThrowError(expect.objectContaining({ diagnostics: [expect.objectContaining({ code: 'INVALID_LAYOUT_REQUEST', nodeId: 'node/a~b', path: '/layout/nodes/node~1a~0b' })] }));
  });
  it('retains an edge identity after failing extraction for slash/tilde IDs', () => {
    const { Avoid } = routingRuntime('validation');
    expect(() => routeEdges(boxes, [{ ...edges[0], id: 'edge/a~b' }], { Avoid, nodes }))
      .toThrowError(expect.objectContaining({ diagnostics: [expect.objectContaining({ code: 'ROUTING_FAILED', edgeId: 'edge/a~b', path: '/layout/routes/edge~1a~0b' })] }));
  });
});
