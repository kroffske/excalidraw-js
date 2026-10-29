import { beforeAll, describe, expect, it, vi } from 'vitest';
import { layoutComponent } from '../src/graph-layout/component.js';
import { createLayoutRuntime } from '../src/graph-layout/engines-node.js';
import { routeEdgesDetailed } from '../src/graph-layout/routing.js';
import { matchesTextReflow, wrapText } from '../src/graph-layout/index.js';
import type { CompactComponentLayoutOptions, ComponentLayoutRequest } from '../src/graph-layout/types.js';
import type { AvoidRuntime } from '../src/graph-layout/runtime-types.js';
function simple(): ComponentLayoutRequest { return { nodes: [{ id: 'owner', width: 1, height: 1, children: ['producer', 'consumer'], composition: { row: ['producer', 'consumer'] } }, { id: 'producer', width: 160, height: 100, children: [] }, { id: 'consumer', width: 170, height: 120, children: [] }], roots: ['owner'], relations: [{ id: 'deliver', from: 'producer', to: 'consumer', label: 'Deliver', headerRail: false, inline: true }], direction: 'LR', labelFontSize: 19 }; }
function options(Avoid: AvoidRuntime, r = simple()): CompactComponentLayoutOptions { return { headerMode: 'title-only', Avoid, measureHeader: vi.fn(() => ({ width: 180, height: 32 })), measureLabel: vi.fn((_id, text) => ({ text, width: 90, height: 36 })), paint: { nodes: new Map(r.nodes.map(n => [n.id, { outset: n.children.length ? 0 : .75 }])), routes: new Map(r.relations.map(e => [e.id, { width: 1.75, cap: 'round' as const }])), frames: new Map(r.nodes.filter(n => n.children.length).map(n => [n.id, { width: 2, cap: 'round' as const }])), clearance: 4, pointError: { x: .005, y: .005 } } }; }
describe('fresh title-only producer admission', () => {
    let Avoid: AvoidRuntime;
    beforeAll(async () => { Avoid = (await createLayoutRuntime()).Avoid; });
    it('rejects malformed composition and inline parent intent before measurement or native resources', () => {
        const r = simple(), o = options(Avoid);
        r.nodes[0].composition = { row: ['producer', 'producer'] };
        expect(() => layoutComponent(r, o)).toThrow();
        expect(o.measureHeader).not.toHaveBeenCalled();
        expect(o.measureLabel).not.toHaveBeenCalled();
        const parent = simple();
        parent.relations[0].from = 'owner';
        const p = options(Avoid, parent);
        expect(() => layoutComponent(parent, p)).toThrowError(expect.objectContaining({ code: 'INVALID_INLINE_INTENT' }));
        expect(p.measureHeader).not.toHaveBeenCalled();
    });
    it('rejects incomplete paint before calling measurement', () => {
        const o = options(Avoid);
        o.paint.routes = new Map();
        expect(() => layoutComponent(simple(), o)).toThrow();
        expect(o.measureLabel).not.toHaveBeenCalled();
    });
    it.each([
        ['Run  job', 'Run job'],
        [' Run job ', 'Run job'],
        ['Run\tjob', 'Run job'],
        ['Run\tjob', 'Run\njob'],
        ['Run\u00a0job', 'Run job'],
        ['Run\njob', 'Run job'],
        ['e\u0301', 'e\n\u0301'],
        ['Runjob', 'Run\n\njob'],
        ['Runjob', 'Run\n\n\njob'],
        ['Dispatch-now', 'Dispatch-\n\nnow'],
        ['Runjob', 'Run\r\n\r\njob'],
        ['Run\njob', 'Run\n\njob'],
        ['Run\njob', 'Ru\nn\n\njob'],
        ['Run\n\njob', 'Run\n\n\njob'],
        ['Run\n\njob', 'Run\njob'],
        ['Runjob\nNext', 'Run\n\njob\nNext'],
        ['Runjob\nNext', 'Run\njob\n\nNext'],
    ])('rejects callback whitespace drift from %j to %j before routing', (authored, measured) => {
        const r = simple(), o = options(Avoid, r);
        r.relations[0].label = authored;
        o.measureLabel = () => ({ text: measured, width: 90, height: 36 });
        const Router = vi.fn();
        o.Avoid = { ...Avoid, Router } as unknown as AvoidRuntime;
        expect(() => layoutComponent(r, o)).toThrowError(expect.objectContaining({ code: 'INVALID_LAYOUT_REQUEST' }));
        expect(Router).not.toHaveBeenCalled();
    });
    it.each([
        ['Run  job', 'Run \njob'],
        ['Run\tjob', 'Run\t\njob'],
        ['Run-job', 'Run-\njob'],
        ['Run\r\njob', 'Run\njob'],
        ['Run\n\njob', 'Run\n\njob'],
        ['Run\r\n\r\njob', 'Run\n\njob'],
        ['Runjob\nNextstep', 'Run\njob\nNext\nstep'],
        ['Runjob\n\nNextstep', 'Run\njob\n\nNext\nstep'],
        ['Run-job\nNext-step', 'Run-\njob\nNext-\nstep'],
        ['\nRunjob\n\n', '\nRun\njob\n\n'],
    ])('preserves the exact measured text of permitted reflow %j to %j', (authored, measured) => {
        const r = simple(), o = options(Avoid, r);
        r.relations[0].label = authored;
        o.measureLabel = () => ({ text: measured, width: 90, height: 36 });
        expect(layoutComponent(r, o).messageLabels.get('deliver')!.text).toBe(measured);
    });
    it('accepts existing wrapText output without changing its legacy wrapping', () => {
        const authored = 'Run  job\twith cafe\u0301', measured = wrapText(authored, 60, 19);
        const r = simple(), o = options(Avoid, r);
        r.relations[0].label = authored;
        o.measureLabel = () => ({ text: measured, width: 90, height: 36 });
        expect(layoutComponent(r, o).messageLabels.get('deliver')!.text).toBe(measured);
    });
    it('exposes the shared reflow matcher and rejects nontext visible values', () => {
        expect(matchesTextReflow('Run\njob', 'Run job')).toBe(true);
        expect(matchesTextReflow(undefined, 'Run job')).toBe(false);
        expect(matchesTextReflow('Run job', undefined)).toBe(false);
    });
    it('escapes only the JSON pointer while preserving an opaque edge identity', () => {
        const r = simple();
        r.relations[0].id = 'self/a~b';
        const o = options(Avoid, r);
        o.measureLabel = () => ({ text: 'Changed', width: 90, height: 36 });
        try {
            layoutComponent(r, o);
            throw new Error('Expected callback text refusal');
        } catch (error) {
            expect(error).toMatchObject({ diagnostics: expect.arrayContaining([expect.objectContaining({
                path: '/layout/labels/self~1a~0b', edgeId: 'self/a~b',
            })]) });
        }
    });
    it('builds a fresh unequal two-root inline graph in three routing phases without remeasuring', () => {
        const r = simple();
        r.nodes = r.nodes.slice(1);
        r.roots = ['producer', 'consumer'];
        r.rootComposition = { row: r.roots };
        const o = options(Avoid, r), before = structuredClone(r), result = layoutComponent(r, o);
        expect(result.boxes.size).toBe(2);
        expect(result.edgeRoutes.size).toBe(1);
        expect(result.messageLabels.get('deliver')!.text).toBe('Deliver');
        expect(o.measureLabel).toHaveBeenCalledTimes(1);
        expect(o.measureHeader).not.toHaveBeenCalled();
        expect(r).toEqual(before);
        const counts = result.diagnostics.find(d => d.code === 'COMPONENT_COMPACT_RESOURCES')!.counts!;
        expect(counts.routingPhases).toBe(3);
        expect(counts.materializations).toBe(2);
        expect(counts.capacityTrials).toBe(0);
    });
    it('derives and transports a path reservation from this invocation without a prior grid trace', () => {
        const r = simple();
        r.nodes = r.nodes.slice(1);
        r.roots = ['producer', 'consumer'];
        r.rootComposition = { row: r.roots };
        r.relations[0].inline = false;
        const o = options(Avoid, r);
        o.measureLabel = vi.fn((_id, text) => ({ text, width: 50, height: 24 }));
        const result = layoutComponent(r, o);
        expect(result.messageLabels.size).toBe(1);
        expect(result.diagnostics[0].counts!.routingPhases).toBe(3);
        expect(o.measureLabel).toHaveBeenCalledTimes(1);
    });
    it('supports a real single-root leaf loop with distinct right/bottom node pins', () => {
        const r: ComponentLayoutRequest = { nodes: [{ id: 'worker', width: 160, height: 120, children: [] }], roots: ['worker'], relations: [{ id: 'again', from: 'worker', to: 'worker', label: 'Repeat', headerRail: false }], direction: 'LR', labelFontSize: 19 };
        const result = layoutComponent(r, options(Avoid, r)), route = result.edgeRoutes.get('again')!, box = result.boxes.get('worker')!;
        expect(route.sourceSide).toBe('right');
        expect(route.targetSide).toBe('bottom');
        expect(route.points[0][0]).toBe(box.x + box.width);
        expect(route.points.at(-1)![1]).toBe(box.y + box.height);
    });
    it('refuses missing compact runtime capability before measurement and routing', () => {
        const unavailable = { ...Avoid, RoutingParameter: { ...Avoid.RoutingParameter, fixedSharedPathPenalty: undefined } }, o = options(unavailable);
        expect(() => layoutComponent(simple(), o)).toThrowError(expect.objectContaining({ code: 'COMPONENT_LIBRARY_INCOMPATIBLE' }));
        expect(o.measureHeader).not.toHaveBeenCalled();
    });
    it('builds nested title-only ownership with positive leaf paint and real header endpoints', () => {
        const r = simple();
        r.relations[0] = { id: 'own-call', from: 'owner', to: 'consumer', label: 'Invoke', headerRail: false };
        const o = options(Avoid, r), result = layoutComponent(r, o), header = result.headerBoxes.get('owner')!, boundary = result.boxes.get('owner')!, route = result.edgeRoutes.get('own-call')!;
        expect(header.width).toBe(180);
        expect(boundary.width).toBeGreaterThan(header.width);
        expect(o.measureHeader).toHaveBeenCalledTimes(1);
        expect(route.edge.from).toBe('owner');
        expect(route.points[0][0]).toBeGreaterThanOrEqual(header.x);
        expect(route.points[0][0]).toBeLessThanOrEqual(header.x + header.width);
        expect(result.boxes.size).toBe(3);
    });
    it('supports a leaf loop inside one owner without semantic helper nodes', () => {
        const r = simple();
        r.nodes[0].children = ['producer'];
        r.nodes[0].composition = undefined;
        r.nodes = r.nodes.slice(0, 2);
        r.relations[0] = { id: 'again', from: 'producer', to: 'producer', label: 'Repeat', headerRail: false };
        const result = layoutComponent(r, options(Avoid, r));
        expect([...result.boxes.keys()].sort()).toEqual(['owner', 'producer']);
        expect(result.edgeRoutes.get('again')).toMatchObject({ sourceSide: 'right', targetSide: 'bottom' });
    });
    it('supports a parent loop through its own measured title, not a descendant substitute', () => {
        const r = simple();
        r.relations[0] = { id: 'parent-again', from: 'owner', to: 'owner', label: 'Observe', headerRail: false };
        const result = layoutComponent(r, options(Avoid, r)), route = result.edgeRoutes.get('parent-again')!, header = result.headerBoxes.get('owner')!;
        expect(route.edge.from).toBe('owner');
        expect(route.edge.to).toBe('owner');
        expect(route.sourceSide).toBe('right');
        expect(route.targetSide).toBe('bottom');
        expect(route.points[0][0]).toBe(header.x + header.width);
        expect(route.points.at(-1)![1]).toBe(header.y + header.height);
    });
    it('refuses missing/extra/negative node paint envelopes before measurement', () => {
        for (const bad of [new Map(), new Map([['extra', { outset: 0 }]]), new Map(simple().nodes.map(n => [n.id, { outset: -1 }]))]) {
            const o = options(Avoid);
            o.paint.nodes = bad;
            expect(() => layoutComponent(simple(), o)).toThrowError(expect.objectContaining({ code: 'INVALID_PAINT_GEOMETRY' }));
            expect(o.measureHeader).not.toHaveBeenCalled();
        }
    });
    it('uses one affected-owner closure, reuses each winning layout and stays within four phases', () => {
        const r: ComponentLayoutRequest = { nodes: [{ id: 'scope', width: 1, height: 1, children: ['a', 'b', 'c'], composition: { row: ['a', 'b', 'c'] } }, ...['a', 'b', 'c'].map(id => ({ id, width: 160, height: 100, children: [] }))], roots: ['scope'], relations: [{ id: 'ab', from: 'a', to: 'b', label: 'First long action', headerRail: false }, { id: 'bc', from: 'b', to: 'c', label: 'Second long action', headerRail: false }], direction: 'LR', labelFontSize: 19 };
        const o = options(Avoid, r);
        o.measureLabel = vi.fn((_id, text) => ({ text, width: 200, height: 40 }));
        const result = layoutComponent(r, o), c = result.diagnostics[0].counts!;
        expect(result.edgeRoutes.size).toBe(2);
        expect(c.routingPhases).toBe(4);
        expect(c.allocationRounds).toBe(2);
        expect(c.capacityTrials).toBeGreaterThan(0);
        expect(c.capacityTrials).toBeLessThanOrEqual(c.capacityTrialLimit);
        expect(c.materializations).toBe(2 + c.capacityTrials);
        expect(o.measureLabel).toHaveBeenCalledTimes(2);
    });
    it('stops at a genuinely undefined finite-support order instead of inventing another route phase', () => {
        const r: ComponentLayoutRequest = { nodes: [{ id: 'scope', width: 1, height: 1, children: ['a', 'b', 'c'], composition: { row: ['a', 'b', 'c'] } }, ...['a', 'b', 'c'].map(id => ({ id, width: 160, height: 100, children: [] }))], roots: ['scope'], relations: [{ id: 'ab', from: 'a', to: 'b', label: 'First long action', headerRail: false }, { id: 'bc', from: 'b', to: 'c', label: 'Second long action', headerRail: false }, { id: 'ac', from: 'a', to: 'c', label: 'Cross branch action', headerRail: false }], direction: 'LR', labelFontSize: 19 };
        const o = options(Avoid, r);
        o.measureLabel = (_id, text) => ({ text, width: 200, height: 40 });
        try {
            layoutComponent(r, o);
            throw new Error('Expected explicit order refusal');
        }
        catch (error) {
            expect(error).toMatchObject({ code: 'CAPTION_CLEARANCE_UNSATISFIED' });
            const e = error as {
                diagnostics: {
                    counts?: Record<string, number>;
                }[];
            };
            expect(e.diagnostics.at(-1)!.counts!.routingPhases).toBe(3);
        }
    });
    it('frees the current Router and stops immediately when a baseline transaction fails', () => {
        const r: ComponentLayoutRequest = { nodes: [{ id: 'scope', width: 1, height: 1, children: ['a', 'b'], composition: { row: ['a', 'b'] } }, ...['a', 'b'].map(id => ({ id, width: 160, height: 100, children: [] }))], roots: ['scope'], relations: [{ id: 'ab', from: 'a', to: 'b', label: 'A long operation', headerRail: false }], direction: 'LR', labelFontSize: 19 };
        let constructed = 0, deleted = 0, issued = 0;
        const Router = new Proxy(Avoid.Router, { construct(target, args) {
                const router = new target(args[0]);
                constructed++;
                const process = router.processTransaction.bind(router), destroy = router.delete.bind(router);
                router.processTransaction = () => {
                    if (++issued === 2)
                        throw new Error('Injected second phase failure');
                    process();
                };
                router.delete = () => { deleted++; destroy(); };
                return router;
            } });
        const o = options({ ...Avoid, Router }, r);
        o.measureLabel = (_id, text) => ({ text, width: 200, height: 40 });
        try {
            layoutComponent(r, o);
            throw new Error('Expected a routed failure');
        }
        catch (error) {
            expect(error).toMatchObject({ code: 'ROUTING_FAILED' });
            const e = error as {
                diagnostics: {
                    counts?: Record<string, number>;
                }[];
            };
            expect(e.diagnostics.at(-1)!.counts).toMatchObject({ routingPhases: 2, completedRoutingPhases: 1 });
        }
        expect({ constructed, deleted, issued }).toEqual({ constructed: 2, deleted: 2, issued: 2 });
    });
    it('supports a positive branch with unrelated IDs, unequal sizes and multiple roots', () => {
        const r: ComponentLayoutRequest = { nodes: [{ id: 'left-sink', width: 100, height: 160, children: [] }, { id: 'hub', width: 180, height: 180, children: [] }, { id: 'right-sink', width: 140, height: 200, children: [] }], roots: ['left-sink', 'hub', 'right-sink'], rootComposition: { row: ['left-sink', 'hub', 'right-sink'] }, relations: [{ id: 'left-action', from: 'hub', to: 'left-sink', label: 'Dispatch left', headerRail: false, inline: true }, { id: 'right-action', from: 'hub', to: 'right-sink', label: 'Dispatch right', headerRail: false, inline: true }], direction: 'LR', labelFontSize: 19 };
        const result = layoutComponent(r, options(Avoid, r));
        expect(result.edgeRoutes.size).toBe(2);
        expect(result.boxes.size).toBe(3);
        expect(result.diagnostics[0].counts!.routingPhases).toBe(3);
    });
    it('keeps nested frames and their own title paint inside the actual parent boundary', () => {
        const r: ComponentLayoutRequest = { nodes: [{ id: 'outer', width: 1, height: 1, children: ['inner'], composition: undefined }, { id: 'inner', width: 1, height: 1, children: ['leaf'] }, { id: 'leaf', width: 160, height: 120, children: [] }], roots: ['outer'], relations: [], direction: 'LR', labelFontSize: 19 };
        const o = options(Avoid, r), result = layoutComponent(r, o), parent = result.boxes.get('outer')!, child = result.boxes.get('inner')!;
        expect(child.x - 1 - parent.x - 1).toBeGreaterThanOrEqual(2 * Math.hypot(.005, .005));
        expect(result.boxes.size).toBe(3);
        expect(result.containers.size).toBe(2);
        expect(o.measureHeader).toHaveBeenCalledTimes(2);
        expect(result.diagnostics[0].counts!.routingPhases).toBe(0);
    });
    it('rejects injected historical state and nonfinite calculated envelopes before routing', () => {
        const r = simple(), o = options(Avoid);
        Object.assign(r, { cachedSlots: new Map() });
        expect(() => layoutComponent(r, o)).toThrow();
        expect(o.measureLabel).not.toHaveBeenCalled();
        const huge = simple(), h = options(Avoid);
        huge.nodes[1].width = 1e308;
        huge.nodes[2].width = 1e308;
        expect(() => layoutComponent(huge, h)).toThrowError(expect.objectContaining({ code: 'INVALID_LAYOUT_REQUEST' }));
    });
    it.each(['outward', 'inward'] as const)('supports real parent/external endpoints in %s direction', direction => {
        const r = simple();
        r.nodes.push({ id: 'external', width: 120, height: 300, children: [] });
        r.roots.push('external');
        r.rootComposition = { row: ['owner', 'external'] };
        r.relations[0] = { id: 'external-call', from: direction === 'outward' ? 'owner' : 'external', to: direction === 'outward' ? 'external' : 'owner', label: 'Exchange', headerRail: false };
        const result = layoutComponent(r, options(Avoid, r)), route = result.edgeRoutes.get('external-call')!, header = result.headerBoxes.get('owner')!;
        const point = direction === 'outward' ? route.points[0] : route.points.at(-1)!;
        expect(point[0]).toBeGreaterThanOrEqual(header.x);
        expect(point[0]).toBeLessThanOrEqual(header.x + header.width);
        expect(point[1]).toBeGreaterThanOrEqual(header.y);
        expect(point[1]).toBeLessThanOrEqual(header.y + header.height);
        expect(route.edge.from).toBe(r.relations[0].from);
        expect(route.edge.to).toBe(r.relations[0].to);
        expect(result.edgeRoutes.size).toBe(1);
    });
    it('keeps reciprocal routes on their real nodes with distinct exclusive ports', () => {
        const r: ComponentLayoutRequest = { nodes: [{ id: 'caller', width: 180, height: 200, children: [] }, { id: 'callee', width: 180, height: 200, children: [] }], roots: ['caller', 'callee'], rootComposition: { row: ['caller', 'callee'] }, relations: [{ id: 'forward', from: 'caller', to: 'callee', label: 'Request', headerRail: false, inline: true }, { id: 'return', from: 'callee', to: 'caller', label: 'Reply', headerRail: false, inline: true }], direction: 'LR', labelFontSize: 19 };
        const result = layoutComponent(r, options(Avoid, r)), forward = result.edgeRoutes.get('forward')!, back = result.edgeRoutes.get('return')!;
        expect(result.edgeRoutes.size).toBe(2);
        expect(forward.edge.from).toBe('caller');
        expect(back.edge.from).toBe('callee');
        expect(Math.hypot(forward.points[0][0] - back.points.at(-1)![0], forward.points[0][1] - back.points.at(-1)![1])).toBeGreaterThanOrEqual(18);
    });
    it('returns current local node pins and typed raw legs before a directed vertical label join', () => {
        const boxes = new Map([['source', { x: 0, y: 0, width: 100, height: 80 }], ['target', { x: 0, y: 300, width: 100, height: 80 }]]), edges = [{ id: 'move', from: 'source', to: 'target', label: 'Move' }], slots = new Map([['move', { x: 15, y: 140, width: 70, height: 40 }]]);
        const result = routeEdgesDetailed(boxes, edges, { Avoid, nodes: [...boxes.keys()].map(id => ({ id, shape: 'rectangle' as const })), labelSlots: slots, labelPairs: new Map([['move', ['top', 'bottom'] as const]]), sharedPathPolicy: 'suggested', buffer: 4 });
        expect(result.routes.size).toBe(1);
        expect(result.nodePins.get('move')!.source.side).toBe('bottom');
        expect(result.labelPins.get('move')!.entry).toEqual({ side: 'top', x: .5, y: 0 });
        expect(result.legs.get('move')).toMatchObject([{ from: { kind: 'node', nodeId: 'source' }, to: { kind: 'caption', edgeId: 'move', side: 'top' } }, { from: { kind: 'caption', edgeId: 'move', side: 'bottom' }, to: { kind: 'node', nodeId: 'target' } }]);
    });
});
