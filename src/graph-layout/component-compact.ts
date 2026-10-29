import { ComponentLayoutError } from './types.js';
import type { Box, ComponentComposition, ComponentLayoutNode, ComponentLayoutRequest, CompactComponentLayoutOptions, EdgeRoute, LayoutEdge, Point, RoutedComponentLayoutResult, Size } from './types.js';
import { assignComponentNodePins, routeEdgesDetailed, RoutingError } from './routing.js';
import type { DetailedRoutingResult, OppositeLabelPair } from './routing.js';
import { excalidrawLabelPath, placeRouteLabels, segmentEntersOpenBox } from './labels.js';
import { labelSlotPin } from './routing-labels.js';
import { matchesTextReflow } from './text.js';
import { boxBounds, expandBounds, boxesOverlap, containsBox, centerOf, compactFailure, compactObstacles, isDescendant, captionOwner, captionDomain, boundarySides, strokeClearanceBudget, compactPaintedCapacity, transportCompact, admitCompactRoutes, completeCompactFrames } from './component-clearance.js';
import type { CompactContext, CompactGeometry, CompactInterface, CaptionAssignment, CaptionPlacement, SideRequirements } from './component-clearance.js';
interface Group {
    uid: string;
    owner: string | null;
    axis: 'row' | 'column';
    children: (string | Group)[];
    members: string[];
    parent?: Group;
}
interface RelativeGeometry extends Size {
    placements: {
        id: string;
        x: number;
        y: number;
    }[];
    interfaces: CompactInterface[];
    slots: {
        id: string;
        box: Box;
        interfaceKey: string;
        fraction: number;
    }[];
}
interface ShelfItem {
    id: string;
    normal: number;
    cross: number;
    desired: number;
    crossStart: number;
}
interface Shelf {
    items: ShelfItem[];
    normal: number;
    end: number;
    before: number;
    after: number;
}
interface Trees {
    roots: Group;
    owners: Map<string, Group>;
    groups: Group[];
    interfaceCount: number;
    service: Map<string, {
        owner: string | null;
        kind: 'header' | 'loop';
    }>;
}
const P = 12, EPS = 1e-6, BASE = { row: 96, column: 72 };
const keyFor = (owner: string | null, path: string, index: number) => JSON.stringify([owner, path, index]);
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const assertKeys = (x: object, keys: string[], where: string) => { if (Object.keys(x).some(k => !keys.includes(k)))
    compactFailure('INVALID_LAYOUT_REQUEST', 'Unknown field in ' + where); };
function prepare(request: ComponentLayoutRequest, options: CompactComponentLayoutOptions): CompactContext {
    if (!record(request) || !Array.isArray(request.nodes) || !Array.isArray(request.roots) || !Array.isArray(request.relations) || !['LR', 'TB'].includes(request.direction) || !positive(request.labelFontSize))
        compactFailure('INVALID_LAYOUT_REQUEST', 'Compact layout requires a complete ordered forest and positive label font size.');
    assertKeys(request, ['nodes', 'roots', 'relations', 'direction', 'labelFontSize', 'rootComposition'], 'request');
    if (!record(options) || options.headerMode !== 'title-only' || !options.Avoid || typeof options.Avoid.Router !== 'function' || typeof options.measureHeader !== 'function' || typeof options.measureLabel !== 'function')
        compactFailure('INVALID_LAYOUT_REQUEST', 'Title-only layout requires Avoid and title/label measurement callbacks.');
    assertKeys(options, ['headerMode', 'Avoid', 'measureHeader', 'measureLabel', 'paint'], 'compact options');
    if (!Number.isFinite(options.Avoid.RoutingParameter?.fixedSharedPathPenalty?.value) || !Number.isFinite(options.Avoid.RoutingParameter?.idealNudgingDistance?.value))
        compactFailure('COMPONENT_LIBRARY_INCOMPATIBLE', 'The paired runtime lacks the compact routing capabilities.');
    const nodes = new Map<string, ComponentLayoutNode>(), parent = new Map<string, string>();
    for (const n of request.nodes) {
        if (!record(n) || typeof n.id !== 'string' || !n.id || nodes.has(n.id) || !positive(n.width) || !positive(n.height) || !Array.isArray(n.children))
            compactFailure('INVALID_LAYOUT_REQUEST', 'Compact nodes require distinct IDs, dimensions and children.');
        assertKeys(n, ['id', 'width', 'height', 'children', 'composition'], 'node');
        nodes.set(n.id, n as unknown as ComponentLayoutNode);
    }
    const roots = new Set(request.roots);
    if (roots.size !== request.roots.length || [...roots].some(id => !nodes.has(id)))
        compactFailure('INVALID_LAYOUT_REQUEST', 'Roots must be unique known IDs.');
    for (const n of nodes.values())
        for (const id of n.children) {
            if (!nodes.has(id) || parent.has(id) || roots.has(id))
                compactFailure('INVALID_LAYOUT_REQUEST', 'Children must occur once inside their declared owner.');
            parent.set(id, n.id);
        }
    for (const id of nodes.keys()) {
        const seen = new Set<string>();
        for (let x: string | undefined = id; x; x = parent.get(x)) {
            if (seen.has(x))
                compactFailure('INVALID_LAYOUT_REQUEST', 'Ownership must be acyclic.');
            seen.add(x);
        }
        if (!roots.has(id) && !parent.has(id))
            compactFailure('INVALID_LAYOUT_REQUEST', 'Every node must belong to the root forest.');
    }
    const expanded = new Set([...nodes.values()].filter(n => n.children.length).map(n => n.id)), ids = new Set<string>();
    for (const e of request.relations) {
        if (!record(e) || typeof e.id !== 'string' || !e.id || ids.has(e.id) || typeof e.from !== 'string' || typeof e.to !== 'string' || !nodes.has(e.from) || !nodes.has(e.to) || typeof e.label !== 'string' || e.headerRail !== false || e.inline !== undefined && typeof e.inline !== 'boolean')
            compactFailure('INVALID_LAYOUT_REQUEST', 'Relations need unique IDs, real endpoints, authored text and no headerRail.');
        assertKeys(e, ['id', 'from', 'to', 'label', 'headerRail', 'inline'], 'relation');
        ids.add(e.id);
    }
    const paint = options.paint;
    if (!record(paint) || !(paint.routes instanceof Map) || !(paint.frames instanceof Map))
        compactFailure('INVALID_PAINT_GEOMETRY', 'Paint must cover every route and expanded frame.');
    assertKeys(paint, ['routes', 'frames', 'nodes', 'clearance', 'pointError'], 'paint');
    for (const [map, expected] of [[paint.routes, ids], [paint.frames, expanded]] as const) {
        if (map.size !== expected.size || [...map.keys()].some(id => !expected.has(id)))
            compactFailure('INVALID_PAINT_GEOMETRY', 'Paint ID coverage is incomplete.');
        for (const p of map.values()) {
            if (!record(p) || !positive(p.width) || p.cap !== 'round')
                compactFailure('INVALID_PAINT_GEOMETRY', 'Only positive round painted strokes are supported.');
            assertKeys(p, ['width', 'cap'], 'paint stroke');
        }
    }
    if (!(paint.nodes instanceof Map) || paint.nodes.size !== nodes.size || [...paint.nodes.keys()].some(id => !nodes.has(id)))
        compactFailure('INVALID_PAINT_GEOMETRY', 'Paint envelopes must cover every nominal leaf/title shape.');
    for (const envelope of paint.nodes.values()) {
        if (!record(envelope) || typeof envelope.outset !== 'number' || !Number.isFinite(envelope.outset) || envelope.outset < 0)
            compactFailure('INVALID_PAINT_GEOMETRY', 'Node paint outsets must be finite and nonnegative.');
        assertKeys(envelope, ['outset'], 'node paint envelope');
    }
    if (!record(paint.pointError))
        compactFailure('INVALID_PAINT_GEOMETRY', 'Paint needs point error bounds.');
    assertKeys(paint.pointError, ['x', 'y'], 'point error');
    const budget = strokeClearanceBudget(paint.clearance, paint.pointError), titles = new Map<string, Size>(), labels = new Map<string, Size & {
        text: string;
    }>();
    return { request, options, nodes, parent, expanded, titles, labels, budget, pitch: Math.max(0, ...[...paint.routes.values()].map(p => p.width)) + budget.designGap, counts: { routingPhases: 0, completedRoutingPhases: 0, materializations: 0, capacityTrials: 0, capacityTrialLimit: 0, allocationRounds: 0, gridCandidates: 0, wallChecks: 0, pairChecks: 0, dagPasses: 0, supports: 0, orderConstraints: 0, deferredCaptionConstraints: 0, captionCoordinates: 0, framePasses: 0, frameSides: 0, frameChanges: 0 } };
}
function measureCurrent(ctx: CompactContext): void {
    const { options, expanded, request, titles, labels } = ctx;
    for (const id of expanded) {
        const m = options.measureHeader(id);
        if (!record(m) || !positive(m.width) || !positive(m.height))
            compactFailure('INVALID_LAYOUT_REQUEST', 'Title measurement must return a positive size.', undefined, id);
        assertKeys(m, ['width', 'height'], 'title measurement');
        titles.set(id, { width: m.width, height: m.height });
    }
    for (const e of request.relations) {
        const m = options.measureLabel(e.id, e.label);
        if (!record(m) || !positive(m.width) || !positive(m.height) || typeof m.text !== 'string' || !matchesTextReflow(m.text, e.label))
            compactFailure('INVALID_LAYOUT_REQUEST', 'Label measurement changed authored text or returned invalid geometry.', e.id);
        assertKeys(m, ['text', 'width', 'height'], 'label measurement');
        labels.set(e.id, { text: m.text, width: m.width, height: m.height });
    }
}
function compile(ctx: CompactContext): Trees {
    const groups: Group[] = [], owners = new Map<string, Group>();
    const tree = (owner: string | null, ids: readonly string[], expression?: ComponentComposition) => {
        const seen = new Set<string>();
        let groupCount = 0;
        const parse = (part: ComponentComposition, path: string, depth: number, parent?: Group): string | Group => {
            if (typeof part === 'string') {
                if (!ids.includes(part) || seen.has(part))
                    compactFailure('INVALID_LAYOUT_REQUEST', 'Composition contains a foreign or duplicate member.');
                seen.add(part);
                return part;
            }
            if (!record(part) || Object.keys(part).length !== 1 || !['row', 'column'].includes(Object.keys(part)[0]) || depth > ctx.nodes.size || ++groupCount > ids.length)
                compactFailure('INVALID_LAYOUT_REQUEST', 'Composition must be a bounded row/column tree.');
            const axis = Object.keys(part)[0] as 'row' | 'column', parts = (part as {
                row?: readonly ComponentComposition[];
                column?: readonly ComponentComposition[];
            })[axis];
            if (!Array.isArray(parts) || parts.length < 2 || parts.length > ids.length)
                compactFailure('INVALID_LAYOUT_REQUEST', 'Composition groups need at least two members.');
            const g: Group = { uid: keyFor(owner, path, -1), owner, axis, children: [], members: [], parent };
            groups.push(g);
            g.children = parts.map((p, i) => parse(p, path + '/' + i, depth + 1, g));
            g.members = g.children.flatMap(c => typeof c === 'string' ? [c] : c.members);
            return g;
        };
        const root: Group = { uid: keyFor(owner, '/0', -1), owner, axis: ctx.request.direction === 'TB' ? 'column' : 'row', children: [], members: [], };
        groups.push(root);
        root.children = expression === undefined ? [...ids] : [parse(expression, '/0/0', 0, root)];
        root.members = [...ids];
        if (expression !== undefined && ids.some(id => !seen.has(id)))
            compactFailure('INVALID_LAYOUT_REQUEST', 'Composition misses a direct member.');
        return root;
    };
    for (const id of ctx.expanded)
        owners.set(id, tree(id, ctx.nodes.get(id)!.children, ctx.nodes.get(id)!.composition));
    const roots = tree(null, ctx.request.roots, ctx.request.rootComposition), service = new Map<string, {
        owner: string | null;
        kind: 'header' | 'loop';
    }>();
    for (const e of ctx.request.relations) {
        for (const id of [e.from, e.to])
            if (ctx.expanded.has(id))
                service.set(keyFor(id, 'header', 0), { owner: id, kind: 'header' });
        if (e.from === e.to && !ctx.expanded.has(e.from)) {
            const owner = ctx.parent.get(e.from) ?? null;
            service.set(keyFor(owner, 'loop', 0), { owner, kind: 'loop' });
        }
    }
    return { roots, owners, groups, service, interfaceCount: groups.reduce((n, g) => n + Math.max(0, g.children.length - 1), 0) + service.size };
}
function initialAssignments(ctx: CompactContext, trees: Trees): Map<string, CaptionAssignment> {
    const all = new Map<string, CaptionAssignment>();
    for (const e of ctx.request.relations) {
        if (e.inline) {
            if (e.from === e.to || ctx.expanded.has(e.from) || ctx.expanded.has(e.to) || (ctx.parent.get(e.from) ?? null) !== (ctx.parent.get(e.to) ?? null))
                compactFailure('INVALID_INLINE_INTENT', 'Inline relations need different leaf endpoints with the same immediate owner.', e.id);
            const candidates = trees.groups.filter(g => g.owner === (ctx.parent.get(e.from) ?? null)).flatMap(g => {
                const index = (id: string) => g.children.findIndex(c => typeof c === 'string' ? c === id : c.members.includes(id)), a = index(e.from), b = index(e.to);
                return a >= 0 && b >= 0 && Math.abs(a - b) === 1 ? [{ g, index: Math.min(a, b) }] : [];
            }).sort((a, b) => b.g.uid.length - a.g.uid.length || a.g.uid.localeCompare(b.g.uid));
            if (!candidates.length)
                compactFailure('INVALID_INLINE_INTENT', 'Inline endpoints do not occupy adjacent composition branches.', e.id);
            all.set(e.id, { interfaceKey: keyFor(candidates[0].g.owner, candidates[0].g.uid, candidates[0].index), fixed: true });
        }
        else if (e.from === e.to) {
            const owner = ctx.expanded.has(e.from) ? e.from : ctx.parent.get(e.from) ?? null, kind = ctx.expanded.has(e.from) ? 'header' : 'loop';
            all.set(e.id, { interfaceKey: keyFor(owner, kind, 0), fixed: true });
        }
        else {
            const owner = [e.from, e.to].find(id => ctx.expanded.has(id) && isDescendant(ctx, id, id === e.from ? e.to : e.from));
            if (owner)
                all.set(e.id, { interfaceKey: keyFor(owner, 'header', 0), fixed: true });
        }
    }
    return all;
}
function pack(ctx: CompactContext, items: Omit<ShelfItem, 'crossStart'>[], cross: number, margins = { before: P, after: P }, crossInset = P): {
    shelves: Shelf[];
    required: number;
} {
    const shelves: Shelf[] = [];
    for (const item of [...items].sort((a, b) => a.desired - b.desired || a.id.localeCompare(b.id))) {
        if (item.cross + 2 * crossInset > cross + EPS)
            compactFailure(ctx.request.relations.find(e => e.id === item.id)?.inline ? 'INLINE_CAPACITY' : 'INTERFACE_CAPACITY', 'Caption does not fit the cross axis of its assigned interface.', item.id);
        let shelf = shelves.at(-1), pos = Math.max(crossInset, Math.min(cross - crossInset - item.cross, item.desired - item.cross / 2));
        if (shelf)
            pos = Math.max(pos, shelf.end + 2 * P);
        if (!shelf || pos > cross - crossInset - item.cross + EPS) {
            shelf = { items: [], normal: 0, end: -P, ...margins };
            shelves.push(shelf);
            pos = Math.max(crossInset, Math.min(cross - crossInset - item.cross, item.desired - item.cross / 2));
        }
        shelf.items.push({ ...item, crossStart: pos });
        shelf.end = pos + item.cross;
        shelf.normal = Math.max(shelf.normal, item.normal);
    }
    return { shelves, required: shelves.reduce((n, s) => n + s.normal + s.before + s.after, 0) };
}
function materialize(ctx: CompactContext, trees: Trees, assignments: Map<string, CaptionAssignment>, sides: SideRequirements = new Map()): CompactGeometry {
    ctx.counts.materializations++;
    const sizes = new Map<string, Size>([...ctx.nodes].filter(([id]) => !ctx.expanded.has(id)).map(([id, n]) => [id, { width: n.width, height: n.height }])), contents = new Map<string, RelativeGeometry>(), titleGaps = new Map<string, number>();
    const direct = (owner: string | null, id: string) => { for (let cur: string | undefined = id; cur; cur = ctx.parent.get(cur))
        if ((ctx.parent.get(cur) ?? null) === owner)
            return cur; return id; };
    const makeItems = (key: string, axis: 'row' | 'column', cross: number, locations: Map<string, {
        x: number;
        y: number;
    }>, owner: string | null) => [...assignments].filter(([, a]) => a.interfaceKey === key).map(([id, a]) => {
        const e = ctx.request.relations.find(e => e.id === id)!, size = ctx.labels.get(id)!, parts = [e.from, e.to].flatMap(id => { const d = direct(owner, id), p = locations.get(d), s = sizes.get(d); return p && s ? [p[axis === 'row' ? 'y' : 'x'] + s[axis === 'row' ? 'height' : 'width'] / 2] : []; });
        return { id, normal: size[axis === 'row' ? 'width' : 'height'], cross: size[axis === 'row' ? 'height' : 'width'], desired: a.fraction === undefined ? parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : cross / 2 : a.fraction * cross };
    });
    const measure = (g: Group): RelativeGeometry => {
        const children = g.children.map(c => typeof c === 'string' ? { ...sizes.get(c)!, placements: [{ id: c, x: 0, y: 0 }], interfaces: [], slots: [] } as RelativeGeometry : measure(c));
        const cross = Math.max(0, ...children.map(c => c[g.axis === 'row' ? 'height' : 'width'])), old = new Map<string, {
            x: number;
            y: number;
        }>();
        let cursor = 0;
        children.forEach(c => { c.placements.forEach(p => old.set(p.id, { x: p.x + (g.axis === 'row' ? cursor : 0), y: p.y + (g.axis === 'column' ? cursor : 0) })); cursor += c[g.axis === 'row' ? 'width' : 'height'] + BASE[g.axis]; });
        const packs = children.slice(1).map((_, i) => { const key = keyFor(g.owner, g.uid, i); return pack(ctx, makeItems(key, g.axis, cross, old, g.owner), cross, sides.get(key)); });
        const out: RelativeGeometry = { width: 0, height: 0, placements: [], interfaces: [], slots: [] };
        cursor = 0;
        children.forEach((c, i) => {
            const dx = g.axis === 'row' ? cursor : 0, dy = g.axis === 'column' ? cursor : 0;
            out.placements.push(...c.placements.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })));
            out.interfaces.push(...c.interfaces.map(f => ({ ...f, x: f.x + dx, y: f.y + dy })));
            out.slots.push(...c.slots.map(s => ({ ...s, box: { ...s.box, x: s.box.x + dx, y: s.box.y + dy } })));
            cursor += c[g.axis === 'row' ? 'width' : 'height'];
            if (i < packs.length) {
                const key = keyFor(g.owner, g.uid, i), packed = packs[i], gap = Math.max(BASE[g.axis], packed.required), members = (c: string | Group) => typeof c === 'string' ? [c] : [...c.members];
                out.interfaces.push({ key, owner: g.owner, axis: g.axis, neighbors: [members(g.children[i]), members(g.children[i + 1])], members: [...g.members], x: g.axis === 'row' ? cursor : 0, y: g.axis === 'column' ? cursor : 0, width: g.axis === 'row' ? gap : cross, height: g.axis === 'column' ? gap : cross, cross, gap, assigned: [...assignments].filter(([, a]) => a.interfaceKey === key).map(([id]) => id) });
                let offset = (gap - packed.required) / 2;
                for (const shelf of packed.shelves) {
                    for (const item of shelf.items) {
                        const size = ctx.labels.get(item.id)!, normal = cursor + offset + shelf.before + shelf.normal / 2;
                        out.slots.push({ id: item.id, interfaceKey: key, fraction: cross ? (item.crossStart + item.cross / 2) / cross : 0, box: { x: g.axis === 'row' ? normal - size.width / 2 : item.crossStart, y: g.axis === 'column' ? normal - size.height / 2 : item.crossStart, width: size.width, height: size.height } });
                    }
                    offset += shelf.normal + shelf.before + shelf.after;
                }
                cursor += gap;
            }
        });
        out.width = g.axis === 'row' ? cursor : cross;
        out.height = g.axis === 'column' ? cursor : cross;
        return out;
    };
    const service = (owner: string | null, kind: 'header' | 'loop', c: RelativeGeometry, cross: number): {
        gap: number;
        slots: RelativeGeometry['slots'];
        info: CompactInterface;
    } => {
        const key = keyFor(owner, kind, 0), axis = kind === 'header' ? 'column' : 'row', loc = new Map(c.placements.map(p => [p.id, p])), items = makeItems(key, axis, cross, loc, owner), margins = sides.get(key) ?? { before: P, after: kind === 'loop' ? 16 : P }, packed = pack(ctx, items, cross, { before: margins.before, after: Math.max(margins.after, kind === 'loop' ? 16 : P) }, 16), gap = Math.max(kind === 'header' ? 16 : BASE.row, packed.required), slots: RelativeGeometry['slots'] = [];
        let offset = (gap - packed.required) / 2;
        for (const shelf of packed.shelves) {
            for (const item of shelf.items) {
                const size = ctx.labels.get(item.id)!, normal = offset + shelf.before + shelf.normal / 2;
                slots.push({ id: item.id, interfaceKey: key, fraction: cross ? (item.crossStart + item.cross / 2) / cross : 0, box: { x: axis === 'row' ? normal - size.width / 2 : item.crossStart, y: axis === 'column' ? normal - size.height / 2 : item.crossStart, ...size } });
            }
            offset += shelf.normal + shelf.before + shelf.after;
        }
        return { gap, slots, info: { key, owner, axis, neighbors: kind === 'header' ? [[owner!], [...ctx.nodes.get(owner!)!.children]] : [[...(owner === null ? ctx.request.roots : ctx.nodes.get(owner)!.children)], []], members: owner === null ? [...ctx.request.roots] : [...ctx.nodes.get(owner)!.children], x: 0, y: 0, width: axis === 'row' ? gap : cross, height: axis === 'column' ? gap : cross, cross, gap, assigned: items.map(i => i.id), service: kind } };
    };
    const addLoop = (owner: string | null, c: RelativeGeometry) => {
        if (!trees.service.has(keyFor(owner, 'loop', 0)))
            return c;
        const ids = [...assignments].filter(([, a]) => a.interfaceKey === keyFor(owner, 'loop', 0)).map(([id]) => id), cross = Math.max(c.height, ...ids.map(id => ctx.labels.get(id)!.height + 32));
        const band = service(owner, 'loop', c, cross), x = c.width;
        return { ...c, width: c.width + band.gap, height: cross, interfaces: [...c.interfaces, { ...band.info, x }], slots: [...c.slots, ...band.slots.map(s => ({ ...s, box: { ...s.box, x: s.box.x + x } }))] };
    };
    const visit = (id: string) => {
        for (const child of ctx.nodes.get(id)!.children)
            if (ctx.expanded.has(child))
                visit(child);
        let c = addLoop(id, measure(trees.owners.get(id)!));
        const title = ctx.titles.get(id)!;
        const headerKey = keyFor(id, 'header', 0), headerItems = [...assignments].filter(([, a]) => a.interfaceKey === headerKey).map(([id]) => id);
        const width = Math.max(320, c.width + 48, title.width + 32, ...headerItems.map(id => ctx.labels.get(id)!.width + 80));
        let gap = 16;
        if (trees.service.has(headerKey)) {
            const band = service(id, 'header', c, width - 48);
            gap = band.gap;
            c = { ...c, interfaces: [...c.interfaces, { ...band.info, y: -gap }], slots: [...c.slots, ...band.slots.map(s => ({ ...s, box: { ...s.box, y: s.box.y - gap } }))] };
        }
        titleGaps.set(id, gap);
        contents.set(id, c);
        sizes.set(id, { width, height: 8 + title.height + gap + c.height + 24 });
    };
    for (const id of ctx.request.roots)
        if (ctx.expanded.has(id))
            visit(id);
    const root = addLoop(null, measure(trees.roots)), boxes = new Map<string, Box>(), headerBoxes = new Map<string, Box>(), interfaces: CompactInterface[] = [], slots = new Map<string, Box>(), placements = new Map<string, CaptionPlacement>();
    const gather = (c: RelativeGeometry, x: number, y: number) => { interfaces.push(...c.interfaces.map(f => ({ ...f, x: f.x + x, y: f.y + y }))); for (const s of c.slots) {
        slots.set(s.id, { ...s.box, x: s.box.x + x, y: s.box.y + y });
        placements.set(s.id, { kind: 'interface', interfaceKey: s.interfaceKey, fraction: s.fraction });
    } };
    const install = (id: string, x: number, y: number) => { boxes.set(id, { ...sizes.get(id)!, x, y }); const c = contents.get(id); if (c) {
        const title = ctx.titles.get(id)!;
        headerBoxes.set(id, { ...title, x: x + 16, y: y + 8 });
        const ox = x + 24, oy = y + 8 + title.height + titleGaps.get(id)!;
        gather(c, ox, oy);
        for (const p of c.placements)
            install(p.id, ox + p.x, oy + p.y);
    } };
    gather(root, 80, 80);
    root.placements.forEach(p => install(p.id, 80 + p.x, 80 + p.y));
    for (const [id, b] of [...boxes, ...headerBoxes, ...slots]) {
        if (![b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0)
            compactFailure('INVALID_LAYOUT_REQUEST', 'Compact placement exceeds finite positive geometry.', undefined, id);
    }
    for (const [id, b] of new Map([...boxes].map(([id, b]) => [id, headerBoxes.get(id) ?? b]))) {
        const p = ctx.options.paint.nodes.get(id)!.outset;
        if (![b.x - p, b.y - p, b.width + 2 * p, b.height + 2 * p].every(Number.isFinite))
            compactFailure('INVALID_PAINT_GEOMETRY', 'A node envelope exceeds finite geometry.', undefined, id);
    }
    if (![root.width, root.height].every(Number.isFinite))
        compactFailure('INVALID_LAYOUT_REQUEST', 'Root allocation exceeds finite geometry.');
    return { boxes, headerBoxes, containers: new Set(ctx.expanded), interfaces, slots, placements, area: { x: 80, y: 80, width: root.width, height: root.height } };
}
function projection(points: Point[], p: Point) {
    let total = 0, best = { distance: Infinity, along: 0 };
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy), t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length))) : 0, d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
        if (d < best.distance)
            best = { distance: d, along: total + t * length };
        total += length;
    }
    return { ...best, total, middleDistance: Math.abs(best.along - total / 2) };
}
function pairFor(source: Point, target: Point, box: Box): {
    pair: OppositeLabelPair;
    lower: number;
} {
    const pairs: OppositeLabelPair[] = [['left', 'right'], ['right', 'left'], ['top', 'bottom'], ['bottom', 'top']], l1 = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    return pairs.map((pair, index) => { const a = labelSlotPin(box, pair[0]).point, b = labelSlotPin(box, pair[1]).point; return { pair, index, lower: l1(source, a) + l1(a, b) + l1(b, target) }; }).sort((a, b) => a.lower - b.lower || a.index - b.index)[0];
}
function available(ctx: CompactContext, g: CompactGeometry, id: string, b: Box, slots: Map<string, Box>): boolean {
    if (!containsBox(captionDomain(ctx, g, captionOwner(ctx, id)), b, 16))
        return false;
    if ([...compactObstacles(g).values()].some(o => boxesOverlap(b, o, P)) || [...slots].some(([other, o]) => id !== other && boxesOverlap(b, o, 2 * P)))
        return false;
    const bounds = expandBounds(boxBounds(b), P);
    return ![...g.containers].some(owner => boundarySides(g.boxes.get(owner)!).some(s => segmentEntersOpenBox(s, bounds)));
}
function independentPlacement(ctx: CompactContext, g: CompactGeometry, id: string, b: Box, origin: 'path' | 'grid'): CaptionPlacement {
    const owner = captionOwner(ctx, id), d = captionDomain(ctx, g, owner), x = d.width - b.width - 32, y = d.height - b.height - 32;
    if (x < 0 || y < 0)
        compactFailure('LABEL_NO_SLOT', 'Caption is larger than its admitted owner domain.', id);
    return { kind: 'independent', origin, domainOwner: owner, u: x ? (b.x - d.x - 16) / x : 0, v: y ? (b.y - d.y - 16) / y : 0 };
}
function allocate(ctx: CompactContext, g: CompactGeometry, baseline: DetailedRoutingResult): {
    geometry: CompactGeometry;
    missing: string[];
} {
    if (++ctx.counts.allocationRounds > 2)
        compactFailure('COMPONENT_RESOURCE_LIMIT', 'Only two caption allocation rounds are allowed.');
    const slots = new Map(g.slots), placements = new Map(g.placements), sizes = new Map([...ctx.labels].map(([id, s]) => [id, { width: s.width, height: s.height }]));
    for (const [id, b] of slots)
        if (!available(ctx, g, id, b, slots))
            compactFailure('ASSIGNED_SLOT_COLLISION', 'An interface reservation violates its owner or caption margins.', id);
    const longest = Math.max(0, ...[...baseline.routes.values()].map(r => r.points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - r.points[i][0], p[1] - r.points[i][1]), 0)));
    const placed = placeRouteLabels(compactObstacles(g), baseline.routes, sizes, { step: Math.max(4, longest / 8192), padding: P, preferContent: true, blockedSegments: [...g.containers].flatMap(id => boundarySides(g.boxes.get(id)!)) });
    for (const [id, c] of placed.centers)
        if (!slots.has(id)) {
            const s = ctx.labels.get(id)!, b = { x: c.center[0] - s.width / 2, y: c.center[1] - s.height / 2, width: s.width, height: s.height }, anchor = excalidrawLabelPath(baseline.routes.get(id)!.points, c.center, 2 * baseline.routes.get(id)!.points.length + 1);
            if (anchor.valid && anchor.offset <= EPS && available(ctx, g, id, b, slots)) {
                slots.set(id, b);
                placements.set(id, independentPlacement(ctx, g, id, b, 'path'));
            }
        }
    const pool = ctx.request.relations.filter(e => !slots.has(e.id)).map(edge => {
        const s = ctx.labels.get(edge.id)!, d = captionDomain(ctx, g, captionOwner(ctx, edge.id)), sx = d.width - s.width - 32, sy = d.height - s.height - 32, candidates: (Box & {
            index: number;
        })[] = [];
        if (sx >= 0 && sy >= 0) {
            let columns = Math.min(16384, Math.floor(sx / 16) + 1), rows = Math.min(16384, Math.floor(sy / 16) + 1), scale = Math.max(1, Math.sqrt(columns * rows / 16384));
            columns = Math.max(1, Math.floor(columns / scale));
            rows = Math.max(1, Math.min(Math.floor(rows / scale), Math.floor(16384 / columns)));
            for (let row = 0; row < rows; row++)
                for (let column = 0; column < columns; column++) {
                    ctx.counts.gridCandidates++;
                    const b = { width: s.width, height: s.height, x: d.x + 16 + (columns > 1 ? column * sx / (columns - 1) : 0), y: d.y + 16 + (rows > 1 ? row * sy / (rows - 1) : 0), index: row * columns + column };
                    if (available(ctx, g, edge.id, b, slots))
                        candidates.push(b);
                }
        }
        return { edge, candidates, area: s.width * s.height };
    }).sort((a, b) => a.candidates.length - b.candidates.length || b.area - a.area || a.edge.id.localeCompare(b.edge.id));
    const missing: string[] = [];
    for (const item of pool) {
        const route = baseline.routes.get(item.edge.id)!, choices = item.candidates.filter(b => available(ctx, g, item.edge.id, b, slots)).map(b => { const c = centerOf(b), p = projection(route.points, c), pair = pairFor(route.points[0], route.points.at(-1)!, b); return { b, score: [p.distance, pair.lower - p.total, p.middleDistance, b.index] }; });
        choices.sort((a, b) => compareScore(a.score, b.score));
        const best = choices[0];
        if (!best)
            missing.push(item.edge.id);
        else {
            const b = { x: best.b.x, y: best.b.y, width: best.b.width, height: best.b.height };
            slots.set(item.edge.id, b);
            placements.set(item.edge.id, independentPlacement(ctx, g, item.edge.id, b, 'grid'));
        }
    }
    return { geometry: { ...g, slots, placements }, missing };
}
function compareScore(a: number[], b: number[]): number { for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i] - b[i]) > 1e-9)
        return a[i] - b[i]; return 0; }
function allowedInterfaces(ctx: CompactContext, trees: Trees, edge: ComponentLayoutRequest['relations'][number]): Set<string> {
    const covers = (c: string | Group, id: string) => (typeof c === 'string' ? [c] : c.members).some(member => isDescendant(ctx, member, id));
    const parentOf = (g: Group): Group | undefined => g.parent ?? (g.owner === null ? undefined : trees.groups.find(p => p.owner === (ctx.parent.get(g.owner!) ?? null) && p.children.includes(g.owner!)));
    const depth = (g: Group) => { let d = 0; for (let x: Group | undefined = g; x; x = parentOf(x))
        d++; return d; };
    const groups = trees.groups.filter(g => g.children.some(c => covers(c, edge.from)) && g.children.some(c => covers(c, edge.to))).sort((a, b) => depth(b) - depth(a) || a.uid.localeCompare(b.uid)), g = groups[0], result = new Set<string>();
    if (!g)
        return result;
    const a = g.children.findIndex(c => covers(c, edge.from)), b = g.children.findIndex(c => covers(c, edge.to));
    for (let i = Math.min(a, b); i < Math.max(a, b); i++)
        result.add(keyFor(g.owner, g.uid, i));
    let p = parentOf(g);
    while (p && p.children.length === 1)
        p = parentOf(p);
    if (p) {
        const i = p.children.findIndex(c => covers(c, edge.from) && covers(c, edge.to));
        if (i > 0)
            result.add(keyFor(p.owner, p.uid, i - 1));
        if (i >= 0 && i < p.children.length - 1)
            result.add(keyFor(p.owner, p.uid, i));
    }
    return result;
}
function closure(ctx: CompactContext, trees: Trees, initial: Map<string, CaptionAssignment>, geometry: CompactGeometry, missing: string[], baseline: DetailedRoutingResult) {
    const affected = new Set(missing.map(id => captionOwner(ctx, id)));
    if (affected.has(null))
        compactFailure('ROOT_SLOT_MISSING', 'Independent root captions cannot trigger a different interface assignment.');
    const depth = (id: string | null) => { let n = 0; for (let x = id; x; x = ctx.parent.get(x) ?? null)
        n++; return n; }, area = (b: Size) => b.width * b.height;
    const order = ctx.request.relations.filter(e => !initial.get(e.id)?.fixed && affected.has(captionOwner(ctx, e.id))).sort((a, b) => depth(captionOwner(ctx, b.id)) - depth(captionOwner(ctx, a.id)) || (captionOwner(ctx, a.id) ?? '').localeCompare(captionOwner(ctx, b.id) ?? '') || area(ctx.labels.get(b.id)!) - area(ctx.labels.get(a.id)!) || a.id.localeCompare(b.id));
    const assignments = new Map(initial), bound = order.length * trees.interfaceCount;
    let current = geometry;
    ctx.counts.capacityTrialLimit = bound;
    for (const edge of order) {
        const allowed = allowedInterfaces(ctx, trees, edge), size = ctx.labels.get(edge.id)!, choices: {
            assignment: CaptionAssignment;
            layout: CompactGeometry;
            score: number[];
            key: string;
        }[] = [];
        for (const f of current.interfaces) {
            if (!allowed.has(f.key) || size[f.axis === 'row' ? 'height' : 'width'] + 24 > f.cross + EPS)
                continue;
            const axis = f.axis === 'row' ? 1 : 0, fraction = Math.max(0, Math.min(1, ((centerOf(current.headerBoxes.get(edge.from) ?? current.boxes.get(edge.from)!)[axis] + centerOf(current.headerBoxes.get(edge.to) ?? current.boxes.get(edge.to)!)[axis]) / 2 - (axis ? f.y : f.x)) / f.cross));
            const assignment = { interfaceKey: f.key, fraction }, next = new Map(assignments);
            next.set(edge.id, assignment);
            if (++ctx.counts.capacityTrials > bound)
                compactFailure('COMPONENT_RESOURCE_LIMIT', 'Caption closure exceeded its finite trial bound.');
            let trial: CompactGeometry;
            try {
                trial = materialize(ctx, trees, next);
            }
            catch (e) {
                if (e instanceof ComponentLayoutError && e.code === 'INTERFACE_CAPACITY')
                    continue;
                throw e;
            }
            if ([...trial.slots].some(([id, b]) => !available(ctx, trial, id, b, trial.slots)))
                continue;
            const original = geometry.interfaces.find(x => x.key === f.key)!, p: Point = f.axis === 'row' ? [original.x + original.width / 2, original.y + fraction * original.cross] : [original.x + fraction * original.cross, original.y + original.height / 2];
            choices.push({ assignment, layout: trial, score: [area(trial.area) - area(current.area), trial.area.width - current.area.width + trial.area.height - current.area.height, projection(baseline.routes.get(edge.id)!.points, p).distance], key: f.key });
        }
        choices.sort((a, b) => compareScore(a.score, b.score) || a.key.localeCompare(b.key));
        const chosen = choices[0];
        if (!chosen)
            compactFailure('NO_LOCAL_CAPTION_CAPACITY', 'No admitted local interface can hold the caption.', edge.id);
        assignments.set(edge.id, chosen.assignment);
        current = chosen.layout; // Reuse the actual winning geometry.
    }
    return { assignments, geometry: current };
}
function runCompact(ctx: CompactContext): RoutedComponentLayoutResult {
    const { request, options } = ctx, trees = compile(ctx);
    let assignments = initialAssignments(ctx, trees);
    measureCurrent(ctx);
    let g = materialize(ctx, trees, assignments);
    const edges: LayoutEdge[] = request.relations.map(({ id, from, to, label }) => ({ id, from, to, label }));
    const route = (geometry: CompactGeometry, slots?: Map<string, Box>, pins?: DetailedRoutingResult['nodePins'], pairs?: Map<string, OppositeLabelPair>, shared = false, nudge = 12) => {
        if (edges.length && ++ctx.counts.routingPhases > 4)
            compactFailure('COMPONENT_RESOURCE_LIMIT', 'Compact layout requires more than four routing phases.');
        const result = routeEdgesDetailed(compactObstacles(geometry), edges, { Avoid: options.Avoid, nodes: [...geometry.boxes.keys()].map(id => ({ id, shape: 'rectangle' as const })), buffer: 4, nudge, ...(slots ? { labelSlots: slots } : {}), ...(pins ? { fixedNodePins: pins } : {}), ...(pairs ? { labelPairs: pairs } : {}), ...(shared ? { sharedPathPolicy: 'suggested' as const } : {}) });
        if (edges.length)
            ctx.counts.completedRoutingPhases = (ctx.counts.completedRoutingPhases ?? 0) + 1;
        return result;
    };
    const initial = route(g);
    let allocation = allocate(ctx, g, initial);
    if (allocation.missing.length) {
        const repaired = closure(ctx, trees, assignments, g, allocation.missing, initial);
        assignments = repaired.assignments;
        g = repaired.geometry;
        allocation = allocate(ctx, g, route(g));
        if (allocation.missing.length)
            compactFailure('LABEL_NO_SLOT', 'Captions still do not fit after the single closure.', allocation.missing[0]);
    }
    g = allocation.geometry;
    const pins = assignComponentNodePins(compactObstacles(g), edges, [...g.boxes.keys()].map(id => ({ id, shape: 'rectangle' as const })), g.slots), pairs = new Map<string, OppositeLabelPair>();
    for (const [id, b] of g.slots) {
        const e = edges.find(e => e.id === id)!, p = pins.get(id)!, source = compactObstacles(g).get(e.from)!, target = compactObstacles(g).get(e.to)!;
        pairs.set(id, pairFor([source.x + p.source.x * source.width, source.y + p.source.y * source.height], [target.x + p.target.x * target.width, target.y + p.target.y * target.height], b).pair);
    }
    const provisional = route(g, g.slots, pins, pairs, true), sideRequirements = compactPaintedCapacity(ctx, g, provisional), next = materialize(ctx, trees, assignments, sideRequirements), transported = transportCompact(ctx, g, next, provisional, pairs);
    g = transported.geometry;
    const final = route(g, g.slots, transported.nodePins, transported.labelPairs, true, ctx.pitch), messageLabels = new Map(), edgeGeometry = new Map();
    for (const [id, r] of final.routes) {
        const label = ctx.labels.get(id)!, center = centerOf(g.slots.get(id)!), anchor = excalidrawLabelPath(r.points, center, 2 * r.points.length + 1);
        if (!anchor.valid || anchor.offset > EPS)
            compactFailure('LABEL_ANCHOR_UNSUPPORTED', 'Native midpoint cannot represent the measured label center.', id);
        r.points = anchor.points;
        r.labelCenter = anchor.labelCenter;
        r.labelBox = boxBounds({ x: center[0] - label.width / 2, y: center[1] - label.height / 2, width: label.width, height: label.height });
        messageLabels.set(id, { ...label, center: anchor.labelCenter });
        const [x, y] = r.points[0];
        edgeGeometry.set(id, { x, y, points: r.points.map(p => [p[0] - x, p[1] - y] as Point) });
    }
    admitCompactRoutes(ctx, g, final.routes, false);
    g = completeCompactFrames(ctx, g, final.routes);
    admitCompactRoutes(ctx, g, final.routes, true);
    return { boxes: g.boxes, headerBoxes: g.headerBoxes, containers: g.containers, direction: request.direction, edgeGeometry, edgeRoutes: final.routes, messageLabels, diagnostics: [{ code: 'COMPONENT_COMPACT_RESOURCES', path: '/layout/component', message: 'Finite title-only component layout completed.', counts: { ...ctx.counts } }] };
}
export function layoutCompactComponent(request: ComponentLayoutRequest, options: CompactComponentLayoutOptions): RoutedComponentLayoutResult {
    const ctx = prepare(request, options);
    try {
        return runCompact(ctx);
    }
    catch (error) {
        if (error instanceof ComponentLayoutError || error instanceof RoutingError)
            error.diagnostics.push({ code: 'COMPONENT_COMPACT_RESOURCES', path: '/layout/component', message: 'Compact layout stopped without publishing a partial result.', counts: { ...ctx.counts } });
        throw error;
    }
}
