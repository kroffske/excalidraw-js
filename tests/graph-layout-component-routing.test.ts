import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ComponentLayoutError, layoutComponent } from '../src/graph-layout/component.js';
import type { ComponentComposition, ComponentLayoutOptions, ComponentLayoutRequest } from '../src/graph-layout/component.js';
import { createLayoutRuntime } from '../src/graph-layout/engines-node.js';
import { estimateEdgeLabel, excalidrawLabelPath, placeRouteLabels, segmentEntersOpenBox } from '../src/graph-layout/labels.js';
import * as labelGeometry from '../src/graph-layout/labels.js';
import { routeEdges } from '../src/graph-layout/routing.js';
import { joinLabelRoute } from '../src/graph-layout/routing-labels.js';
import { measureText } from '../src/graph-layout/text.js';
import type { Box, EdgeRoute, Point } from '../src/graph-layout/types.js';
import type { AvoidRuntime } from '../src/graph-layout/runtime-types.js';

function request(): ComponentLayoutRequest {
  return {
    nodes: [
      { id: 'root', width: 200, height: 80, children: ['a', 'b'] },
      { id: 'a', width: 100, height: 80, children: [] },
      { id: 'b', width: 120, height: 100, children: [] },
    ],
    roots: ['root'],
    relations: [{ id: 'ab', from: 'a', to: 'b', label: 'Call', headerRail: false }],
    direction: 'LR', labelFontSize: 16,
  };
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

// Geometry assertions use the points consumed by native Excalidraw, including its
// odd middle-vertex anchor, rather than accepting a merely populated label map.
function assertLabels(result: ReturnType<typeof layoutComponent>, fontSize = 16) {
  for (const [id, label] of result.messageLabels) {
    const route = result.edgeRoutes.get(id)!;
    expect(route.points.length % 2).toBe(1);
    expect(route.points[(route.points.length - 1) / 2]).toEqual(label.center);
    expect(route.labelCenter).toEqual(label.center);
    expect(label).toMatchObject(estimateEdgeLabel(label.text, { fontSize, lineHeight: 1.25, paddingX: 12, paddingY: 6 }));
    const box = route.labelBox!;
    const obstacles = new Map([...result.boxes].map(([nodeId, b]) => [nodeId, result.headerBoxes.get(nodeId) ?? b]));
    for (const b of obstacles.values()) {
      expect(box.left < b.x + b.width && b.x < box.right && box.top < b.y + b.height && b.y < box.bottom).toBe(false);
    }
    for (const [otherId, otherRoute] of result.edgeRoutes) if (otherId !== id) {
      expect(otherRoute.points.slice(1).some((point, index) => segmentEntersOpenBox([otherRoute.points[index], point], box))).toBe(false);
    }
  }
}

describe('routed component composition', () => {
  let options: ComponentLayoutOptions;
  beforeAll(async () => { options = { Avoid: (await createLayoutRuntime()).Avoid, measureHeader: () => 96 }; });

  it('lays out unequal nested rows and columns with multiple roots, measuring headers once from the inside out', () => {
    const input: ComponentLayoutRequest = {
      nodes: [
        { id: 'outer', width: 5, height: 5, children: ['inner', 'a'], composition: { row: ['inner', 'a'] } },
        { id: 'inner', width: 5, height: 5, children: ['b', 'c'], composition: { column: ['b', 'c'] } },
        { id: 'a', width: 200, height: 80, children: [] },
        { id: 'b', width: 100, height: 70, children: [] },
        { id: 'c', width: 150, height: 90, children: [] },
        { id: 'external', width: 80, height: 40, children: [] },
      ],
      roots: ['outer', 'external'], rootComposition: { row: ['external', 'outer'] },
      relations: [], direction: 'TB', labelFontSize: 16,
    };
    const measureHeader = vi.fn((id: string, width: number) => id === 'inner' ? width / 2 : 120);
    const before = structuredClone(input);
    freeze(input);
    const result = layoutComponent(input, { ...options, measureHeader });
    expect(measureHeader.mock.calls).toEqual([['inner', 320], ['outer', 744]]);
    expect(result.boxes.get('external')).toEqual({ x: 80, y: 80, width: 80, height: 40 });
    expect(result.boxes.get('outer')).toEqual({ x: 320, y: 80, width: 744, height: 664 });
    expect(result.boxes.get('inner')).toEqual({ x: 352, y: 224, width: 320, height: 488 });
    expect(result.boxes.get('a')).toEqual({ x: 832, y: 224, width: 200, height: 80 });
    expect(result.boxes.get('b')).toEqual({ x: 384, y: 408, width: 100, height: 70 });
    expect(result.boxes.get('c')).toEqual({ x: 384, y: 590, width: 150, height: 90 });
    expect(result.headerBoxes.get('inner')).toEqual({ x: 352, y: 224, width: 320, height: 160 });
    expect(result.headerBoxes.has('a')).toBe(false);
    expect(input).toEqual(before);
  });

  it.each([
    { row: ['a', 'a'] }, { row: ['a', 'foreign'] }, 'a', { row: [] }, { column: ['a'] },
    { row: ['a', 'b'], column: ['a', 'b'] }, { row: ['a', 'b'], extra: true }, { rows: ['a', 'b'] },
  ])('rejects malformed or incomplete compositions %j before measuring', composition => {
    const input = request();
    input.nodes[0].composition = composition as ComponentComposition;
    const measureHeader = vi.fn(() => 96);
    expect(() => layoutComponent(input, { ...options, measureHeader })).toThrowError(ComponentLayoutError);
    expect(measureHeader).not.toHaveBeenCalled();
  });

  it('rejects foreign descendants, root omissions and cyclic wrapper objects before measuring', () => {
    const input = request();
    input.nodes.push({ id: 'grandchild', width: 80, height: 60, children: [] });
    input.nodes[1].children = ['grandchild'];
    input.nodes[0].composition = { row: ['grandchild', 'b'] };
    const measureHeader = vi.fn(() => 96);
    expect(() => layoutComponent(input, { ...options, measureHeader })).toThrowError(expect.objectContaining({ diagnostics: [expect.objectContaining({ nodeId: 'grandchild' })] }));
    input.nodes[0].composition = undefined;
    input.rootComposition = { row: ['root', 'a'] };
    expect(() => layoutComponent(input, { ...options, measureHeader })).toThrowError(ComponentLayoutError);
    const cycle: { row: unknown[] } = { row: [] };
    cycle.row = ['a', cycle];
    input.rootComposition = undefined;
    input.nodes[0].composition = cycle as ComponentComposition;
    expect(() => layoutComponent(input, { ...options, measureHeader })).toThrowError(ComponentLayoutError);
    expect(measureHeader).not.toHaveBeenCalled();
  });

  it.each([{}, { Avoid: {} }, { measureHeader: () => 96 }, undefined, null])('requires both opt-in options: %j', value => {
    expect(() => layoutComponent(request(), value as ComponentLayoutOptions)).toThrowError(ComponentLayoutError);
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid measured header height %s', height => {
    expect(() => layoutComponent(request(), { ...options, measureHeader: () => height })).toThrowError(expect.objectContaining({ diagnostics: [expect.objectContaining({ nodeId: 'root' })] }));
  });

  it('rejects header rails in the new mode while retaining the old mode', () => {
    const input = request();
    input.relations[0].headerRail = true;
    expect(() => layoutComponent(input, options)).toThrowError(ComponentLayoutError);
    expect(layoutComponent(input).edgeGeometry.size).toBe(1);
  });

  it('routes through free boundary area, attaches real parent endpoints to their headers and preserves reverse pairs', () => {
    const input = request();
    input.nodes.push({ id: 'outside', width: 100, height: 80, children: [] });
    input.roots = ['outside', 'root'];
    input.rootComposition = { row: ['outside', 'root'] };
    input.relations = [
      { id: 'inside', from: 'outside', to: 'a', label: 'Вызов', headerRail: false },
      { id: 'parent', from: 'root', to: 'a', label: 'Запуск', headerRail: false },
      { id: 'reverse', from: 'a', to: 'outside', label: 'Ответ', headerRail: false },
    ];
    const result = layoutComponent(input, options);
    const parent = result.edgeRoutes.get('parent')!, header = result.headerBoxes.get('root')!;
    expect(parent.points[0][1]).toBeLessThanOrEqual(header.y + header.height);
    const boundary = result.boxes.get('root')!;
    expect(result.edgeRoutes.get('inside')!.points.slice(1).some((point, index) => segmentEntersOpenBox([result.edgeRoutes.get('inside')!.points[index], point], {
      left: boundary.x, top: boundary.y, right: boundary.x + boundary.width, bottom: boundary.y + boundary.height,
    }))).toBe(true);
    expect(result.edgeRoutes.get('inside')!.points[0]).not.toEqual(result.edgeRoutes.get('reverse')!.points.at(-1));
    const reverse = result.edgeRoutes.get('reverse')!;
    expect(reverse.points.slice(1).every((point, index) => point[0] === reverse.points[index][0] || point[1] === reverse.points[index][1])).toBe(true);
    assertLabels(result);
  });

  it('preserves full Russian words and conditions in the one measured display string', () => {
    const input = request();
    input.nodes[1].width = 500;
    input.nodes[2].width = 500;
    input.nodes[2].height = 300;
    const label = 'Длинное условие [сверхдлинноенепрерывноесловобезпотерибукв]';
    input.relations[0].label = label;
    const result = layoutComponent(input, options);
    expect(result.messageLabels.get('ab')!.text).toContain('\n');
    expect(result.messageLabels.get('ab')!.text.replace(/\s/gu, '')).toBe(label.replace(/\s/gu, ''));
    expect(result.edgeRoutes.get('ab')!.edge.label).toBe(label);
    expect(input.relations[0].label).toBe(label);
    assertLabels(result);
  });

  it.each([1, 12, 16, 19, 19.5, 24, 32])('prepares the complete Russian label for the native arrow width floor at font size %s', labelFontSize => {
    const input = request();
    input.labelFontSize = labelFontSize;
    input.nodes[1] = { ...input.nodes[1], width: 500, height: 120 };
    input.nodes[2] = { ...input.nodes[2], width: 500, height: 500 };
    input.relations[0].label = 'Подтверждённая передача рыночного снимка [готовность подтверждена]';
    const result = layoutComponent(input, options), label = result.messageLabels.get('ab')!;
    const route = result.edgeRoutes.get('ab')!;
    const horizontalSpan = Math.max(...route.points.map(point => point[0])) - Math.min(...route.points.map(point => point[0]));
    // Official getBoundTextMaxWidth uses horizontal span, even for a long bent path.
    const nativeBudget = Math.max(0.7 * horizontalSpan, 11 * labelFontSize);
    expect(label.text.replace(/\s/gu, '')).toBe(input.relations[0].label.replace(/\s/gu, ''));
    expect(route.edge.label).toBe(input.relations[0].label);
    expect(label.width).toBeGreaterThan(0);
    expect(label.height).toBeGreaterThan(0);
    expect(Number.isFinite(label.width) && Number.isFinite(label.height)).toBe(true);
    for (const line of label.text.split('\n')) expect(measureText(line, labelFontSize)).toBeLessThanOrEqual(nativeBudget);
    if (labelFontSize === 1) expect(label.text.split('\n').some(line => [...line].length > 1)).toBe(true);
    assertLabels(result, labelFontSize);
  });

  it('keeps a long Russian label inside the native minimum on a zero-horizontal-span arrow', () => {
    const input = request();
    input.direction = 'TB'; input.labelFontSize = 19;
    input.nodes[1] = { ...input.nodes[1], width: 1000, height: 200 };
    input.nodes[2] = { ...input.nodes[2], width: 1000, height: 200 };
    input.relations[0].label = 'Получает рыночные данные [готово]';
    const result = layoutComponent(input, options), route = result.edgeRoutes.get('ab')!, label = result.messageLabels.get('ab')!;
    expect(Math.max(...route.points.map(point => point[0])) - Math.min(...route.points.map(point => point[0]))).toBe(0);
    expect(label.text).toContain('\n');
    for (const line of label.text.split('\n')) expect(measureText(line, 19)).toBeLessThanOrEqual(11 * 19);
    expect(label.text.replace(/\s/gu, '')).toBe(input.relations[0].label.replace(/\s/gu, ''));
    assertLabels(result, 19);
  });

  it.each([5e-7, 1e-6, 2e-6])('publishes coherent projected label geometry within the existing tolerance or refuses a displacement of %s', offset => {
    const baseline = layoutComponent(request(), options);
    const original = labelGeometry.placeRouteLabels;
    const placement = vi.spyOn(labelGeometry, 'placeRouteLabels').mockImplementation((...args) => {
      const result = original(...args);
      const selected = result.centers.get('ab')!;
      const route = args[1].get('ab')!;
      const segment = route.points.slice(1).map((point, index) => [route.points[index], point] as [Point, Point]).find(([a, b]) =>
        selected.center[0] >= Math.min(a[0], b[0]) && selected.center[0] <= Math.max(a[0], b[0])
        && selected.center[1] >= Math.min(a[1], b[1]) && selected.center[1] <= Math.max(a[1], b[1]));
      expect(segment).toBeDefined();
      selected.center = segment![0][0] === segment![1][0]
        ? [selected.center[0] + offset, selected.center[1]] : [selected.center[0], selected.center[1] + offset];
      return result;
    });
    try {
      if (offset > 1e-6) {
        expect(() => layoutComponent(request(), options)).toThrowError(expect.objectContaining({ code: 'LABEL_ANCHOR_UNSUPPORTED', diagnostics: [expect.objectContaining({ edgeId: 'ab' })] }));
      } else {
        const result = layoutComponent(request(), options), route = result.edgeRoutes.get('ab')!;
        assertLabels(result);
        expect(route.points.slice(1).every((point, index) => point[0] === route.points[index][0] || point[1] === route.points[index][1])).toBe(true);
        const length = (points: Point[]) => points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]), 0);
        expect(length(route.points)).toBeCloseTo(length(baseline.edgeRoutes.get('ab')!.points), 12);
        const box = route.labelBox!, center = route.labelCenter!;
        expect((box.left + box.right) / 2).toBeCloseTo(center[0], 12);
        expect((box.top + box.bottom) / 2).toBeCloseTo(center[1], 12);
      }
    } finally { placement.mockRestore(); }
  });

  it('returns an explicit edge failure when neither pass can place a complete label', () => {
    const input: ComponentLayoutRequest = {
      nodes: [{ id: 'one', width: 100, height: 80, children: [] }, { id: 'two', width: 100, height: 80, children: [] }], roots: ['one', 'two'],
      relations: [{ id: 'self/a~b', from: 'one', to: 'two', label: 'Условие '.repeat(80), headerRail: false }], direction: 'LR', labelFontSize: 16,
    };
    expect(() => layoutComponent(input, options)).toThrowError(expect.objectContaining({ code: 'LABEL_NO_SLOT', diagnostics: [expect.objectContaining({ edgeId: 'self/a~b' })] }));
  });
});

it('respects transparent boundary strokes during route label placement without changing other callers', () => {
  const edge = { id: 'edge', from: 'a', to: 'b', label: 'Call' };
  const routes = new Map<string, EdgeRoute>([['edge', { edge, points: [[0, 50], [100, 50]], sourceSide: 'right', targetSide: 'left' }]]);
  const sizes = new Map([['edge', { width: 90, height: 20 }]]);
  const boxes = new Map<string, Box>();
  expect(placeRouteLabels(boxes, routes, sizes).centers.size).toBe(1);
  const blockedSegments: [Point, Point][] = [[[0, 45], [100, 45]]];
  expect(placeRouteLabels(boxes, routes, sizes, { blockedSegments }).diagnostics).toMatchObject([{ edgeId: 'edge', code: 'LABEL_NO_SLOT' }]);
});

describe('component label reservation geometry', () => {
  let options: ComponentLayoutOptions;
  beforeAll(async () => { options = { Avoid: (await createLayoutRuntime()).Avoid, measureHeader: () => 96 }; });

  it('preserves legacy cleanup tolerance and removes spurs when no label slot is reserved', () => {
    expect(joinLabelRoute('plain', [[[0, 0], [0.005, 0.005], [10, 0], [10, 10]]], new Map()))
      .toEqual({ points: [[0, 0], [10, 0], [10, 10]] });
    const reversal: Point[] = [[0, 0], [20, 0], [10, 0], [10, 10]];
    expect(joinLabelRoute('plain', [reversal], new Map())).toEqual({ points: [[0, 0], [10, 0], [10, 10]] });
  });

  it('retains retraced geometry only for a fixed-label join and preserves its exact native anchor', () => {
    const before: Point[] = [[0, 40], [40, 40], [40, 80], [40, 60], [60, 60], [60, 40], [100, 40]];
    const after: Point[] = [[180, 40], [220, 40]];
    const joined = joinLabelRoute('reserved', [before, after], new Map([['reserved', { x: 100, y: 20, width: 80, height: 40 }]]));
    expect(joined.diagnostic).toBeUndefined();
    expect(joined.points).toEqual([[0, 40], [40, 40], [40, 80], [40, 60], [60, 60], [60, 40], [220, 40]]);
    const balanced = excalidrawLabelPath(joined.points!, [140, 40]);
    expect(balanced.valid).toBe(true);
    expect(balanced.offset).toBe(0);
    expect(balanced.points[(balanced.points.length - 1) / 2]).toEqual([140, 40]);
  });

  it('refuses a moved fixed central port with the original edge ID and no partial points', () => {
    const joined = joinLabelRoute('edge/a~b', [[[0, 40], [100, 40.001]], [[180, 40], [300, 40]]],
      new Map([['edge/a~b', { x: 100, y: 20, width: 80, height: 40 }]]));
    expect(joined).toMatchObject({ diagnostic: { code: 'ROUTING_FAILED', edgeId: 'edge/a~b', path: '/layout/routes/edge~1a~0b' } });
    expect(joined.points).toBeUndefined();
  });

  it('finishes the dense 16-node/17-edge consumer case in exactly two routing passes, with all exact anchors', () => {
    const input = denseComponentRequest();
    const before = structuredClone(input);
    let transactions = 0;
    const NativeRouter = options.Avoid.Router;
    const Router = function (flags: number) {
      const router = new NativeRouter(flags);
      const process = router.processTransaction.bind(router);
      router.processTransaction = () => { transactions++; process(); };
      return router;
    } as unknown as AvoidRuntime['Router'];
    // Actual Map header measurements retained from native-width-probe-candidate.json.
    const result = layoutComponent(input, { Avoid: { ...options.Avoid, Router }, measureHeader: () => 131 });
    expect(transactions).toBe(2);
    expect(result.diagnostics).toMatchObject([{ code: 'COMPONENT_LABEL_RESERVATION' }]);
    expect([...result.edgeRoutes.keys()].sort()).toEqual(input.relations.map(edge => edge.id).sort());
    expect([...result.messageLabels.keys()].sort()).toEqual(input.relations.map(edge => edge.id).sort());
    expect([...result.boxes.keys()].sort()).toEqual(input.nodes.map(node => node.id).sort());
    // The new wrap budget changes reservation/routes. The separate retained
    // 13-vertex regression below proves the exact 19-point padding case.
    expect(result.edgeRoutes.get('signal-algo')!.points.length).toBeGreaterThan(17);
    const narrow = result.edgeRoutes.get('market-signal')!;
    const span = Math.max(...narrow.points.map(point => point[0])) - Math.min(...narrow.points.map(point => point[0]));
    expect(0.7 * span).toBeLessThan(11 * input.labelFontSize);
    expect(result.messageLabels.get('market-signal')!.text).toBe('Передаёт\nMarketSnapshot');
    assertLabels(result, 19);
    expect(input).toEqual(before);
  });

  it('refuses a failed second transaction without a third pass or a partial result', () => {
    let transactions = 0, deletes = 0;
    const NativeRouter = options.Avoid.Router;
    const Router = function (flags: number) {
      const router = new NativeRouter(flags);
      const process = router.processTransaction.bind(router), release = router.delete.bind(router);
      router.processTransaction = () => { transactions++; if (transactions === 2) throw new Error('second transaction failed'); process(); };
      router.delete = () => { deletes++; release(); };
      return router;
    } as unknown as AvoidRuntime['Router'];
    expect(() => layoutComponent(denseComponentRequest(), { Avoid: { ...options.Avoid, Router }, measureHeader: () => 120 }))
      .toThrowError(expect.objectContaining({ code: 'ROUTING_FAILED' }));
    expect(transactions).toBe(2);
    expect(deletes).toBe(2);
  });

  it('refuses the former approximate 120-unit headers when a route overlaps the workspace stroke', () => {
    expect(() => layoutComponent(denseComponentRequest(), { ...options, measureHeader: () => 120 }))
      .toThrowError(expect.objectContaining({ code: 'ROUTING_FAILED', diagnostics: [expect.objectContaining({ edgeId: 'tinvest-wire', nodeId: 'workspace', message: expect.stringContaining('boundary stroke') })] }));
  });

  it('routes around a foreign label slot, returns only original IDs and crosses each own slot through its exact center', () => {
    const boxes = new Map<string, Box>([
      ['a', { x: 0, y: 0, width: 120, height: 100 }],
      ['b', { x: 700, y: 0, width: 120, height: 100 }],
      ['c', { x: 0, y: 300, width: 120, height: 100 }],
      ['d', { x: 700, y: 300, width: 120, height: 100 }],
    ]);
    const edges = [{ id: 'ab', from: 'a', to: 'b', label: 'exact original' }, { id: 'cd', from: 'c', to: 'd', label: 'second original' }];
    const labelSlots = new Map<string, Box>([
      ['ab', { x: 280, y: 150, width: 220, height: 60 }],
      ['cd', { x: 280, y: 20, width: 220, height: 60 }],
    ]);
    const before = structuredClone({ boxes, edges, labelSlots });
    const routes = routeEdges(boxes, edges, { Avoid: options.Avoid, nodes: [...boxes.keys()].map(id => ({ id, shape: 'rectangle' })), labelSlots, buffer: 4 });
    expect([...routes.keys()]).toEqual(['ab', 'cd']);
    for (const edge of edges) {
      const route = routes.get(edge.id)!, slot = labelSlots.get(edge.id)!;
      expect(route.edge).toBe(edge);
      const center: Point = [slot.x + slot.width / 2, slot.y + slot.height / 2];
      const balanced = excalidrawLabelPath(route.points, center, 2 * route.points.length + 1);
      expect(balanced.offset).toBeLessThan(1e-6);
      expect(balanced.valid).toBe(true);
      expect(balanced.points[(balanced.points.length - 1) / 2]).toEqual(center);
      for (const [foreignId, other] of labelSlots) if (foreignId !== edge.id) {
        expect(route.points.slice(1).some((p, i) => segmentEntersOpenBox([route.points[i], p], { left: other.x, top: other.y, right: other.x + other.width, bottom: other.y + other.height }))).toBe(false);
      }
    }
    expect({ boxes, edges, labelSlots }).toEqual(before);
  });

  it('can reserve a self-loop using two distinct original-node ports', () => {
    const boxes = new Map([['a', { x: 0, y: 0, width: 120, height: 100 }]]);
    const routes = routeEdges(boxes, [{ id: 'retry', from: 'a', to: 'a', label: 'Retry' }], {
      Avoid: options.Avoid, nodes: [{ id: 'a', shape: 'rectangle' }],
      labelSlots: new Map([['retry', { x: 280, y: 0, width: 180, height: 60 }]]), buffer: 4,
    });
    const route = routes.get('retry')!;
    expect(route.points[0]).not.toEqual(route.points.at(-1));
    const balanced = excalidrawLabelPath(route.points, [370, 30], 2 * route.points.length + 1);
    expect(balanced.valid).toBe(true);
    expect(balanced.labelCenter).toEqual([370, 30]);
    expect(balanced.offset).toBe(0);
  });

  it('lays out a real parent self-loop through the normal two-pass component operation', () => {
    const input: ComponentLayoutRequest = {
      nodes: [{ id: 'p', width: 320, height: 96, children: ['a', 'b'] }, { id: 'a', width: 180, height: 120, children: [] }, { id: 'b', width: 180, height: 120, children: [] }],
      roots: ['p'], relations: [{ id: 'retry', from: 'p', to: 'p', label: 'Повтор', headerRail: false }], direction: 'LR', labelFontSize: 16,
    };
    const result = layoutComponent(input, options);
    expect(result.edgeRoutes.get('retry')!.points[0]).not.toEqual(result.edgeRoutes.get('retry')!.points.at(-1));
    assertLabels(result);
  });

  it('exhausts a bounded grid in a million-unit blocked composition without growing the canvas or retrying routing', () => {
    const input: ComponentLayoutRequest = {
      nodes: [{ id: 'parent', width: 320, height: 96, children: ['huge'] }, { id: 'huge', width: 1_000_000, height: 1_000_000, children: [] }],
      roots: ['parent'], relations: [{ id: 'full-condition', from: 'parent', to: 'huge', label: 'Условие '.repeat(40), headerRail: false }], direction: 'LR', labelFontSize: 16,
    };
    const before = structuredClone(input);
    expect(() => layoutComponent(input, options)).toThrowError(expect.objectContaining({ code: 'LABEL_NO_SLOT', diagnostics: [expect.objectContaining({ edgeId: 'full-condition', message: expect.stringContaining('16384') })] }));
    expect(input).toEqual(before);
  }, 2000);
});

it('supports the 13-vertex route with 19 collinear-padded points only under the explicit new-mode bound', () => {
  // Retained geometry regression from the LM-76 fixed-port capability probe.
  const points: Point[] = [[1344, 456], [1424, 456], [1424, 482], [1518, 482], [1518, 572], [1488, 572], [1488, 924], [1597, 924], [1597, 980], [1806, 980], [1806, 776], [1337, 776], [1337, 762]];
  const center: Point = [1709, 980];
  const before = structuredClone(points);
  expect(excalidrawLabelPath(points, center).valid).toBe(false); // Legacy default stays 17.
  const result = excalidrawLabelPath(points, center, 2 * points.length + 1);
  expect(result.valid).toBe(true);
  expect(result.points).toHaveLength(19);
  expect(result.points[9]).toEqual(center);
  expect(result.offset).toBe(0);
  const length = (path: Point[]) => path.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - path[index][0], point[1] - path[index][1]), 0);
  expect(length(result.points)).toBe(length(points));
  // Remove only points on straight forward segments: every original bend survives.
  const significant: Point[] = [];
  for (const p of result.points) {
    significant.push(p);
    while (significant.length >= 3) {
      const [a, b, c] = significant.slice(-3);
      if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) break;
      significant.splice(-2, 1);
    }
  }
  expect(significant).toEqual(points);
  expect(points).toEqual(before);
});

describe('CQ-1 collinear native label padding', () => {
  it.each([5e-7, 1e-6])('projects a center %s off the segment without introducing a bend', offset => {
    const points: Point[] = [[0, 0], [10, 0]];
    const result = excalidrawLabelPath(points, [5, offset]);
    expect(result.valid).toBe(true);
    expect(result.points).toEqual([[0, 0], [5, 0], [10, 0]]);
    expect(result.labelCenter).toEqual([5, 0]);
    expect(result.points[1]).toEqual(result.labelCenter);
    expect(result.offset).toBe(offset);
    expect(result.points.slice(1).every((point, index) => point[1] === result.points[index][1])).toBe(true);
    expect(result.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - result.points[index][0], point[1] - result.points[index][1]), 0)).toBe(10);
    expect(points).toEqual([[0, 0], [10, 0]]);
  });

  it('keeps a truly on-segment floating-point center exact without projection roundoff', () => {
    const center: Point = [287.5263157894737, 125.16666666666667];
    const result = excalidrawLabelPath([[center[0], 100], [center[0], 150]], center);
    expect(result.valid).toBe(true);
    expect(result.points[1]).toEqual(center);
    expect(result.labelCenter).toEqual(center);
    expect(result.offset).toBe(0);
  });

  it('retains a nearby real corner when the exact on-segment center is less than a tolerance away', () => {
    const points: Point[] = [[0, 0], [10, 0], [10, 10]];
    const center: Point = [10 - 5e-7, 0];
    const result = excalidrawLabelPath(points, center);
    expect(result.valid).toBe(true);
    expect(result.points[(result.points.length - 1) / 2]).toEqual(center);
    expect(result.points).toContainEqual([10, 0]);
    expect(result.points.slice(1).every((point, index) => point[0] === result.points[index][0] || point[1] === result.points[index][1])).toBe(true);
    expect(result.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - result.points[index][0], point[1] - result.points[index][1]), 0)).toBe(20);
  });
});

/** Retained consumer geometry and exact visible strings; no domain inference in the solver. */
function denseComponentRequest(): ComponentLayoutRequest {
  const leaves = ['market', 'signal', 'account', 'control', 'algorithm', 'prediction', 'arenago', 'tinvest', 'facts', 'pnl', 'status'];
  const edgeRows = [
    ['account-arena', 'account', 'arenago', 'Вызывает place с\nдельтой\n[ArenaGo; selected и\nфинальная проверка]'],
    ['account-tinvest', 'account', 'tinvest', 'Вызывает place с\nдельтой\n[T-Invest; selected и\nфинальная проверка]'],
    ['arena-facts', 'arenago', 'account', 'Даёт snapshot и события'],
    ['arena-wire', 'arenago', 'arena-api', 'Отправляет и сверяет\nзаявку'],
    ['bootstrap-journal', 'control', 'facts', 'Записывает bootstrap'],
    ['control-observe', 'control', 'signal', 'Вызывает observe'],
    ['fill-journal', 'account', 'facts', 'Записывает принятый fill\n[подтверждённое\nисполнение]'],
    ['market-signal', 'market', 'signal', 'Передаёт MarketSnapshot'],
    ['moex-market', 'moex', 'market', 'Передаёт M5 / H1'],
    ['pnl-journal', 'pnl', 'facts', 'Читает bootstrap и fill\n[только account-facts v1]'],
    ['pnl-marks', 'pnl', 'arena-api', 'Читает текущие цены\n[режим\nserve]'],
    ['publish-status', 'control', 'status', 'Публикует status v10'],
    ['signal-account', 'signal', 'account', 'Передаёт\nTickerObservation'],
    ['signal-algo', 'signal', 'algorithm', 'Вычисляет сигнал\nправила\n[algorithmic; входы\nготовы]'],
    ['signal-model', 'signal', 'prediction', 'Вычисляет сигнал\nмодели\n[model; вход M5 готов]'],
    ['tinvest-facts', 'tinvest', 'account', 'Даёт snapshot и\nsettlement'],
    ['tinvest-wire', 'tinvest', 'tinvest-api', 'Отправляет и сверяет\nзаявку'],
  ];
  return {
    nodes: [
      ...leaves.map(id => ({ id, width: 320, height: 181, children: [] })),
      { id: 'moex', width: 320, height: 209, children: [] },
      { id: 'arena-api', width: 320, height: 184, children: [] },
      { id: 'tinvest-api', width: 320, height: 209, children: [] },
      { id: 'workspace', width: 320, height: 96, children: ['trade', 'facts', 'pnl', 'status'], composition: { row: ['trade', { column: ['facts', 'pnl', 'status'] }] } },
      { id: 'trade', width: 320, height: 96, children: leaves.slice(0, 8), composition: { column: [{ row: ['market', 'signal', 'account'] }, { row: ['control', 'algorithm', 'prediction'] }, { row: ['arenago', 'tinvest'] }] } },
    ],
    roots: ['moex', 'arena-api', 'tinvest-api', 'workspace'],
    rootComposition: { row: [{ column: ['moex', 'arena-api', 'tinvest-api'] }, 'workspace'] },
    relations: edgeRows.map(([id, from, to, label]) => ({ id, from, to, label, headerRail: false })), direction: 'LR', labelFontSize: 19,
  };
}
