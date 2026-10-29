import { expect, it } from 'vitest';
import { compactPaintedCapacity, strokeClearanceBudget, transportCompact } from '../src/graph-layout/component-clearance.js';
import type { CompactContext, CompactGeometry } from '../src/graph-layout/component-clearance.js';
import type { Box, ComponentLayoutRequest, Point } from '../src/graph-layout/types.js';
import type { DetailedRoutingResult, LocalPin, RoutingTerminal } from '../src/graph-layout/routing.js';
import type { AvoidRuntime } from '../src/graph-layout/runtime-types.js';
function microWallFixture(extra?: Box) {
    const edgeId = 'record', boxes = new Map<string, Box>([
        ['writer', { x: 1400, y: 800, width: 100, height: 80 }],
        ['journal', { x: 1426, y: 1120.75, width: 320, height: 181 }],
        ...(extra ? [['control', extra] as [string, Box]] : []),
    ]);
    const slot = { x: 1560.5, y: 1031.5, width: 181, height: 77.25 };
    const request: ComponentLayoutRequest = { nodes: [...boxes].map(([id, b]) => ({ id, width: b.width, height: b.height, children: [] })),
        roots: [...boxes.keys()], relations: [{ id: edgeId, from: 'writer', to: 'journal', label: 'Record', headerRail: false }], direction: 'LR', labelFontSize: 19 };
    const nodePins = new Map([[edgeId, { source: { side: 'bottom' as const, x: .5, y: 1 }, target: { side: 'top' as const, x: .7031249999999996, y: 0 } }]]);
    const routed: DetailedRoutingResult = { routes: new Map(), nodePins, labelPins: new Map(), legs: new Map([[edgeId, [
        { edgeId, from: { kind: 'node', nodeId: 'writer', role: 'source', pin: nodePins.get(edgeId)!.source },
            to: { kind: 'caption', edgeId, side: 'top' }, points: [[1450, 880], [1450, 1000], [1651, 1000], [1651, 1031.5]] },
        { edgeId, from: { kind: 'caption', edgeId, side: 'bottom' },
            to: { kind: 'node', nodeId: 'journal', role: 'target', pin: nodePins.get(edgeId)!.target },
            points: [[1651, 1108.75], [1651, 1114.75], [1650.9999999999998, 1114.75], [1650.9999999999998, 1120.75]] },
    ]]]) };
    const geometry: CompactGeometry = { boxes, headerBoxes: new Map(), containers: new Set(), slots: new Map([[edgeId, slot]]),
        placements: new Map([[edgeId, { kind: 'interface', interfaceKey: 'band', fraction: .5 }]]),
        interfaces: [{ key: 'band', owner: null, axis: 'column', neighbors: [['writer'], ['journal']], members: [...boxes.keys()],
            x: 1300, y: 900, width: 600, height: 220, gap: 220, cross: 600, assigned: [edgeId] }],
        area: { x: 1000, y: 700, width: 1200, height: 800 } };
    const paint = { routes: new Map([[edgeId, { width: 1.75, cap: 'round' as const }]]), frames: new Map(),
        nodes: new Map([...boxes.keys()].map(id => [id, { outset: 0 }])), clearance: 4, pointError: { x: .005, y: .005 } };
    const budget = strokeClearanceBudget(4, paint.pointError);
    const ctx: CompactContext = { request, options: { headerMode: 'title-only', Avoid: {} as AvoidRuntime,
        measureHeader: () => { throw new Error('No measurement'); }, measureLabel: () => { throw new Error('No measurement'); }, paint },
        nodes: new Map(request.nodes.map(n => [n.id, n])), parent: new Map(), expanded: new Set(), titles: new Map(),
        labels: new Map([[edgeId, { text: 'Record', width: slot.width, height: slot.height }]]),
        counts: { wallChecks: 0, pairChecks: 0 }, budget, pitch: 1.75 + budget.designGap };
    return { ctx, geometry, routed };
}

it('retains positive one-ULP overlap as two existing wall references', () => {
    const { ctx, geometry, routed } = microWallFixture();
    compactPaintedCapacity(ctx, geometry, routed);
    const b = ctx.retained!.bounds.find(b => b.support.id === '["record",1,1]')!;
    expect(b.L).toBe(1112.75);
    expect(b.U).toBe(1116.75);
    expect(b.lower).toContainEqual({ value: 1112.75, wall: { kind: 'caption', id: 'record', face: 'high' } });
    expect(b.upper).toContainEqual({ value: 1116.75, wall: { kind: 'node', id: 'journal', face: 'low' } });
    expect(b.support.terminals).toEqual([]);
});

it('uses the existing wall transfer for the micro-overlap without inventing an elbow reference', () => {
    const { ctx, geometry, routed } = microWallFixture();
    const before = structuredClone(routed);
    compactPaintedCapacity(ctx, geometry, routed);
    const transferred = transportCompact(ctx, geometry, geometry, routed, new Map([['record', ['top', 'bottom']]]));
    expect(transferred.nodePins).toEqual(routed.nodePins);
    expect(transferred.geometry.slots).toEqual(geometry.slots);
    expect(ctx.counts.dagPasses).toBe(2);
    expect(routed).toEqual(before);
});

it.each([0, 1])('still skips a control obstacle with zero/negative along overlap (separation %s)', separation => {
    const { ctx, geometry, routed } = microWallFixture({ x: 1655 + separation, y: 950, width: 10, height: 10 });
    compactPaintedCapacity(ctx, geometry, routed);
    const b = ctx.retained!.bounds.find(b => b.support.id === '["record",1,1]')!;
    expect([...b.lower, ...b.upper].some(bound => bound.wall?.id === 'control')).toBe(false);
});

it('keeps a genuinely unbounded elbow as an explicit refusal', () => {
    const { ctx, geometry, routed } = microWallFixture();
    routed.legs.get('record')![1].points = [[1651, 1108.75], [1651, 1114.75], [500, 1114.75], [500, 900],
        [600, 900], [600, 1114.75], [1650.9999999999998, 1114.75], [1650.9999999999998, 1120.75]];
    compactPaintedCapacity(ctx, geometry, routed);
    try {
        transportCompact(ctx, geometry, geometry, routed, new Map([['record', ['top', 'bottom']]]));
        throw new Error('Expected explicit unbounded refusal');
    } catch (error) {
        expect(error).toMatchObject({ code: 'CAPACITY_DEMAND_NOT_EXPRESSIBLE', message: expect.stringContaining('An unbounded elbow has no transferable reference.') });
        const message = (error as Error).message, detail = JSON.parse(message.slice(message.indexOf('{')));
        expect(detail).toMatchObject({ stage: 'M2/freshNormals', support: { id: '["record",1,3]', axis: 1, terminals: [] },
            old: { L: '-Infinity', U: 'Infinity', lower: [], upper: [] }, current: { L: '-Infinity', U: 'Infinity', lower: [], upper: [] } });
        expect(detail.neighbors).toHaveLength(2);
    }
});

it('reserves a shared band from four full segments constrained by different captions on different portions', () => {
    const boxes = new Map<string, Box>([['right-branch', { x: 62, y: -20, width: 20, height: 240 }], ['left-boundary', { x: -22, y: 200, width: 20, height: 20 }], ['target-first', { x: -400, y: -50, width: 20, height: 20 }], ['target-second', { x: -400, y: 220, width: 20, height: 20 }], ['target-rest', { x: -400, y: -20, width: 20, height: 40 }]]);
    const relations = [{ id: 'first', to: 'target-first', y: 160 }, { id: 'second', to: 'target-second', y: 0 }, { id: 'third', to: 'target-rest', y: 200 }, { id: 'fourth', to: 'target-rest', y: 180 }];
    const request: ComponentLayoutRequest = { nodes: [...boxes].map(([id, b]) => ({ id, width: b.width, height: b.height, children: [] })), roots: [...boxes.keys()], relations: relations.map(e => ({ id: e.id, from: 'right-branch', to: e.to, label: e.id, headerRail: false })), direction: 'LR', labelFontSize: 19 };
    const slots = new Map<string, Box>([['first', { x: 10, y: 20, width: 40, height: 20 }], ['second', { x: 10, y: 100, width: 40, height: 20 }], ['third', { x: -200, y: -15, width: 40, height: 10 }], ['fourth', { x: -300, y: 5, width: 40, height: 10 }]]);
    const nodePins = new Map(relations.map((e, i) => [e.id, { source: { side: 'left' as const, x: 0, y: (e.y + 20) / 240 }, target: { side: 'right' as const, x: 1, y: i < 2 ? .5 : i === 2 ? .25 : .75 } }]));
    const node = (id: string, role: 'source' | 'target'): RoutingTerminal => ({ kind: 'node', nodeId: role === 'source' ? 'right-branch' : relations.find(e => e.id === id)!.to, role, pin: nodePins.get(id)![role] });
    const cap = (edgeId: string, side: LocalPin['side']): RoutingTerminal => ({ kind: 'caption', edgeId, side });
    const leg = (id: string, from: RoutingTerminal, to: RoutingTerminal, points: Point[]) => ({ edgeId: id, from, to, points });
    const routed: DetailedRoutingResult = { routes: new Map(), nodePins, labelPins: new Map(), legs: new Map([
            ['first', [leg('first', node('first', 'source'), cap('first', 'bottom'), [[62, 160], [54.4, 160], [54.4, 80], [30, 80], [30, 40]]), leg('first', cap('first', 'top'), node('first', 'target'), [[30, 20], [30, -40], [-380, -40]])]],
            ['second', [leg('second', node('second', 'source'), cap('second', 'top'), [[62, 0], [55.6, 0], [55.6, 90], [30, 90], [30, 100]]), leg('second', cap('second', 'bottom'), node('second', 'target'), [[30, 120], [30, 230], [-380, 230]])]],
            ['third', [leg('third', node('third', 'source'), cap('third', 'right'), [[62, 200], [56.8, 200], [56.8, -10], [-160, -10]]), leg('third', cap('third', 'left'), node('third', 'target'), [[-200, -10], [-380, -10]])]],
            ['fourth', [leg('fourth', node('fourth', 'source'), cap('fourth', 'right'), [[62, 180], [58, 180], [58, 10], [-260, 10]]), leg('fourth', cap('fourth', 'left'), node('fourth', 'target'), [[-300, 10], [-380, 10]])]],
        ]) };
    const placements: CompactGeometry['placements'] = new Map([...slots].map(([id]) => [id, id === 'first' || id === 'second' ? { kind: 'interface' as const, interfaceKey: 'rail', fraction: .5 } : { kind: 'independent' as const, origin: 'grid' as const, domainOwner: null, u: .1, v: .1 }]));
    const geometry: CompactGeometry = { boxes, headerBoxes: new Map(), containers: new Set(), slots, placements, interfaces: [{ key: 'rail', owner: null, axis: 'row', neighbors: [['left-boundary'], ['right-branch']], members: [...boxes.keys()], x: -2, y: -20, width: 64, height: 240, gap: 64, cross: 240, assigned: ['first', 'second'] }], area: { x: -500, y: -100, width: 700, height: 500 } };
    const paint = { routes: new Map(request.relations.map(e => [e.id, { width: 1.75, cap: 'round' as const }])), frames: new Map(), nodes: new Map([...boxes.keys()].map(id => [id, { outset: 0 }])), clearance: 4, pointError: { x: .005, y: .005 } }, budget = strokeClearanceBudget(4, paint.pointError);
    const ctx: CompactContext = { request, options: { headerMode: 'title-only', Avoid: {} as AvoidRuntime, measureHeader: () => { throw new Error('No remeasurement'); }, measureLabel: () => { throw new Error('No remeasurement'); }, paint }, nodes: new Map(request.nodes.map(n => [n.id, n])), parent: new Map(), expanded: new Set(), titles: new Map(), labels: new Map([...slots].map(([id, b]) => [id, { text: id, width: b.width, height: b.height }])), counts: { wallChecks: 0, pairChecks: 0 }, budget, pitch: 1.75 + budget.designGap };
    const margins = compactPaintedCapacity(ctx, geometry, routed);
    expect(margins.get('rail')!.before).toBe(12);
    expect(margins.get('rail')!.after).toBeCloseTo(8 + 3 * ctx.pitch, 10);
    const channel = ctx.retained!.bounds.filter(b => b.support.axis === 0 && b.support.normal >= 54 && b.support.normal <= 58 && !b.support.terminals.length);
    expect(channel).toHaveLength(4);
    expect(channel.every(b => b.L === 54 && b.U === 58)).toBe(true);
    expect(new Set(channel.flatMap(b => b.lower.filter(v => v.value === 54).map(v => v.wall?.id))).size).toBe(2);
    expect(ctx.counts.wallChecks).toBeLessThanOrEqual(ctx.counts.supports * (boxes.size + slots.size));
    expect(ctx.counts.pairChecks).toBeLessThanOrEqual(ctx.counts.supports * (ctx.counts.supports - 1) / 2);
});
