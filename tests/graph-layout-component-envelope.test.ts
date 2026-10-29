import { describe, expect, it } from 'vitest';
import { admitCompactRoutes, completeCompactFrames, strokeClearanceBudget } from '../src/graph-layout/component-clearance.js';
import type { CompactContext, CompactGeometry } from '../src/graph-layout/component-clearance.js';
import type { AvoidRuntime } from '../src/graph-layout/runtime-types.js';
import type { Box, EdgeRoute, Point } from '../src/graph-layout/types.js';
function framed(height: number, pointError = .005) {
    const parent = { id: 'enclosure', width: 100, height: 100, children: ['leaf'] }, leaf = { id: 'leaf', width: 60, height, children: [] };
    const paint = { routes: new Map(), frames: new Map([['enclosure', { width: 2, cap: 'round' as const }]]), nodes: new Map([['enclosure', { outset: 0 }], ['leaf', { outset: 1 }]]), clearance: 4, pointError: { x: pointError, y: pointError } };
    const ctx: CompactContext = { request: { nodes: [parent, leaf], roots: ['enclosure'], relations: [], direction: 'LR', labelFontSize: 19 }, options: { headerMode: 'title-only', Avoid: {} as AvoidRuntime, measureHeader: () => ({ width: 80, height: 20 }), measureLabel: () => { throw new Error('No labels'); }, paint }, nodes: new Map([['enclosure', parent], ['leaf', leaf]]), parent: new Map([['leaf', 'enclosure']]), expanded: new Set(['enclosure']), titles: new Map([['enclosure', { width: 80, height: 20 }]]), labels: new Map(), counts: {}, budget: strokeClearanceBudget(4, paint.pointError), pitch: 0 };
    const g: CompactGeometry = { boxes: new Map([['enclosure', { x: 0, y: 0, width: 100, height: 100 }], ['leaf', { x: 20, y: 50, width: 60, height }]]), headerBoxes: new Map([['enclosure', { x: 10, y: 10, width: 80, height: 20 }]]), containers: new Set(['enclosure']), interfaces: [], slots: new Map(), placements: new Map(), area: { x: 0, y: 0, width: 100, height: 100 } };
    return { ctx, g };
}
describe('full source paint containment', () => {
    it('contains positive leaf paint and the transparent own title without inventing a card gap4', () => {
        const { ctx, g } = framed(45);
        expect(() => admitCompactRoutes(ctx, g, new Map(), true)).not.toThrow();
        const result = completeCompactFrames(ctx, g, new Map());
        expect(result.boxes).toEqual(g.boxes);
        expect(ctx.counts.framePasses).toBe(1);
        expect(ctx.counts.frameSides).toBe(4);
    });
    it('rejects a visible child stroke touching the inner boundary even though the nominal box is contained', () => {
        const { ctx, g } = framed(48);
        expect(() => admitCompactRoutes(ctx, g, new Map(), true)).toThrowError(expect.objectContaining({ code: 'FRAME_PAINT_CONTAINMENT' }));
        expect(() => completeCompactFrames(ctx, g, new Map())).toThrowError(expect.objectContaining({ code: 'NO_LEGAL_FRAME_STROKE' }));
    });
    it('keeps the source Q bound strict, while zero point error admits exact nonnegative containment', () => {
        const { ctx, g } = framed(48 - Math.hypot(.005, .005));
        expect(() => admitCompactRoutes(ctx, g, new Map(), true)).toThrowError(expect.objectContaining({ code: 'FRAME_PAINT_CONTAINMENT' }));
        const actual = framed(48, 0);
        expect(() => admitCompactRoutes(actual.ctx, actual.g, new Map(), true)).not.toThrow();
    });
});

function routedObstacle(foreign: Box, outset: number, width: number, points: Point[] = [[0, 50], [100, 50]], title = false) {
    const edge = { id: 'cross', from: 'source', to: 'target', label: 'Cross', headerRail: false };
    const boxes = new Map<string, Box>([
        ['source', { x: -20, y: 40, width: 20, height: 20 }],
        ['target', { x: 100, y: 40, width: 20, height: 20 }],
        ['foreign', foreign],
    ]);
    const nodes = [...boxes].map(([id, b]) => ({ id, width: b.width, height: b.height, children: [] }));
    const paint = { routes: new Map([['cross', { width, cap: 'round' as const }]]), frames: new Map(),
        nodes: new Map(nodes.map(n => [n.id, { outset: n.id === 'foreign' ? outset : .75 }])),
        clearance: 4, pointError: { x: .005, y: .005 } };
    const ctx: CompactContext = { request: { nodes, roots: nodes.map(n => n.id), relations: [edge], direction: 'LR', labelFontSize: 19 },
        options: { headerMode: 'title-only', Avoid: {} as AvoidRuntime, measureHeader: () => { throw new Error('No measurement'); },
            measureLabel: () => { throw new Error('No measurement'); }, paint },
        nodes: new Map(nodes.map(n => [n.id, n])), parent: new Map(), expanded: new Set(), titles: new Map(), labels: new Map(),
        counts: {}, budget: strokeClearanceBudget(4, paint.pointError), pitch: 0 };
    const g: CompactGeometry = { boxes, headerBoxes: title ? new Map([['foreign', foreign]]) : new Map(), containers: new Set(),
        interfaces: [], slots: new Map(), placements: new Map(), area: { x: -30, y: -100, width: 200, height: 250 } };
    const routes = new Map<string, EdgeRoute>([['cross', { edge, points, sourceSide: 'right', targetSide: 'left' }]]);
    return { ctx, g, routes };
}

describe('route contact with foreign leaf/title paint', () => {
    it.each([false, true])('rejects nominal-clear paint overlap against a %s title obstacle', title => {
        const { ctx, g, routes } = routedObstacle({ x: 30, y: 60, width: 40, height: 20 }, 11, 1.75, undefined, title);
        // Nominal centerline gap10; paint gap10-11-.875 = -1.875.
        expect(() => admitCompactRoutes(ctx, g, routes, false)).toThrowError(expect.objectContaining({
            code: 'ROUTE_THROUGH_NODE', diagnostics: [expect.objectContaining({ edgeId: 'cross', nodeId: 'foreign' })],
        }));
    });
    it('uses each route halfwidth even when the foreign node has no outset', () => {
        const { ctx, g, routes } = routedObstacle({ x: 30, y: 51, width: 40, height: 20 }, 0, 4);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).toThrowError(expect.objectContaining({ code: 'ROUTE_THROUGH_NODE' }));
        ctx.options.paint.routes = new Map([['cross', { width: 1, cap: 'round' }]]);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).not.toThrow();
    });
    it('includes round endpoint caps when the finite support stops before the foreign envelope', () => {
        const { ctx, g, routes } = routedObstacle({ x: 51, y: 49, width: 10, height: 10 }, 0, 4, [[0, 50], [50, 50]]);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).toThrowError(expect.objectContaining({ code: 'ROUTE_THROUGH_NODE' }));
    });
    it('keeps a positive diagonal corner gap instead of treating the round cap as a square', () => {
        const { ctx, g, routes } = routedObstacle({ x: 51.5, y: 51.5, width: 10, height: 10 }, 0, 4, [[0, 50], [50, 50]]);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).not.toThrow();
    });
    it('allows separated foreign paint and its own terminal contour contacts', () => {
        const { ctx, g, routes } = routedObstacle({ x: 30, y: 60, width: 40, height: 20 }, 1, 1.75);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).not.toThrow();
    });
    it('still rejects a route through its own nominal node interior', () => {
        const { ctx, g, routes } = routedObstacle({ x: 30, y: 100, width: 40, height: 20 }, 0, 1.75, [[-10, 50], [100, 50]]);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).toThrowError(expect.objectContaining({ code: 'ROUTE_THROUGH_NODE' }));
    });
    it('preserves the exact-axis one-ULP bridge instead of creating a diagonal during admission', () => {
        const points: Point[] = [[1651, 1108.75], [1651, 1114.75], [1650.9999999999998, 1114.75], [1650.9999999999998, 1120.75]];
        const { ctx, g, routes } = routedObstacle({ x: 3000, y: 3000, width: 40, height: 20 }, 0, 1.75, points);
        const before = structuredClone(points);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).not.toThrow();
        expect(points).toEqual(before);
    });
    it('still refuses a genuine diagonal even when one axis changes by less than the old cleanup epsilon', () => {
        const { ctx, g, routes } = routedObstacle({ x: 3000, y: 3000, width: 40, height: 20 }, 0, 1.75, [[0, 50], [100, 50 + 1e-13]]);
        expect(() => admitCompactRoutes(ctx, g, routes, false)).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_COMPACT_GEOMETRY' }));
    });
});
