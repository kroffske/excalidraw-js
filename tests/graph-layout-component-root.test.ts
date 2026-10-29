import { describe, expect, it } from 'vitest';
import { compactPaintedCapacity, transportCompact, finiteStrokeClearance, strokeClearanceBudget } from '../src/graph-layout/component-clearance.js';
import type { CompactContext, CompactGeometry } from '../src/graph-layout/component-clearance.js';
import type { Box, ComponentLayoutRequest, Point } from '../src/graph-layout/types.js';
import type { DetailedRoutingResult, LocalPin, RoutingTerminal } from '../src/graph-layout/routing.js';
import type { AvoidRuntime } from '../src/graph-layout/runtime-types.js';
function corner() {
    const boxes = new Map<string, Box>([['source-a', { x: 20, y: 200, width: 20, height: 20 }], ['target-a', { x: 70, y: -20, width: 20, height: 20 }], ['source-b', { x: 20, y: 300, width: 20, height: 20 }], ['target-b', { x: 94.34, y: 20, width: 20, height: 20 }]]);
    const slots = new Map<string, Box>([['first', { x: 80, y: 60, width: 40, height: 20 }], ['second', { x: 160, y: 100, width: 40, height: 20 }]]), area = { x: -100, y: -100, width: 500, height: 500 };
    const request: ComponentLayoutRequest = { nodes: [...boxes].map(([id, b]) => ({ id, width: b.width, height: b.height, children: [] })), roots: [...boxes.keys()], relations: [{ id: 'first', from: 'source-a', to: 'target-a', label: 'First', headerRail: false }, { id: 'second', from: 'source-b', to: 'target-b', label: 'Second', headerRail: false }], direction: 'LR', labelFontSize: 19 };
    const right: LocalPin = { side: 'right', x: 1, y: .5 }, bottom: LocalPin = { side: 'bottom', x: .5, y: 1 }, pins = new Map(request.relations.map(e => [e.id, { source: right, target: bottom }]));
    const node = (edgeId: string, role: 'source' | 'target'): RoutingTerminal => ({ kind: 'node', nodeId: request.relations.find(e => e.id === edgeId)![role === 'source' ? 'from' : 'to'], role, pin: pins.get(edgeId)![role] });
    const cap = (edgeId: string, side: 'top' | 'bottom'): RoutingTerminal => ({ kind: 'caption', edgeId, side });
    const leg = (edgeId: string, from: RoutingTerminal, to: RoutingTerminal, points: Point[]) => ({ edgeId, from, to, points });
    const routed: DetailedRoutingResult = { routes: new Map(), nodePins: pins, labelPins: new Map(), legs: new Map([
            ['first', [leg('first', node('first', 'source'), cap('first', 'bottom'), [[40, 210], [100, 210], [100, 80]]), leg('first', cap('first', 'top'), node('first', 'target'), [[100, 60], [100, 50], [80, 50], [80, 0]])]],
            ['second', [leg('second', node('second', 'source'), cap('second', 'bottom'), [[40, 310], [180, 310], [180, 120]]), leg('second', cap('second', 'top'), node('second', 'target'), [[180, 100], [180, 50], [104.34, 50], [104.34, 40]])]],
        ]) };
    const placements: CompactGeometry['placements'] = new Map([...slots].map(([id, b]) => [id, { kind: 'independent' as const, origin: 'grid' as const, domainOwner: null, u: (b.x - area.x - 16) / (area.width - b.width - 32), v: (b.y - area.y - 16) / (area.height - b.height - 32) }]));
    const geometry: CompactGeometry = { boxes, headerBoxes: new Map(), containers: new Set(), slots, placements, interfaces: [], area };
    const budget = strokeClearanceBudget(4, { x: .005, y: .005 }), ctx: CompactContext = { request, options: { headerMode: 'title-only', Avoid: {} as AvoidRuntime, measureHeader: () => { throw new Error('No measurement during transfer'); }, measureLabel: () => { throw new Error('No measurement during transfer'); }, paint: { nodes: new Map([...boxes.keys()].map(id => [id, { outset: 0 }])), routes: new Map(request.relations.map(e => [e.id, { width: 1.75, cap: 'round' as const }])), frames: new Map(), clearance: 4, pointError: { x: .005, y: .005 } } }, nodes: new Map(request.nodes.map(n => [n.id, n])), parent: new Map(), expanded: new Set(), titles: new Map(), labels: new Map(request.relations.map(e => [e.id, { text: e.label, width: 40, height: 20 }])), budget, pitch: 1.75 + budget.designGap, counts: { wallChecks: 0, pairChecks: 0 } };
    return { ctx, geometry, routed };
}
describe('current-invocation root terminal constraints', () => {
    it('uses one captionX constraint for the vertical corner and its collinear adjacent horizontal companion', () => {
        const { ctx, geometry, routed } = corner(), before = structuredClone(geometry.slots);
        expect(() => compactPaintedCapacity(ctx, geometry, routed)).not.toThrow();
        const result = transportCompact(ctx, geometry, { ...geometry, boxes: new Map(geometry.boxes), slots: new Map() }, routed, new Map([['first', ['bottom', 'top']], ['second', ['bottom', 'top']]]));
        const x = result.geometry.slots.get('first')!.x + 20;
        expect(x).toBeLessThanOrEqual(104.34 - ctx.pitch);
        const vertical = finiteStrokeClearance({ points: [[x, 50], [x, 60]], width: 1.75, cap: 'round' }, { points: [[104.34, 40], [104.34, 50]], width: 1.75, cap: 'round' });
        const companion = finiteStrokeClearance({ points: [[80, 50], [x, 50]], width: 1.75, cap: 'round' }, { points: [[104.34, 50], [180, 50]], width: 1.75, cap: 'round' });
        expect(vertical.gap).toBeGreaterThanOrEqual(ctx.budget.requiredGap);
        expect(companion.gap).toBeGreaterThanOrEqual(ctx.budget.requiredGap);
        expect(geometry.slots).toEqual(before);
        expect(result.nodePins).toEqual(routed.nodePins);
        expect(ctx.counts.captionCoordinates).toBeLessThanOrEqual(4);
        expect(ctx.counts.dagPasses).toBe(2);
    });
    it('keeps two free caption coordinates in the existing order without a second placement', () => {
        const { ctx, geometry, routed } = corner();
        geometry.slots.set('second', { x: 84.34, y: 110, width: 40, height: 20 });
        geometry.boxes.set('target-b', { x: 210, y: 20, width: 20, height: 20 });
        const p = geometry.placements.get('second')!;
        if (p.kind === 'independent') {
            p.u = (84.34 + 100 - 16) / 428;
            p.v = (110 + 100 - 16) / 448;
        }
        routed.legs.get('first')![0].points = [[40, 210], [50, 210], [50, 94], [100, 94], [100, 80]];
        routed.legs.get('second')![0].points = [[40, 310], [104.34, 310], [104.34, 130]];
        routed.legs.get('second')![1].points = [[104.34, 110], [104.34, 96], [220, 96], [220, 40]];
        compactPaintedCapacity(ctx, geometry, routed);
        const result = transportCompact(ctx, geometry, { ...geometry, boxes: new Map(geometry.boxes), slots: new Map() }, routed, new Map([['first', ['bottom', 'top']], ['second', ['bottom', 'top']]]));
        const a = result.geometry.slots.get('first')!.x + 20, b = result.geometry.slots.get('second')!.x + 20;
        expect(a).toBeLessThan(b);
        expect(finiteStrokeClearance({ points: [[a, 80], [a, 94]], width: 1.75, cap: 'round' }, { points: [[b, 96], [b, 110]], width: 1.75, cap: 'round' }).gap).toBeGreaterThanOrEqual(ctx.budget.requiredGap);
        expect(ctx.counts.captionCoordinates).toBe(4);
        expect(ctx.counts.dagPasses).toBe(2);
    });
    it('refuses a fixed straight-leg anchor whose finite contact cannot be moved by a free caption axis', () => {
        const { ctx, geometry, routed } = corner();
        geometry.boxes.set('target-a', { x: 99.75, y: 30, width: .5, height: 20 });
        geometry.boxes.set('target-b', { x: 104.09, y: 20, width: .5, height: 20 });
        geometry.slots.set('first', { x: 80, y: 64, width: 40, height: 20 });
        const p = geometry.placements.get('first')!;
        if (p.kind === 'independent')
            p.v = (64 + 100 - 16) / 448;
        routed.legs.get('first')![0].points = [[40, 210], [100, 210], [100, 84]];
        routed.legs.get('first')![1].points = [[100, 64], [100, 50]];
        compactPaintedCapacity(ctx, geometry, routed);
        expect(() => transportCompact(ctx, geometry, { ...geometry, boxes: new Map(geometry.boxes), slots: new Map() }, routed, new Map([['first', ['bottom', 'top']], ['second', ['bottom', 'top']]]))).toThrowError(expect.objectContaining({ code: 'CAPTION_CLEARANCE_UNSATISFIED' }));
    });
    it('does not jump to another connected region when a moved obstacle blocks the retained root position', () => {
        const { ctx, geometry, routed } = corner();
        geometry.boxes.set('blocker', { x: -80, y: 60, width: 20, height: 20 });
        ctx.nodes.set('blocker', { id: 'blocker', width: 20, height: 20, children: [] });
        compactPaintedCapacity(ctx, geometry, routed);
        const after = { ...geometry, boxes: new Map(geometry.boxes), slots: new Map<string, Box>() };
        after.boxes.set('blocker', { x: 75, y: 60, width: 20, height: 20 });
        expect(() => transportCompact(ctx, geometry, after, routed, new Map([['first', ['bottom', 'top']], ['second', ['bottom', 'top']]]))).toThrowError(expect.objectContaining({ code: 'CAPTION_CLEARANCE_UNSATISFIED' }));
    });
});
