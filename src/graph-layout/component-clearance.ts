import { ComponentLayoutError } from './types.js';
import type { PointError, RoundStrokePaint } from './types.js';
import type { Box, Bounds, CompactComponentLayoutOptions, ComponentLayoutNode, ComponentLayoutRequest, Diagnostic, EdgeRoute, Point, Size } from './types.js';
import type { DetailedRoutingResult, NodePinPair, OppositeLabelPair, RoutingTerminal } from './routing.js';
// Implementations below own the retained-support constraints and final admission.
import { segmentEntersOpenBox } from './labels.js';
import { labelSlotPin, simplifyCompactPath as maximal } from './routing-labels.js';
/** Capability of the paired title-only producer and its finite paint contract. */
export const COMPACT_COMPONENT_LAYOUT_VERSION = 1 as const;
export interface FiniteStroke extends RoundStrokePaint {
    points: readonly [
        readonly [
            number,
            number
        ],
        readonly [
            number,
            number
        ]
    ];
}
export interface FiniteStrokeClearance {
    distance: number;
    gap: number;
}
export interface StrokeClearanceBudget {
    pointErrorBudget: number;
    requiredGap: number;
    designGap: number;
}
function finitePoint(point: unknown): point is readonly [
    number,
    number
] { return Array.isArray(point) && point.length === 2 && point.every(v => typeof v === 'number' && Number.isFinite(v)); }
function invalid(message: string): never {
    throw new ComponentLayoutError(message, [{ code: 'INVALID_PAINT_GEOMETRY', path: '/paint', message }]);
}
/** Exact Euclidean distance of finite axis-aligned round stroke supports, including end caps. */
export function finiteStrokeClearance(first: FiniteStroke, second: FiniteStroke): FiniteStrokeClearance {
    for (const stroke of [first, second]) {
        if (!stroke || stroke.cap !== 'round' || !Number.isFinite(stroke.width) || stroke.width <= 0
            || !Array.isArray(stroke.points) || stroke.points.length !== 2 || !stroke.points.every(finitePoint))
            invalid('Expected finite axis-aligned round strokes with positive painted widths.');
        const [a, b] = stroke.points;
        if (a[0] !== b[0] && a[1] !== b[1])
            invalid('Only axis-aligned straight finite supports are supported.');
    }
    const gap = (axis: 0 | 1) => Math.max(0, Math.min(first.points[0][axis], first.points[1][axis]) - Math.max(second.points[0][axis], second.points[1][axis]), Math.min(second.points[0][axis], second.points[1][axis]) - Math.max(first.points[0][axis], first.points[1][axis]));
    const distance = Math.hypot(gap(0), gap(1));
    return { distance, gap: distance - (first.width + second.width) / 2 };
}
/** Renderer error and arithmetic reserve add space; admission never subtracts a tolerance. */
export function strokeClearanceBudget(clearance: number, pointError: PointError): StrokeClearanceBudget {
    if (!Number.isFinite(clearance) || clearance < 0 || !pointError || !Number.isFinite(pointError.x)
        || !Number.isFinite(pointError.y) || pointError.x < 0 || pointError.y < 0)
        invalid('Expected nonnegative finite clearance and point errors.');
    const pointErrorBudget = 2 * Math.hypot(pointError.x, pointError.y), requiredGap = clearance + pointErrorBudget;
    if (!Number.isFinite(requiredGap))
        invalid('Paint clearance exceeds finite geometry.');
    return { pointErrorBudget, requiredGap, designGap: requiredGap + 1e-6 };
}
export interface CompactCounts {
    [name: string]: number;
}
export interface CompactContext {
    request: ComponentLayoutRequest;
    options: CompactComponentLayoutOptions;
    nodes: Map<string, ComponentLayoutNode>;
    parent: Map<string, string>;
    expanded: Set<string>;
    titles: Map<string, Size>;
    labels: Map<string, Size & {
        text: string;
    }>;
    retained?: RetainedCapacity;
    counts: CompactCounts;
    budget: StrokeClearanceBudget;
    pitch: number;
}
export interface CompactInterface {
    key: string;
    owner: string | null;
    axis: 'row' | 'column';
    neighbors: [
        string[],
        string[]
    ];
    members: string[];
    x: number;
    y: number;
    width: number;
    height: number;
    cross: number;
    gap: number;
    assigned: string[];
    service?: 'header' | 'loop';
}
export interface CaptionAssignment {
    interfaceKey: string;
    fraction?: number;
    fixed?: boolean;
}
export type CaptionPlacement = {
    kind: 'interface';
    interfaceKey: string;
    fraction: number;
} | {
    kind: 'independent';
    origin: 'path' | 'grid';
    domainOwner: string | null;
    u: number;
    v: number;
};
export interface CompactGeometry {
    boxes: Map<string, Box>;
    headerBoxes: Map<string, Box>;
    containers: Set<string>;
    area: Box;
    interfaces: CompactInterface[];
    slots: Map<string, Box>;
    placements: Map<string, CaptionPlacement>;
}
export type SideRequirements = ReadonlyMap<string, {
    before: number;
    after: number;
}>;
export interface TransportedCompact {
    geometry: CompactGeometry;
    nodePins: Map<string, NodePinPair>;
    labelPairs: Map<string, OppositeLabelPair>;
}
export const GEOMETRY_EPSILON = 1e-6;
export const boxBounds = (b: Box): Bounds => ({ left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height });
export const expandBounds = (b: Bounds, p: number): Bounds => ({ left: b.left - p, top: b.top - p, right: b.right + p, bottom: b.bottom + p });
export const boxesOverlap = (a: Box, b: Box, margin = 0) => a.x - margin < b.x + b.width - GEOMETRY_EPSILON && b.x < a.x + a.width + margin - GEOMETRY_EPSILON && a.y - margin < b.y + b.height - GEOMETRY_EPSILON && b.y < a.y + a.height + margin - GEOMETRY_EPSILON;
export const containsBox = (a: Box, b: Box, inset = 0) => b.x >= a.x + inset - GEOMETRY_EPSILON && b.y >= a.y + inset - GEOMETRY_EPSILON && b.x + b.width <= a.x + a.width - inset + GEOMETRY_EPSILON && b.y + b.height <= a.y + a.height - inset + GEOMETRY_EPSILON;
export const centerOf = (b: Box): Point => [b.x + b.width / 2, b.y + b.height / 2];
export function compactFailure(code: string, message: string, edgeId?: string, nodeId?: string): never {
    const path = edgeId === undefined ? '/layout/component' : '/layout/labels/' + edgeId.replace(/~/gu, '~0').replace(/\//gu, '~1');
    throw new ComponentLayoutError(message, [{ code, path, message, ...(edgeId === undefined ? {} : { edgeId }), ...(nodeId === undefined ? {} : { nodeId }) }]);
}
export function compactObstacles(g: CompactGeometry): Map<string, Box> { return new Map([...g.boxes].map(([id, b]) => [id, g.headerBoxes.get(id) ?? b])); }
export function isDescendant(ctx: CompactContext, owner: string, id: string): boolean { for (let x: string | undefined = id; x; x = ctx.parent.get(x))
    if (x === owner)
        return true; return false; }
export function captionOwner(ctx: CompactContext, edgeId: string): string | null {
    const e = ctx.request.relations.find(e => e.id === edgeId)!;
    const owner = (id: string) => ctx.expanded.has(id) ? id : ctx.parent.get(id) ?? null;
    const ancestors = (id: string | null) => { const all: (string | null)[] = [id]; while (id !== null) {
        id = ctx.parent.get(id) ?? null;
        all.push(id);
    } return all; };
    const target = new Set(ancestors(owner(e.to)));
    return ancestors(owner(e.from)).find(id => target.has(id))!;
}
export function captionDomain(ctx: CompactContext, g: CompactGeometry, owner: string | null): Box {
    if (owner === null)
        return g.area;
    const b = g.boxes.get(owner)!, h = g.headerBoxes.get(owner)!;
    const top = g.interfaces.some(f => f.owner === owner && f.service === 'header') ? h.y + h.height - 4 : h.y + h.height + 16;
    return { x: b.x + 24, y: top, width: b.width - 48, height: b.y + b.height - 24 - top };
}
export function boundarySides(b: Box): [
    Point,
    Point
][] {
    const { x, y, width: w, height: h } = b;
    return [[[x, y], [x + w, y]], [[x + w, y], [x + w, y + h]], [[x + w, y + h], [x, y + h]], [[x, y + h], [x, y]]];
}
interface SupportTerminal {
    end: 0 | 1;
    reference: RoutingTerminal;
}
interface Support {
    id: string;
    edgeId: string;
    leg: number;
    index: number;
    points: [
        Point,
        Point
    ];
    axis: 0 | 1;
    normal: number;
    terminals: SupportTerminal[];
    previous?: string;
    next?: string;
}
interface Wall {
    kind: 'node' | 'caption';
    id: string;
    face: 'low' | 'high';
}
interface Bound {
    value: number;
    wall?: Wall;
    terminal?: RoutingTerminal;
}
interface SupportBounds {
    support: Support;
    L: number;
    U: number;
    lower: Bound[];
    upper: Bound[];
}
interface OrderEdge {
    before: string;
    after: string;
    separation: number;
}
interface RetainedCapacity {
    supports: Support[];
    bounds: SupportBounds[];
    order: OrderEdge[];
    initial: CompactGeometry;
    finitePairs: [
        string,
        string
    ][];
}
const axisRange = (s: readonly (readonly number[])[], axis: 0 | 1): [
    number,
    number
] => [Math.min(s[0][axis], s[1][axis]), Math.max(s[0][axis], s[1][axis])];
const rangeDistance = (a: readonly number[], b: readonly number[]) => Math.max(0, a[0] - b[1], b[0] - a[1]);
const boxRange = (b: Box, axis: 0 | 1): [
    number,
    number
] => axis === 0 ? [b.x, b.x + b.width] : [b.y, b.y + b.height];
function rawSupports(routed: DetailedRoutingResult, ctx: CompactContext, g: CompactGeometry): Support[] {
    const result: Support[] = [];
    for (const [edgeId, legs] of routed.legs)
        for (const [legIndex, leg] of legs.entries()) {
            const points = maximal(leg.points), group: Support[] = [];
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1], b = points[i], axis = a[0] === b[0] ? 0 : 1;
                if (a[axis] !== b[axis]) {
                    const terminal = (t: RoutingTerminal) => ({ reference: t, point: terminalPoint(g, routed.nodePins, edgeId, t),
                        box: t.kind === 'node' ? compactObstacles(g).get(t.nodeId) : g.slots.get(t.edgeId) });
                    compactFailure('UNSUPPORTED_COMPACT_GEOMETRY', 'Raw legs must be exactly axis-aligned. ' + JSON.stringify({
                        stage: 'R1/raw-support-extraction', routingPhase: ctx.counts.routingPhases,
                        edgeId, legIndex, segmentIndex: i - 1, segment: [a, b], dx: b[0] - a[0], dy: b[1] - a[1],
                        rawPoints: leg.points.slice(0, 32), rawPointCount: leg.points.length,
                        maximalPoints: points.slice(0, 32), maximalPointCount: points.length,
                        from: terminal(leg.from), to: terminal(leg.to),
                        nodePins: routed.nodePins.get(edgeId), labelPins: routed.labelPins.get(edgeId),
                        rawSupportsBeforeRefusal: result.length + group.length, counts: { ...ctx.counts },
                    }), edgeId);
                }
                const terminals: SupportTerminal[] = [];
                if (i === 1)
                    terminals.push({ end: 0, reference: leg.from });
                if (i === points.length - 1)
                    terminals.push({ end: 1, reference: leg.to });
                group.push({ id: JSON.stringify([edgeId, legIndex, i - 1]), edgeId, leg: legIndex, index: i - 1, points: [a, b], axis, normal: a[axis], terminals });
            }
            group.forEach((s, i) => { s.previous = group[i - 1]?.id; s.next = group[i + 1]?.id; });
            result.push(...group);
        }
    return result;
}
function terminalPoint(g: CompactGeometry, pins: Map<string, NodePinPair>, edgeId: string, t: RoutingTerminal): Point {
    if (t.kind === 'caption') {
        const slot = g.slots.get(t.edgeId);
        if (!slot)
            compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'A raw label terminal has no current reservation.', t.edgeId);
        return labelSlotPin(slot, t.side).point;
    }
    const b = g.headerBoxes.get(t.nodeId) ?? g.boxes.get(t.nodeId)!, pin = pins.get(edgeId)![t.role];
    return [b.x + pin.x * b.width, b.y + pin.y * b.height];
}
interface CoordinateDependency {
    captionId: string;
    kind: 'normal' | 'endpoint';
    end?: 0 | 1;
}
function coordinateDependencies(s: Support, axis: 0 | 1, supports: Support[]): CoordinateDependency[] {
    const dependencies: CoordinateDependency[] = [];
    for (const t of s.terminals)
        if (t.reference.kind === 'caption')
            dependencies.push({ captionId: t.reference.edgeId, kind: axis === s.axis ? 'normal' : 'endpoint', ...(axis === s.axis ? {} : { end: t.end }) });
    if (axis !== s.axis)
        for (const [end, id] of [[0, s.previous], [1, s.next]] as const) {
            const neighbor = supports.find(n => n.id === id);
            if (neighbor?.axis === axis)
                for (const t of neighbor.terminals)
                    if (t.reference.kind === 'caption')
                        dependencies.push({ captionId: t.reference.edgeId, kind: 'endpoint', end });
        }
    return dependencies;
}
function structuralAxis(supports: Support[], id: string, axis: number): boolean {
    return supports.some(s => s.edgeId === id && s.axis === axis && s.terminals.length === 2 && s.terminals.some(t => t.reference.kind === 'node') && s.terminals.some(t => t.reference.kind === 'caption'));
}
function freeAlongReference(g: CompactGeometry, s: Support, supports: Support[]): boolean {
    const axis = (1 - s.axis) as 0 | 1;
    return coordinateDependencies(s, axis, supports).some(d => g.placements.get(d.captionId)?.kind === 'independent' && !structuralAxis(supports, d.captionId, axis));
}
function walls(ctx: CompactContext, g: CompactGeometry, supports: Support[], pins: Map<string, NodePinPair>): SupportBounds[] {
    const obstacles = [...compactObstacles(g)].map(([id, box]) => ({ kind: 'node' as const, id, box })).concat([]);
    const all: {
        kind: 'node' | 'caption';
        id: string;
        box: Box;
    }[] = [...obstacles, ...[...g.slots].map(([id, box]) => ({ kind: 'caption' as const, id, box }))];
    return supports.map(s => {
        const lower: Bound[] = [], upper: Bound[] = [];
        for (const t of s.terminals) {
            const value = terminalPoint(g, pins, s.edgeId, t.reference)[s.axis];
            lower.push({ value, terminal: t.reference });
            upper.push({ value, terminal: t.reference });
        }
        for (const obstacle of all) {
            ctx.counts.wallChecks++;
            if (s.terminals.some(t => t.reference.kind === obstacle.kind && (t.reference.kind === 'node' ? t.reference.nodeId : t.reference.edgeId) === obstacle.id))
                continue;
            const along = boxRange(obstacle.box, (1 - s.axis) as 0 | 1), supportRange = axisRange(s.points, (1 - s.axis) as 0 | 1);
            if (Math.min(supportRange[1], along[1] + 4) <= Math.max(supportRange[0], along[0] - 4))
                continue;
            const normal = boxRange(obstacle.box, s.axis);
            if (s.normal <= normal[0] + GEOMETRY_EPSILON)
                upper.push({ value: normal[0] - 4, wall: { kind: obstacle.kind, id: obstacle.id, face: 'low' } });
            else if (s.normal >= normal[1] - GEOMETRY_EPSILON)
                lower.push({ value: normal[1] + 4, wall: { kind: obstacle.kind, id: obstacle.id, face: 'high' } });
            else
                compactFailure('UNSUPPORTED_COMPACT_GEOMETRY', 'A full support has no definite side of its buffered obstacle.', s.edgeId);
        }
        return { support: s, lower, upper, L: Math.max(-Infinity, ...lower.map(b => b.value)), U: Math.min(Infinity, ...upper.map(b => b.value)) };
    });
}
function propagate(bounds: SupportBounds[], order: OrderEdge[]) {
    const positions = new Map<string, number>(), origins = new Map<string, Bound[]>(), chains = new Map<string, string[]>();
    for (const b of [...bounds].sort((a, b) => a.support.normal - b.support.normal || a.support.id.localeCompare(b.support.id))) {
        let value = b.L, source = b.lower.filter(v => Math.abs(v.value - b.L) <= GEOMETRY_EPSILON), chain = [b.support.id];
        for (const edge of order)
            if (edge.after === b.support.id) {
                const proposed = positions.get(edge.before)! + edge.separation;
                if (proposed > value) {
                    value = proposed;
                    source = origins.get(edge.before)!;
                    chain = [...chains.get(edge.before)!, b.support.id];
                }
            }
        positions.set(b.support.id, value);
        origins.set(b.support.id, source);
        chains.set(b.support.id, chain);
    }
    return { positions, origins, chains };
}
function independentBound(g: CompactGeometry, bound: Bound): boolean {
    const id = bound.terminal?.kind === 'caption' ? bound.terminal.edgeId : bound.wall?.kind === 'caption' ? bound.wall.id : undefined;
    return !!id && g.placements.get(id)?.kind === 'independent';
}
function boundIdentity(bound: Bound): {
    kind: 'node' | 'caption';
    id: string;
    face?: 'low' | 'high';
} | undefined {
    if (bound.wall)
        return bound.wall;
    if (bound.terminal)
        return bound.terminal.kind === 'node' ? { kind: 'node', id: bound.terminal.nodeId } : { kind: 'caption', id: bound.terminal.edgeId };
    return undefined;
}
export function compactPaintedCapacity(ctx: CompactContext, g: CompactGeometry, routed: DetailedRoutingResult): SideRequirements {
    const supports = rawSupports(routed, ctx, g), bounds = walls(ctx, g, supports, routed.nodePins), order: OrderEdge[] = [], finitePairs: [
        string,
        string
    ][] = [];
    for (let i = 0; i < supports.length; i++)
        for (let j = i + 1; j < supports.length; j++) {
            ctx.counts.pairChecks++;
            const a = supports[i], b = supports[j];
            if (a.edgeId === b.edgeId || a.axis !== b.axis)
                continue;
            const alongGap = rangeDistance(axisRange(a.points, (1 - a.axis) as 0 | 1), axisRange(b.points, (1 - a.axis) as 0 | 1)), needed = (ctx.options.paint.routes.get(a.edgeId)!.width + ctx.options.paint.routes.get(b.edgeId)!.width) / 2 + ctx.budget.designGap;
            if (alongGap >= needed)
                continue;
            if (Math.abs(a.normal - b.normal) <= GEOMETRY_EPSILON) {
                const ar = axisRange(a.points, (1 - a.axis) as 0 | 1), br = axisRange(b.points, (1 - a.axis) as 0 | 1), alongOrdered = ar[1] <= br[0] || br[1] <= ar[0];
                if (alongOrdered && (freeAlongReference(g, a, supports) || freeAlongReference(g, b, supports))) {
                    finitePairs.push([a.id, b.id]);
                    continue;
                }
                compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'Close finite supports have no transferable normal or along-axis order: ' + a.id + ' ' + JSON.stringify(a.points) + ' versus ' + b.id + ' ' + JSON.stringify(b.points), a.edgeId);
            }
            const [before, after] = a.normal < b.normal ? [a, b] : [b, a];
            order.push({ before: before.id, after: after.id, separation: Math.sqrt(needed * needed - alongGap * alongGap) });
        }
    const propagated = propagate(bounds, order), requirements = new Map<string, {
        before: number;
        after: number;
    }>();
    for (const b of bounds) {
        const required = propagated.positions.get(b.support.id)!;
        if (required <= b.U)
            continue;
        const lower = propagated.origins.get(b.support.id)!, upper = b.upper.filter(v => Math.abs(v.value - b.U) <= GEOMETRY_EPSILON), matches: {
            key: string;
            side: 'before' | 'after';
        }[] = [];
        for (const lo of lower)
            for (const hi of upper) {
                const a = boundIdentity(lo), z = boundIdentity(hi);
                if (!a || !z)
                    continue;
                for (const [caption, node, side] of [[a, z, 'after'], [z, a, 'before']] as const) {
                    if (caption.kind !== 'caption' || node.kind !== 'node')
                        continue;
                    const placement = g.placements.get(caption.id);
                    if (placement?.kind !== 'interface')
                        continue;
                    const f = g.interfaces.find(f => f.key === placement.interfaceKey)!;
                    if ((f.axis === 'row' ? 0 : 1) !== b.support.axis || !f.neighbors[side === 'after' ? 1 : 0].some(id => isDescendant(ctx, id, node.id)))
                        continue;
                    if (caption.face && caption.face !== (side === 'after' ? 'high' : 'low'))
                        continue;
                    matches.push({ key: f.key, side });
                }
            }
        const unique = [...new Set(matches.map(m => m.key + '\0' + m.side))];
        if (unique.length !== 1) {
            if ([...lower, ...upper].some(v => independentBound(g, v))) {
                ctx.counts.deferredCaptionConstraints = (ctx.counts.deferredCaptionConstraints ?? 0) + 1;
                continue;
            }
            compactFailure('CAPACITY_DEMAND_NOT_EXPRESSIBLE', 'A full-support deficit cannot be expressed by one existing interface side.', b.support.edgeId);
        }
        const m = matches[0], value = requirements.get(m.key) ?? { before: 12, after: 12 };
        value[m.side] = Math.max(value[m.side], 12 + required - b.U);
        requirements.set(m.key, value);
    }
    ctx.counts.supports = supports.length;
    ctx.counts.orderConstraints = order.length;
    ctx.counts.dagPasses = 1;
    ctx.retained = { supports, bounds, order, initial: g, finitePairs };
    return requirements;
}
function resolveBounds(g: CompactGeometry, pins: Map<string, NodePinPair>, retained: RetainedCapacity): SupportBounds[] {
    const value = (bound: Bound, s: Support) => {
        if (bound.terminal)
            return terminalPoint(g, pins, s.edgeId, bound.terminal)[s.axis];
        const wall = bound.wall!, box = wall.kind === 'node' ? g.headerBoxes.get(wall.id) ?? g.boxes.get(wall.id)! : g.slots.get(wall.id)!;
        const range = boxRange(box, s.axis);
        return wall.face === 'high' ? range[1] + 4 : range[0] - 4;
    };
    return retained.bounds.map(b => { const lower = b.lower.map(v => ({ ...v, value: value(v, b.support) })), upper = b.upper.map(v => ({ ...v, value: value(v, b.support) })); return { support: b.support, lower, upper, L: Math.max(-Infinity, ...lower.map(v => v.value)), U: Math.min(Infinity, ...upper.map(v => v.value)) }; });
}
function freshNormals(g: CompactGeometry, pins: Map<string, NodePinPair>, retained: RetainedCapacity): Map<string, number> {
    const current = resolveBounds(g, pins, retained), positions = new Map<string, number>();
    for (const b of current) {
        const old = retained.bounds.find(v => v.support.id === b.support.id)!, terminal = b.support.terminals[0];
        let value: number;
        if (terminal)
            value = terminalPoint(g, pins, b.support.edgeId, terminal.reference)[b.support.axis];
        else if (Number.isFinite(b.L) && Number.isFinite(b.U) && Number.isFinite(old.L) && Number.isFinite(old.U))
            value = old.U > old.L ? b.L + (old.support.normal - old.L) / (old.U - old.L) * (b.U - b.L) : (b.L + b.U) / 2;
        else if (Number.isFinite(b.L) && Number.isFinite(old.L))
            value = b.L + old.support.normal - old.L;
        else if (Number.isFinite(b.U) && Number.isFinite(old.U))
            value = b.U - old.U + old.support.normal;
        else {
            const finite = (v: number) => Number.isFinite(v) ? v : String(v);
            const describe = (v: SupportBounds) => ({ L: finite(v.L), U: finite(v.U),
                lower: v.lower.slice(0, 16).map(ref => ({ ...ref, value: finite(ref.value) })), lowerCount: v.lower.length,
                upper: v.upper.slice(0, 16).map(ref => ({ ...ref, value: finite(ref.value) })), upperCount: v.upper.length });
            const neighbors = [b.support.previous, b.support.next].flatMap(id => {
                const s = retained.supports.find(s => s.id === id);
                return s ? [{ support: s, terminalPoints: s.terminals.map(t => ({ ...t, point: terminalPoint(g, pins, s.edgeId, t.reference) })) }] : [];
            });
            return compactFailure('CAPACITY_DEMAND_NOT_EXPRESSIBLE', 'An unbounded elbow has no transferable reference. ' + JSON.stringify({
                stage: 'M2/freshNormals', support: b.support, old: describe(old), current: describe(b), neighbors,
            }), b.support.edgeId);
        }
        positions.set(b.support.id, value);
    }
    return positions;
}
function projectedSupport(s: Support, g: CompactGeometry, pins: Map<string, NodePinPair>, normals: Map<string, number>, supports: Support[]): [
    Point,
    Point
] {
    const out = s.points.map(p => [...p] as Point) as [
        Point,
        Point
    ], terminal = (end: 0 | 1) => s.terminals.find(t => t.end === end)?.reference;
    let normal = normals.get(s.id)!;
    for (const t of s.terminals)
        normal = terminalPoint(g, pins, s.edgeId, t.reference)[s.axis];
    for (const end of [0, 1] as const) {
        out[end][s.axis] = normal;
        const t = terminal(end), adjacent = end === 0 ? s.previous : s.next;
        if (t)
            out[end][1 - s.axis] = terminalPoint(g, pins, s.edgeId, t)[1 - s.axis];
        else if (adjacent) {
            const neighbor = supports.find(n => n.id === adjacent)!, ref = neighbor.terminals[0]?.reference;
            out[end][1 - s.axis] = ref ? terminalPoint(g, pins, neighbor.edgeId, ref)[1 - s.axis] : normals.get(adjacent)!;
        }
        else
            compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'A free support endpoint has no terminal or adjacent bend.', s.edgeId);
    }
    return out;
}
function subtractIntervals(intervals: [
    number,
    number
][], forbidden: [
    number,
    number
]): [
    number,
    number
][] {
    return intervals.flatMap(([lo, hi]) => forbidden[1] <= lo || forbidden[0] >= hi ? [[lo, hi] as [
            number,
            number
        ]] : [...(forbidden[0] > lo ? [[lo, Math.min(hi, forbidden[0])] as [
                number,
                number
            ]] : []), ...(forbidden[1] < hi ? [[Math.max(lo, forbidden[1]), hi] as [
                number,
                number
            ]] : [])]);
}
export function transportCompact(ctx: CompactContext, before: CompactGeometry, after: CompactGeometry, routed: DetailedRoutingResult, pairs: Map<string, OppositeLabelPair>): TransportedCompact {
    const retained = ctx.retained!;
    const slots = new Map(after.slots), placements = new Map(before.placements), pins = new Map([...routed.nodePins].map(([id, p]) => [id, { source: { ...p.source }, target: { ...p.target } }]));
    const g: CompactGeometry = { ...after, slots, placements };
    for (const [id, p] of placements)
        if (p.kind === 'independent') {
            const size = ctx.labels.get(id)!, d = captionDomain(ctx, g, p.domainOwner), sx = d.width - size.width - 32, sy = d.height - size.height - 32;
            if (sx < 0 || sy < 0)
                compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'The retained caption domain became too small.', id);
            slots.set(id, { x: d.x + 16 + p.u * sx, y: d.y + 16 + p.v * sy, width: size.width, height: size.height });
        }
    const anchored = new Map<string, Set<number>>();
    for (const [id, b] of slots) {
        const center = centerOf(b), p = placements.get(id)!, freeAxis = p.kind === 'interface' ? g.interfaces.find(f => f.key === p.interfaceKey)!.axis === 'column' ? 0 : 1 : undefined, axes = new Set<number>();
        for (const axis of [0, 1] as const) {
            const values = retained.supports.filter(s => s.edgeId === id && s.axis === axis && s.terminals.length === 2 && s.terminals.some(t => t.reference.kind === 'node') && s.terminals.some(t => t.reference.kind === 'caption')).map(s => terminalPoint(g, pins, id, s.terminals.find(t => t.reference.kind === 'node')!.reference)[axis]);
            if (values.length) {
                if (values.some(v => Math.abs(v - values[0]) > GEOMETRY_EPSILON) || freeAxis !== undefined && axis !== freeAxis && Math.abs(center[axis] - values[0]) > GEOMETRY_EPSILON)
                    compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'Structural straight-leg anchors conflict after placement.', id);
                center[axis] = values[0];
                axes.add(axis);
            }
        }
        slots.set(id, { ...b, x: center[0] - b.width / 2, y: center[1] - b.height / 2 });
        anchored.set(id, axes);
    }
    const normals = freshNormals(g, pins, retained);
    const variables = [...placements].filter(([, p]) => p.kind === 'independent').flatMap(([id]) => ([0, 1] as const).filter(axis => !anchored.get(id)!.has(axis)).map(axis => ({ id, axis, old: centerOf(before.slots.get(id)!)[axis] }))).sort((a, b) => a.axis - b.axis || a.old - b.old || a.id.localeCompare(b.id));
    if (variables.length > 2 * ctx.request.relations.length)
        compactFailure('COMPONENT_RESOURCE_LIMIT', 'Caption transfer exceeded its coordinate bound.');
    for (const { id, axis } of variables) {
        ctx.counts.captionCoordinates = (ctx.counts.captionCoordinates ?? 0) + 1;
        const b = slots.get(id)!, p = placements.get(id)!;
        if (p.kind !== 'independent')
            continue;
        const center = centerOf(b), domain = captionDomain(ctx, g, p.domainOwner), half = (axis === 0 ? b.width : b.height) / 2, other = (1 - axis) as 0 | 1, otherHalf = (axis === 0 ? b.height : b.width) / 2, d = boxRange(domain, axis);
        let intervals: [
            number,
            number
        ][] = [[d[0] + 16 + half, d[1] - 16 - half]];
        const forbid = (o: Box, margin: number) => { const ar = boxRange(o, other); if (center[other] + otherHalf + margin <= ar[0] || center[other] - otherHalf - margin >= ar[1])
            return; const nr = boxRange(o, axis); intervals = subtractIntervals(intervals, [nr[0] - margin - half, nr[1] + margin + half]); };
        for (const o of compactObstacles(g).values())
            forbid(o, 12);
        for (const [otherId, o] of slots)
            if (id !== otherId)
                forbid(o, 24);
        for (const owner of g.containers)
            for (const side of boundarySides(g.boxes.get(owner)!)) {
                const a = boxBounds({ x: Math.min(side[0][0], side[1][0]), y: Math.min(side[0][1], side[1][1]), width: Math.abs(side[0][0] - side[1][0]), height: Math.abs(side[0][1] - side[1][1]) });
                forbid({ x: a.left, y: a.top, width: a.right - a.left, height: a.bottom - a.top }, 12);
            }
        const component = intervals.find(([lo, hi]) => center[axis] >= lo && center[axis] <= hi);
        if (!component)
            compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'Caption transfer would cross an obstacle or leave its connected domain.', id);
        let [lo, hi] = component;
        for (const own of retained.supports.filter(s => coordinateDependencies(s, axis, retained.supports).some(d => d.captionId === id)))
            for (const foreign of retained.supports) {
                if (own.edgeId === foreign.edgeId || own.axis !== foreign.axis)
                    continue;
                const a = projectedSupport(own, g, pins, normals, retained.supports), z = projectedSupport(foreign, g, pins, normals, retained.supports), along = (1 - own.axis) as 0 | 1, need = (ctx.options.paint.routes.get(own.edgeId)!.width + ctx.options.paint.routes.get(foreign.edgeId)!.width) / 2 + ctx.budget.designGap;
                if (finiteStrokeClearance({ points: a, ...ctx.options.paint.routes.get(own.edgeId)! }, { points: z, ...ctx.options.paint.routes.get(foreign.edgeId)! }).gap >= ctx.budget.requiredGap)
                    continue;
                if (axis === own.axis) {
                    const gap = rangeDistance(axisRange(a, along), axisRange(z, along));
                    if (gap >= need)
                        continue;
                    const normalNeed = Math.sqrt(need * need - gap * gap);
                    if (Math.abs(own.normal - foreign.normal) <= GEOMETRY_EPSILON)
                        compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'Caption has no stable finite-support order.', id);
                    if (own.normal < foreign.normal)
                        hi = Math.min(hi, z[0][axis] - normalNeed);
                    else
                        lo = Math.max(lo, z[0][axis] + normalNeed);
                }
                else {
                    const gap = Math.abs(a[0][own.axis] - z[0][own.axis]);
                    if (gap >= need)
                        continue;
                    const alongNeed = Math.sqrt(need * need - gap * gap), oldA = axisRange(own.points, along), oldZ = axisRange(foreign.points, along), zr = axisRange(z, along), terminals = coordinateDependencies(own, axis, retained.supports).filter(d => d.captionId === id && d.kind === 'endpoint');
                    for (const terminal of terminals) {
                        const endpoint = a[terminal.end!], fixed = a[1 - terminal.end!], offset = endpoint[axis] - center[axis];
                        if (oldA[1] <= oldZ[0] + GEOMETRY_EPSILON) {
                            if (fixed[axis] > zr[0] - alongNeed)
                                compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'A free caption cannot move its fixed neighboring elbow.', id);
                            hi = Math.min(hi, zr[0] - alongNeed - offset);
                        }
                        else if (oldA[0] >= oldZ[1] - GEOMETRY_EPSILON) {
                            if (fixed[axis] < zr[1] + alongNeed)
                                compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'A free caption cannot move its fixed neighboring elbow.', id);
                            lo = Math.max(lo, zr[1] + alongNeed - offset);
                        }
                    }
                }
            }
        if (lo > hi)
            compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'Finite caption intervals are empty.', id);
        center[axis] = Math.max(lo, Math.min(hi, center[axis]));
        slots.set(id, { ...b, x: center[0] - b.width / 2, y: center[1] - b.height / 2 });
    }
    const current = resolveBounds(g, pins, retained), checked = propagate(current, retained.order);
    ctx.counts.dagPasses = 2;
    for (const [aId, bId] of retained.finitePairs) {
        const a = retained.supports.find(s => s.id === aId)!, b = retained.supports.find(s => s.id === bId)!;
        const gap = finiteStrokeClearance({ points: projectedSupport(a, g, pins, normals, retained.supports), ...ctx.options.paint.routes.get(a.edgeId)! }, { points: projectedSupport(b, g, pins, normals, retained.supports), ...ctx.options.paint.routes.get(b.edgeId)! }).gap;
        if (gap < ctx.budget.requiredGap)
            compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'A retained finite companion constraint did not clear after interval transfer.', a.edgeId);
    }
    for (const b of current)
        if (checked.positions.get(b.support.id)! > b.U + (b.support.terminals.length === 2 ? GEOMETRY_EPSILON : 0))
            compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'Retained support capacity failed after materialization.', b.support.edgeId);
    for (const [id, b] of slots) {
        if (!containsBox(captionDomain(ctx, g, captionOwner(ctx, id)), b, 16) || [...compactObstacles(g).values()].some(o => boxesOverlap(b, o, 12)) || [...slots].some(([other, o]) => other !== id && boxesOverlap(b, o, 24)))
            compactFailure('CAPTION_CLEARANCE_UNSATISFIED', 'Final transferred captions violate their domain or margins.', id);
    }
    return { geometry: g, nodePins: pins, labelPairs: new Map(pairs) };
}
export function admitCompactRoutes(ctx: CompactContext, g: CompactGeometry, routes: Map<string, EdgeRoute>, includeFrames: boolean): void {
    const obstacles = compactObstacles(g), supports: {
        edgeId: string;
        points: [
            Point,
            Point
        ];
        axis: number;
    }[] = [];
    for (const [id, route] of routes) {
        const points = maximal(route.points);
        for (let i = 1; i < points.length; i++) {
            const s: [
                Point,
                Point
            ] = [points[i - 1], points[i]];
            if (s[0][0] !== s[1][0] && s[0][1] !== s[1][1])
                compactFailure('UNSUPPORTED_COMPACT_GEOMETRY', 'Published routes must be exactly orthogonal.', id);
            supports.push({ edgeId: id, points: s, axis: s[0][0] === s[1][0] ? 0 : 1 });
            for (const [nodeId, b] of obstacles) {
                if (segmentEntersOpenBox(s, boxBounds(b)))
                    compactFailure('ROUTE_THROUGH_NODE', 'A route enters a measured leaf or title.', id, nodeId);
                // Own contour terminals are intentional. Every foreign obstacle
                // includes its rectangular paint envelope and this route's round cap.
                if (nodeId !== route.edge.from && nodeId !== route.edge.to) {
                    const painted = paintedBox(b, ctx.options.paint.nodes.get(nodeId)!.outset);
                    const distance = Math.hypot(rangeDistance(axisRange(s, 0), [painted.x, painted.x + painted.width]),
                        rangeDistance(axisRange(s, 1), [painted.y, painted.y + painted.height]));
                    if (distance < ctx.options.paint.routes.get(id)!.width / 2)
                        compactFailure('ROUTE_THROUGH_NODE', 'A route intersects a foreign leaf or title paint envelope.', id, nodeId);
                }
            }
            for (const [otherId, b] of g.slots)
                if (otherId !== id && segmentEntersOpenBox(s, boxBounds(b)))
                    compactFailure('LABEL_ON_FOREIGN_ROUTE', 'A route enters a foreign measured caption.', id);
        }
    }
    let crossings = 0;
    for (let i = 0; i < supports.length; i++)
        for (let j = i + 1; j < supports.length; j++) {
            const a = supports[i], b = supports[j];
            if (a.edgeId === b.edgeId)
                continue;
            if (a.axis !== b.axis) {
                const v = a.axis === 0 ? a.points : b.points, h = a.axis === 1 ? a.points : b.points, vr = axisRange(v, 1), hr = axisRange(h, 0);
                if (v[0][0] > hr[0] && v[0][0] < hr[1] && h[0][1] > vr[0] && h[0][1] < vr[1])
                    crossings++;
                continue;
            }
            const gap = finiteStrokeClearance({ points: a.points, ...ctx.options.paint.routes.get(a.edgeId)! }, { points: b.points, ...ctx.options.paint.routes.get(b.edgeId)! }).gap;
            if (gap < ctx.budget.requiredGap)
                compactFailure('PAINTED_PARALLEL_CLEARANCE', 'Finite parallel route supports violate the strict source paint gap.', a.edgeId);
        }
    ctx.counts.ordinaryCrossings = crossings;
    for (const [id, slot] of g.slots)
        for (const [nodeId, b] of obstacles)
            if (boxesOverlap(slot, paintedBox(b, ctx.options.paint.nodes.get(nodeId)!.outset)))
                compactFailure('LABEL_NODE_PAINT_CONTACT', 'A measured caption intersects the node paint envelope.', id, nodeId);
    for (const [id, b] of obstacles)
        for (const [other, c] of obstacles)
            if (id < other && boxesOverlap(paintedBox(b, ctx.options.paint.nodes.get(id)!.outset), paintedBox(c, ctx.options.paint.nodes.get(other)!.outset)))
                compactFailure('NODE_TITLE_OVERLAP', 'Measured node/title obstacles overlap.', undefined, id);
    for (const f of frameFindings(ctx, g, routes))
        if (includeFrames)
            throwFrame(f);
}
interface FrameFinding {
    code: string;
    owner: string;
    side?: number;
    subject?: string;
    actualGap?: number;
    requiredGap?: number;
}
interface PaintedBox {
    id: string;
    box: Box;
    outset: number;
}
function paintedBox(b: Box, outset: number): Box { return { x: b.x - outset, y: b.y - outset, width: b.width + 2 * outset, height: b.height + 2 * outset }; }
function frameContents(ctx: CompactContext, g: CompactGeometry, owner: string): PaintedBox[] {
    const items: PaintedBox[] = [];
    for (const [id, b] of compactObstacles(g))
        if (isDescendant(ctx, owner, id))
            items.push({ id, box: b, outset: ctx.options.paint.nodes.get(id)!.outset });
    for (const id of g.containers)
        if (id !== owner && isDescendant(ctx, owner, id))
            items.push({ id, box: g.boxes.get(id)!, outset: ctx.options.paint.frames.get(id)!.width / 2 });
    return items;
}
function frameFindings(ctx: CompactContext, g: CompactGeometry, routes: Map<string, EdgeRoute>): FrameFinding[] {
    const findings: FrameFinding[] = [], Q = ctx.budget.pointErrorBudget;
    for (const owner of g.containers) {
        const b = g.boxes.get(owner)!, half = ctx.options.paint.frames.get(owner)!.width / 2;
        for (const child of frameContents(ctx, g, owner)) {
            const c = paintedBox(child.box, child.outset), gaps = [c.y - b.y - half, b.x + b.width - half - c.x - c.width, b.y + b.height - half - c.y - c.height, c.x - b.x - half];
            gaps.forEach((gap, side) => { if (gap < Q)
                findings.push({ code: 'FRAME_PAINT_CONTAINMENT', owner, side, subject: child.id, actualGap: gap, requiredGap: Q }); });
        }
        for (const [id, node] of compactObstacles(g))
            if (!isDescendant(ctx, owner, id) && boxesOverlap(b, paintedBox(node, ctx.options.paint.nodes.get(id)!.outset)))
                findings.push({ code: 'FRAME_FOREIGN_CAPTURE', owner, subject: id });
        for (const [index, side] of boundarySides(b).entries()) {
            for (const [id, slot] of g.slots)
                if (segmentEntersOpenBox(side, expandBounds(boxBounds(slot), 12 + half + Q)))
                    findings.push({ code: 'FRAME_CAPTION_MARGIN', owner, side: index, subject: id });
            for (const [id, node] of compactObstacles(g))
                if (segmentEntersOpenBox(side, expandBounds(boxBounds(node), half + ctx.options.paint.nodes.get(id)!.outset + Q)))
                    findings.push({ code: 'FRAME_NODE_PAINT', owner, side: index, subject: id });
            for (const other of g.containers)
                if (other !== owner)
                    for (const otherSide of boundarySides(g.boxes.get(other)!)) {
                        const gap = finiteStrokeClearance({ points: side, ...ctx.options.paint.frames.get(owner)! }, { points: otherSide, ...ctx.options.paint.frames.get(other)! }).gap;
                        if (gap < Q)
                            findings.push({ code: 'FRAME_FRAME_PAINT', owner, side: index, subject: other, actualGap: gap, requiredGap: Q });
                    }
            for (const [id, route] of routes) {
                const points = maximal(route.points);
                for (let i = 1; i < points.length; i++) {
                    const s: [
                        Point,
                        Point
                    ] = [points[i - 1], points[i]], axis = s[0][0] === s[1][0] ? 0 : 1, sideAxis = side[0][0] === side[1][0] ? 0 : 1;
                    if (axis !== sideAxis)
                        continue;
                    const gap = finiteStrokeClearance({ points: side, ...ctx.options.paint.frames.get(owner)! }, { points: s, ...ctx.options.paint.routes.get(id)! }).gap;
                    if (gap < ctx.budget.requiredGap)
                        findings.push({ code: 'FRAME_ROUTE_CLEARANCE', owner, side: index, subject: id, actualGap: gap, requiredGap: ctx.budget.requiredGap });
                }
            }
        }
    }
    return findings;
}
function throwFrame(f: FrameFinding): never {
    compactFailure(f.code, `Frame ${f.owner}, side ${f.side ?? 'ownership'}, conflicts with ${f.subject ?? 'content'}${f.actualGap === undefined ? '' : `: gap ${f.actualGap}, required ${f.requiredGap}`}.`, undefined, f.owner);
}
/** One bottom-up finite-interval pass; no routing, retries, or outward frame growth. */
export function completeCompactFrames(ctx: CompactContext, geometry: CompactGeometry, routes: Map<string, EdgeRoute>): CompactGeometry {
    const boxes = new Map(geometry.boxes), g = { ...geometry, boxes }, allocation = geometry.boxes;
    const depth = (id: string) => { let n = 0; for (let p = ctx.parent.get(id); p; p = ctx.parent.get(p))
        n++; return n; };
    const owners = [...g.containers].sort((a, b) => depth(b) - depth(a) || a.localeCompare(b)), reserve = ctx.budget.pointErrorBudget + 1e-6;
    ctx.counts.framePasses = g.containers.size ? 1 : 0;
    for (const owner of owners)
        for (const sideIndex of [0, 1, 2, 3]) {
            ctx.counts.frameSides = (ctx.counts.frameSides ?? 0) + 1;
            const existing = frameFindings(ctx, g, routes).filter(f => f.owner === owner && f.side === sideIndex);
            if (!existing.length)
                continue;
            const b = boxes.get(owner)!, outer = allocation.get(owner)!, side = boundarySides(b)[sideIndex], axis = (sideIndex === 1 || sideIndex === 3 ? 0 : 1) as 0 | 1, along = (1 - axis) as 0 | 1, low = sideIndex === 0 || sideIndex === 3, half = ctx.options.paint.frames.get(owner)!.width / 2;
            const owned = frameContents(ctx, g, owner).map(item => paintedBox(item.box, item.outset + half + reserve));
            for (const slot of g.slots.values())
                if (containsBox(outer, slot))
                    owned.push(paintedBox(slot, 12 + half + reserve));
            const outerRange = boxRange(outer, axis), values = owned.map(o => boxRange(o, axis)), band: [
                number,
                number
            ] = low ? [outerRange[0], Math.min(...values.map(v => v[0]))] : [Math.max(...values.map(v => v[1])), outerRange[1]], old = side[0][axis];
            let intervals: [
                number,
                number
            ][] = band[0] <= band[1] ? [band] : [];
            const forbidBox = (o: Box) => { const a = boxRange(o, along), own = axisRange(side, along); if (rangeDistance(a, own) === 0)
                intervals = subtractIntervals(intervals, boxRange(o, axis)); };
            for (const slot of g.slots.values())
                forbidBox(paintedBox(slot, 12 + half + reserve));
            for (const [id, node] of compactObstacles(g))
                forbidBox(paintedBox(node, half + ctx.options.paint.nodes.get(id)!.outset + reserve));
            const forbidSegment = (s: [
                Point,
                Point
            ], required: number) => { const gap = rangeDistance(axisRange(side, along), axisRange(s, along)); if (gap >= required)
                return; const radius = Math.sqrt(required * required - gap * gap), nr = axisRange(s, axis); intervals = subtractIntervals(intervals, [nr[0] - radius, nr[1] + radius]); };
            for (const other of g.containers)
                if (other !== owner)
                    for (const s of boundarySides(boxes.get(other)!))
                        forbidSegment(s, half + ctx.options.paint.frames.get(other)!.width / 2 + reserve);
            for (const [id, route] of routes) {
                const points = maximal(route.points);
                for (let i = 1; i < points.length; i++) {
                    const s: [
                        Point,
                        Point
                    ] = [points[i - 1], points[i]];
                    if ((s[0][0] === s[1][0] ? 0 : 1) === axis)
                        forbidSegment(s, half + ctx.options.paint.routes.get(id)!.width / 2 + ctx.budget.designGap);
                }
            }
            intervals = intervals.filter(([lo, hi]) => hi > lo).sort((a, b) => Math.max(a[0] - old, 0, old - a[1]) - Math.max(b[0] - old, 0, old - b[1]) || a[0] - b[0]);
            if (!intervals.length)
                compactFailure('NO_LEGAL_FRAME_STROKE', 'No finite inward interval can complete the frame stroke.', undefined, owner);
            const value = (intervals[0][0] + intervals[0][1]) / 2, next = { ...b };
            if (sideIndex === 0) {
                next.y = value;
                next.height = b.y + b.height - value;
            }
            else if (sideIndex === 1)
                next.width = value - b.x;
            else if (sideIndex === 2)
                next.height = value - b.y;
            else {
                next.x = value;
                next.width = b.x + b.width - value;
            }
            if (next.width <= 0 || next.height <= 0 || !containsBox(outer, next))
                compactFailure('NO_LEGAL_FRAME_STROKE', 'Frame completion would escape its allocation.', undefined, owner);
            boxes.set(owner, next);
            ctx.counts.frameChanges = (ctx.counts.frameChanges ?? 0) + 1;
        }
    const failures = frameFindings(ctx, g, routes);
    if (failures.length)
        compactFailure('NO_LEGAL_FRAME_STROKE', 'The single frame completion did not satisfy the final paint contract: ' + failures[0].code, undefined, failures[0].owner);
    return g;
}
