import { segmentEntersOpenBox } from './labels.js';
import { inspectLabelSlots, joinLabelRoute, labelSlotPin } from './routing-labels.js';
import type { Point, Box, Side, LayoutEdge, RoutingNode, EdgeRoute, Diagnostic } from './types.js';
import type { AvoidRuntime, AvoidRouter, AvoidShape, AvoidOwned } from './runtime-types.js';

interface PortEvent { key: string; edge: LayoutEdge; node: string; side: Side; other: Point; spread: number | null }
interface SideGeometry { horizontal: boolean; corner: [number, number]; range: [number, number]; unit: number; cornerNeed(other: number): number; cornerShare: number }
interface Port { key: string; side: Side; x: number; y: number; point: Point; t: number; index: number }
export interface LocalPin { side: Side; x: number; y: number }
interface Assignment extends LocalPin { point: Point }
export interface NodePinPair { source: LocalPin; target: LocalPin }
export type OppositeLabelPair = readonly ['left', 'right'] | readonly ['right', 'left'] | readonly ['top', 'bottom'] | readonly ['bottom', 'top'];
export type RoutingTerminal = { kind: 'node'; nodeId: string; role: 'source' | 'target'; pin: LocalPin }
  | { kind: 'caption'; edgeId: string; side: Side };
export interface RoutingLeg { edgeId: string; from: RoutingTerminal; to: RoutingTerminal; points: Point[] }
export interface DetailedRoutingResult { routes: Map<string, EdgeRoute>; nodePins: Map<string, NodePinPair>; labelPins: Map<string, { entry: LocalPin; exit: LocalPin }>; legs: Map<string, RoutingLeg[]> }
interface SidePlan { side: Side; geometry: SideGeometry; ordered: PortEvent[]; reserve: Record<'low'|'high', number>; desired: number[]; gaps: number[]; positions?: number[] }
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;
const DIRECTIONS = { top: UP, bottom: DOWN, left: LEFT, right: RIGHT };
const EPSILON = 0.01;
const MINIMUM_PORT_SEPARATION = 18;
// One rounding allowance for every port-spacing check, so 18 is never relaxed to 17.99.
const PORT_SEPARATION_TOLERANCE = 1e-6;
const pathPart = (id: string) => id.replace(/~/gu, '~0').replace(/\//gu, '~1');
type RoutingSubject = Pick<Diagnostic, 'nodeId' | 'edgeId'>;

export class RoutingError extends Error {
  code: string;
  diagnostics: Diagnostic[];
  constructor(code: string, path: string, message: string, options?: ErrorOptions & RoutingSubject) {
    super(message, options);
    this.name = 'RoutingError';
    this.code = code;
    this.diagnostics = [{ code, path, message,
      ...(options?.nodeId === undefined ? {} : { nodeId: options.nodeId }),
      ...(options?.edgeId === undefined ? {} : { edgeId: options.edgeId }),
    }];
  }
}

const center = (box: Box): Point => [box.x + box.width / 2, box.y + box.height / 2];
const bounds = (box: Box) => ({ left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height });
const distance = (left: Point, right: Point) => Math.hypot(left[0] - right[0], left[1] - right[1]);

function facingSide(own: Box, other: Box, role: 'source' | 'target', selfRelation: boolean): Side {
  if (selfRelation) return role === 'source' ? 'right' : 'bottom';
  const ownBounds = bounds(own), otherBounds = bounds(other);
  const [x, y] = center(own), [otherX, otherY] = center(other);
  const horizontalOverlap = ownBounds.top < otherBounds.bottom && otherBounds.top < ownBounds.bottom;
  if (horizontalOverlap && Math.abs(otherX - x) > EPSILON) return otherX > x ? 'right' : 'left';
  const verticalOverlap = ownBounds.left < otherBounds.right && otherBounds.left < ownBounds.right;
  if (verticalOverlap && Math.abs(otherY - y) > EPSILON) return otherY > y ? 'bottom' : 'top';
  const horizontalGap = otherX >= x
    ? Math.max(0, otherBounds.left - ownBounds.right)
    : Math.max(0, ownBounds.left - otherBounds.right);
  const verticalGap = otherY >= y
    ? Math.max(0, otherBounds.top - ownBounds.bottom)
    : Math.max(0, ownBounds.top - otherBounds.bottom);
  if (horizontalGap <= verticalGap + Math.min(own.width, other.width) / 2
    && Math.abs(otherX - x) > EPSILON) return otherX > x ? 'right' : 'left';
  return otherY > y ? 'bottom' : 'top';
}

// Ports on one side follow the clockwise order of their partners, so edges leave a card without crossing.
const SIDE_START = { top: -180, right: -90, bottom: 0, left: 90 };
// Adjacent sides meet at a corner; `low`/`high` name the end of each side's parameter range.
const CORNERS: [Side, 'low' | 'high'][][] = [
  [['top', 'low'], ['left', 'low']],
  [['top', 'high'], ['right', 'low']],
  [['right', 'high'], ['bottom', 'high']],
  [['bottom', 'low'], ['left', 'high']],
];

/**
 * Parameter range of one side: `t` runs left to right on top/bottom and top to bottom on left/right;
 * `unit` converts t to contour length, `cornerNeed(other)` is how far from a shared corner a port must
 * stay when the neighbouring side's nearest port is `other` away from that corner, and `cornerShare` is
 * the distance from the corner at which two ports, one on each side, are exactly the minimum apart.
 */
function sideGeometry(box: Box, side: Side, diamond: boolean): SideGeometry {
  const horizontal = side === 'top' || side === 'bottom';
  if (!diamond) {
    return { horizontal, corner: [0, 1], range: [1 / 49, 48 / 49], unit: horizontal ? box.width : box.height,
      cornerNeed: other => Math.sqrt(Math.max(0, MINIMUM_PORT_SEPARATION ** 2 - other ** 2)),
      cornerShare: MINIMUM_PORT_SEPARATION / Math.SQRT2 };
  }
  // A diamond side spans the two half-edges around one vertex; neighbouring sides share each half-edge.
  return { horizontal, corner: [0.25, 0.75], range: [0.25 + 0.5 / 49, 0.75 - 0.5 / 49],
    unit: Math.hypot(box.width, box.height), cornerNeed: other => Math.max(0, MINIMUM_PORT_SEPARATION - other),
    cornerShare: MINIMUM_PORT_SEPARATION / 2 };
}

function sidePoint(box: Box, side: Side, t: number, diamond: boolean): { x: number; y: number; point: Point } {
  const half = Math.abs(t - 0.5);
  const [x, y] = diamond
    ? { top: [t, half], bottom: [t, 1 - half], left: [half, t], right: [1 - half, t] }[side]
    : { top: [t, 0], bottom: [t, 1], left: [0, t], right: [1, t] }[side];
  return { x, y, point: [box.x + x * box.width, box.y + y * box.height] };
}

function polygonFor(Avoid: AvoidRuntime, box: Box, diamond: boolean, own: <T extends AvoidOwned>(value: T) => T) {
  if (!diamond) return own(new Avoid.Rectangle(
    own(new Avoid.Point(box.x, box.y)),
    own(new Avoid.Point(box.x + box.width, box.y + box.height)),
  ));
  const polygon = own(new Avoid.Polygon(4));
  for (const [index, [x, y]] of [
    [box.x + box.width / 2, box.y],
    [box.x + box.width, box.y + box.height / 2],
    [box.x + box.width / 2, box.y + box.height],
    [box.x, box.y + box.height / 2],
  ].entries()) polygon.setPoint(index, own(new Avoid.Point(x, y)));
  return polygon;
}

function pinAssignments(boxes: Map<string, Box>, edges: LayoutEdge[], nodeById: Map<string, RoutingNode>, labelSlots: ReadonlyMap<string, Box>, compactLoops = false) {
  const events: PortEvent[] = [];
  for (const edge of edges) {
    const source = boxes.get(edge.from)!, target = boxes.get(edge.to)!;
    if (!source || !target) {
      throw new RoutingError('ROUTING_FAILED', `/layout/routes/${pathPart(edge.id)}`, `Edge ${edge.id} refers to a card without final geometry.`,
        { edgeId: edge.id, nodeId: !source ? edge.from : edge.to });
    }
    const reverse = edges.find(other => other.from === edge.to && other.to === edge.from && other.id !== edge.id);
    const spread = reverse ? ([edge.id, reverse.id].sort().indexOf(edge.id) === 0 ? 0.15 : 0.85) : null;
    const slot = labelSlots.get(edge.id);
    events.push({ key: `${edge.id}\u0000source`, edge, node: edge.from,
      side: facingSide(source, slot ?? target, 'source', (!slot || compactLoops) && edge.from === edge.to), other: center(slot ?? target), spread });
    events.push({ key: `${edge.id}\u0000target`, edge, node: edge.to,
      side: facingSide(target, slot ?? source, 'target', (!slot || compactLoops) && edge.from === edge.to), other: center(slot ?? source), spread });
  }
  const assignments = new Map<string, Assignment>();
  const byNode = new Map<string, PortEvent[]>([...boxes.keys()].map(id => [id, []]));
  for (const event of events) byNode.get(event.node)!.push(event);
  for (const [nodeId, nodeEvents] of byNode) {
    assignCardPorts(boxes.get(nodeId)!, nodeId, nodeById.get(nodeId)!.shape === 'diamond', nodeEvents, assignments);
  }
  return assignments;
}

const portCapacityError = (nodeId: string, side: Side, edgeId: string) => new RoutingError('PORT_CAPACITY_EXCEEDED', `/layout/nodes/${pathPart(nodeId)}`,
  `Card ${nodeId} has no exclusive ${side} port for edge ${edgeId}.`, { nodeId, edgeId });

function clockwiseAngle(box: Box, event: PortEvent) {
  const [x, y] = center(box);
  const angle = Math.atan2(event.other[1] - y, event.other[0] - x) * 180 / Math.PI;
  return ((angle - SIDE_START[event.side]) % 360 + 360) % 360;
}

/** Events of one side in increasing `t`, with the edge key breaking equal angles. */
function orderSide(box: Box, side: Side, events: PortEvent[]) {
  // Clockwise runs top L->R, right T->B, bottom R->L, left B->T, while `t` always grows L->R / T->B.
  const descending = side === 'bottom' || side === 'left';
  return events.map(event => ({ event, angle: clockwiseAngle(box, event) }))
    .sort((left, right) => (descending ? right.angle - left.angle : left.angle - right.angle)
      || left.event.key.localeCompare(right.event.key))
    .map(({ event }) => event);
}

/** The point a port aims at: the partner centre, or the reverse-pair spread point on the box side. */
const portTarget = (box: Box, horizontal: boolean, side: Side, event: PortEvent): Point => (event.spread === null ? event.other : horizontal
  ? [box.x + event.spread * box.width, side === 'top' ? box.y : box.y + box.height]
  : [side === 'left' ? box.x : box.x + box.width, box.y + event.spread * box.height]);

/** Position on the side nearest to the port target. */
function desiredPosition(box: Box, diamond: boolean, geometry: SideGeometry, side: Side, event: PortEvent) {
  const target = portTarget(box, geometry.horizontal, side, event);
  const [low, high] = geometry.range;
  // A diamond side bends at its vertex (t = 0.5); each straight piece is linear in t.
  const pieces = diamond ? [[low, 0.5], [0.5, high]] : [[low, high]];
  let best: { t: number; gap: number } | null = null;
  for (const [from, to] of pieces) {
    const start = sidePoint(box, side, from, diamond).point, end = sidePoint(box, side, to, diamond).point;
    const along = [end[0] - start[0], end[1] - start[1]];
    const squared = along[0] ** 2 + along[1] ** 2;
    const fraction = squared ? Math.max(0, Math.min(1,
      ((target[0] - start[0]) * along[0] + (target[1] - start[1]) * along[1]) / squared)) : 0;
    const t = from + fraction * (to - from);
    const gap = distance(sidePoint(box, side, t, diamond).point, target);
    if (!best || gap < best.gap - EPSILON) best = { t, gap };
  }
  return best!.t;
}

/**
 * Non-decreasing positions with the given gaps, closest to `desired` in squared distance
 * (pool-adjacent-violators on t_i - offset_i), clamped into [low, high]; null when the side is too short.
 */
function monotonePositions(desired: number[], gaps: number[], low: number, high: number) {
  const offsets = [0];
  for (const gap of gaps) offsets.push(offsets.at(-1)! + gap);
  if (offsets.at(-1)! > high - low + 1e-9) return null;
  const blocks: { sum: number; count: number }[] = [];
  desired.forEach((value, index) => {
    blocks.push({ sum: value - offsets[index], count: 1 });
    while (blocks.length > 1 && blocks.at(-2)!.sum / blocks.at(-2)!.count > blocks.at(-1)!.sum / blocks.at(-1)!.count) {
      const last = blocks.pop()!;
      blocks.at(-1)!.sum += last.sum;
      blocks.at(-1)!.count += last.count;
    }
  });
  const positions = blocks.flatMap(block => Array.from({ length: block.count }, () => block.sum / block.count))
    .map((level, index) => level + offsets[index]);
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], index ? positions[index - 1] + gaps[index - 1] : low);
  }
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    positions[index] = Math.min(positions[index], index < positions.length - 1 ? positions[index + 1] - gaps[index] : high);
  }
  return positions;
}

const PORT_SOLVER_ATTEMPTS = 32;

function sideBounds(plan: SidePlan): [number, number] {
  const { geometry, reserve } = plan;
  return [Math.max(geometry.range[0], geometry.corner[0] + reserve.low / geometry.unit),
    Math.min(geometry.range[1], geometry.corner[1] - reserve.high / geometry.unit)];
}

const sideSlack = (plan: SidePlan) => {
  const [low, high] = sideBounds(plan);
  return high - low - plan.gaps.reduce((sum, gap) => sum + gap, 0);
};

/**
 * Keeps ports of two adjacent sides apart at their shared corner: both sides step back equally when
 * they have room, otherwise the side with more free length steps back alone; false when neither fits.
 */
function separateAtCorner(first: Port, second: Port, plans: SidePlan[]) {
  const pair = CORNERS.find(corner => corner.some(([side]) => side === first.side) && corner.some(([side]) => side === second.side));
  if (!pair) return false;
  const ends = Object.fromEntries(pair) as Record<Side, 'low' | 'high'>;
  const plan = (side: Side) => plans.find(item => item.side === side)!;
  const fromCorner = (port: Port) => Math.abs(port.t - plan(port.side).geometry.corner[ends[port.side] === 'low' ? 0 : 1]) * plan(port.side).geometry.unit;
  const option = (moves: [Port, number][]) => moves.map(([port, need]) => ({ plan: plan(port.side), end: ends[port.side],
    reserve: Math.max(plan(port.side).reserve[ends[port.side]], need + 1e-6) }));
  const single: { plan: SidePlan; end: 'low'|'high'; reserve: number }[][] = ([[first, second], [second, first]] as [Port, Port][])
    .map(([moved, fixed]) => option([[moved, plan(moved.side).geometry.cornerNeed(fromCorner(fixed))]]))
    .sort((left, right) => sideSlack(right[0].plan) - sideSlack(left[0].plan));
  const both = option([first, second].map(port => [port, plan(port.side).geometry.cornerShare]));
  for (const moves of [both, ...single]) {
    const previous = moves.map(({ plan: item, end }) => item.reserve[end]);
    for (const { plan: item, end, reserve } of moves) item.reserve[end] = reserve;
    if (moves.every(({ plan: item }) => sideSlack(item) >= -1e-9)) return true;
    moves.forEach(({ plan: item, end }, index) => { item.reserve[end] = previous[index]; });
  }
  return false;
}

/**
 * Ports of one card in their partners' angular order on every side, all at least the minimum
 * separation apart as points; null when that order cannot be kept within the card's sides.
 */
function orderedCardPorts(box: Box, diamond: boolean, events: PortEvent[]) {
  // A fixed side order keeps clash resolution independent of the order edges arrive in.
  const plans: SidePlan[] = SIDES.map((side): [Side, PortEvent[]] => [side, events.filter(event => event.side === side)])
    .filter(([, sideEvents]) => sideEvents.length)
    .map(([side, sideEvents]) => {
      const geometry = sideGeometry(box, side, diamond);
      const ordered = orderSide(box, side, sideEvents);
      return { side, geometry, ordered, reserve: { low: 0, high: 0 },
        desired: ordered.map(event => desiredPosition(box, diamond, geometry, side, event)),
        gaps: ordered.slice(1).map(() => MINIMUM_PORT_SEPARATION / geometry.unit) };
    });
  for (let attempt = 0; attempt < PORT_SOLVER_ATTEMPTS; attempt += 1) {
    const ports: Port[] = [];
    for (const plan of plans) {
      const positions = monotonePositions(plan.desired, plan.gaps, ...sideBounds(plan));
      if (!positions) return null;
      plan.positions = positions;
      plan.ordered.forEach((event, index) => ports.push({ key: event.key, side: plan.side, index, t: positions[index],
        ...sidePoint(box, plan.side, positions[index], diamond) }));
    }
    let clash: { first: Port; second: Port; gap: number } | null = null;
    for (let left = 0; left < ports.length; left += 1) for (let right = left + 1; right < ports.length; right += 1) {
      const gap = distance(ports[left].point, ports[right].point);
      if (gap < MINIMUM_PORT_SEPARATION - PORT_SEPARATION_TOLERANCE && (!clash || gap < clash.gap)) clash = { first: ports[left], second: ports[right], gap };
    }
    if (!clash) return ports;
    const { first, second, gap } = clash;
    if (first.side === second.side) {
      // Only a diamond vertex brings same-side ports closer than their contour gap: widen the gaps
      // between them in proportion to their current spacing, which may already exceed the gap.
      if (gap < EPSILON) return null;
      const plan = plans.find(item => item.side === first.side)!;
      const [from, to] = [Math.min(first.index, second.index), Math.max(first.index, second.index)];
      for (let index = from; index < to; index += 1) {
        const spacing = Math.max(plan.gaps[index], plan.positions![index + 1] - plan.positions![index]);
        plan.gaps[index] = spacing * (MINIMUM_PORT_SEPARATION / gap + 1e-6);
      }
    } else if (!separateAtCorner(first, second, plans)) return null;
  }
  return null;
}

/** The pre-LM-63 allocation in edge-ID order: nearest free grid point per port. */
function greedyCardPorts(box: Box, nodeId: string, diamond: boolean, events: PortEvent[]) {
  const used: Omit<Port, 'index'>[] = [];
  for (const event of [...events].sort((left, right) => left.key.localeCompare(right.key))) {
    const target = portTarget(box, event.side === 'top' || event.side === 'bottom', event.side, event);
    const chosen = Array.from({ length: 48 }, (_, index) => diamond ? 0.25 + 0.5 * (index + 1) / 49 : (index + 1) / 49)
      .map(t => ({ t, ...sidePoint(box, event.side, t, diamond) }))
      .sort((left, right) => distance(left.point, target) - distance(right.point, target))
      .find(candidate => used.every(item => distance(candidate.point, item.point) >= MINIMUM_PORT_SEPARATION - PORT_SEPARATION_TOLERANCE));
    if (!chosen) throw portCapacityError(nodeId, event.side, event.edge.id);
    used.push({ key: event.key, side: event.side, ...chosen });
  }
  return used;
}

/**
 * Fallback for a card the ordered solver could not place: the pre-LM-63 points, handed out on each side
 * in angular order. The point set is unchanged, so the spacing the greedy allocation proved still holds.
 */
function fallbackCardPorts(box: Box, nodeId: string, diamond: boolean, events: PortEvent[]) {
  const points = greedyCardPorts(box, nodeId, diamond, events);
  return SIDES.flatMap(side => {
    const sidePoints = points.filter(point => point.side === side).sort((left, right) => left.t - right.t);
    return orderSide(box, side, events.filter(event => event.side === side))
      .map((event, index) => ({ ...sidePoints[index], key: event.key }));
  });
}

function assignCardPorts(box: Box, nodeId: string, diamond: boolean, events: PortEvent[], assignments: Map<string, Assignment>) {
  const ports = orderedCardPorts(box, diamond, events) ?? fallbackCardPorts(box, nodeId, diamond, events);
  for (const { key, side, x, y, point } of ports) assignments.set(key, { x, y, point, side });
}

const orthogonal = (points: Point[]) => points.slice(1).every((point, index) => Math.abs(point[0] - points[index][0]) < EPSILON
  || Math.abs(point[1] - points[index][1]) < EPSILON);

function exitsThrough(side: Side, endpoint: Point, neighbour: Point) {
  if (distance(endpoint, neighbour) < EPSILON) return true;
  const delta = [neighbour[0] - endpoint[0], neighbour[1] - endpoint[1]];
  return ({ top: -delta[1], right: delta[0], bottom: delta[1], left: -delta[0] })[side] >= -EPSILON;
}

function pointOnSide(point: Point, box: Box, side: Side, diamond: boolean) {
  if (!diamond) return ({
    top: Math.abs(point[1] - box.y), right: Math.abs(point[0] - box.x - box.width),
    bottom: Math.abs(point[1] - box.y - box.height), left: Math.abs(point[0] - box.x),
  })[side] <= 1;
  const [x, y] = center(box);
  const normalizedX = (point[0] - x) / (box.width / 2);
  const normalizedY = (point[1] - y) / (box.height / 2);
  return ({ top: normalizedY <= EPSILON, right: normalizedX >= -EPSILON,
    bottom: normalizedY >= -EPSILON, left: normalizedX <= EPSILON })[side];
}

function validateFinalRoute(boxes: Map<string, Box>, nodeById: Map<string, RoutingNode>, route: EdgeRoute, sourcePin: Assignment, targetPin: Assignment) {
  const { edge, points } = route;
  const path = `/layout/routes/${pathPart(edge.id)}`;
  if (points.length < 2 || points.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) {
    throw new RoutingError('ROUTING_FAILED', path, `libavoid returned an empty or non-finite route for edge ${edge.id}.`, { edgeId: edge.id });
  }
  const length = points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
  if (!Number.isFinite(length) || length < EPSILON || !orthogonal(points)) {
    throw new RoutingError('ROUTING_FAILED', path, `libavoid returned a zero-length or non-orthogonal route for edge ${edge.id}.`, { edgeId: edge.id });
  }
  if (!pointOnSide(points[0], boxes.get(edge.from)!, sourcePin.side, nodeById.get(edge.from)!.shape === 'diamond')
    || !pointOnSide(points.at(-1)!, boxes.get(edge.to)!, targetPin.side, nodeById.get(edge.to)!.shape === 'diamond')
    || distance(points[0], sourcePin.point) > 1 || distance(points.at(-1)!, targetPin.point) > 1) {
    throw new RoutingError('ROUTING_FAILED', path, `libavoid moved edge ${edge.id} away from its allocated card sides ${sourcePin.side}/${targetPin.side}: ${JSON.stringify([points[0], points.at(-1)!])} instead of ${JSON.stringify([sourcePin.point, targetPin.point])}.`, { edgeId: edge.id });
  }
  if (!exitsThrough(sourcePin.side, points[0], points[1])
    || !exitsThrough(targetPin.side, points.at(-1)!, points.at(-2)!)) {
    throw new RoutingError('ROUTING_FAILED', path, `libavoid routed edge ${edge.id} against an allocated port direction.`, { edgeId: edge.id });
  }
  const routeSegments = points.slice(1).map((point, index): [Point, Point] => [points[index], point]);
  for (const [nodeId, box] of boxes) {
    if (nodeId === edge.from || nodeId === edge.to) continue;
    if (routeSegments.some(segment => segmentEntersOpenBox(segment, bounds(box)))) {
      throw new RoutingError('ROUTING_FAILED', path, `libavoid routed edge ${edge.id} through final card ${nodeId}.`, { edgeId: edge.id, nodeId });
    }
  }
}

export interface RoutingOptions {
  Avoid?: AvoidRuntime;
  /** Exactly one explicit contour per final box, including boxes used only as obstacles. */
  nodes: readonly RoutingNode[];
  buffer?: number; nudge?: number;
  /** Internal component reservation: obstacles for foreign edges, crossed centrally by their own edge. */
  labelSlots?: ReadonlyMap<string, Box>;
  fixedNodePins?: ReadonlyMap<string, NodePinPair>;
  labelPairs?: ReadonlyMap<string, OppositeLabelPair>;
  sharedPathPolicy?: 'suggested';
}

/** Pure component port assignment, including explicit right/bottom loop sides. */
export function assignComponentNodePins(boxes: Map<string, Box>, edges: LayoutEdge[], nodes: readonly RoutingNode[], slots: ReadonlyMap<string, Box>): Map<string, NodePinPair> {
  const assignments = pinAssignments(boxes, [...edges].sort((a, b) => a.id.localeCompare(b.id)), new Map(nodes.map(n => [n.id, n])), slots, true);
  return new Map(edges.map(edge => [edge.id, { source: local(assignments.get(edge.id + '\0source')!), target: local(assignments.get(edge.id + '\0target')!) }]));
}
function local(pin: LocalPin): LocalPin { return { side: pin.side, x: pin.x, y: pin.y }; }
function resolveFixedPins(boxes: Map<string, Box>, edges: LayoutEdge[], nodes: Map<string, RoutingNode>, pins: ReadonlyMap<string, NodePinPair>) {
  const ids = new Set(edges.map(e => e.id)), result = new Map<string, Assignment>();
  if (pins.size !== edges.length || [...pins.keys()].some(id => !ids.has(id))) throw new RoutingError('INVALID_LAYOUT_REQUEST', '/layout/pins', 'Fixed pins must cover every edge exactly once.');
  for (const edge of edges) for (const role of ['source', 'target'] as const) {
    const pin = pins.get(edge.id)?.[role], nodeId = edge[role === 'source' ? 'from' : 'to'], box = boxes.get(nodeId)!;
    if (!pin || Object.keys(pin).some(k => !['side', 'x', 'y'].includes(k)) || !SIDES.includes(pin.side) || !Number.isFinite(pin.x) || !Number.isFinite(pin.y) || pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1) throw new RoutingError('INVALID_LAYOUT_REQUEST', '/layout/pins/' + pathPart(edge.id), 'Fixed local pin needs a valid side and relative coordinates.', { edgeId: edge.id });
    const t = pin.side === 'top' || pin.side === 'bottom' ? pin.x : pin.y, expected = sidePoint(box, pin.side, t, nodes.get(nodeId)!.shape === 'diamond');
    if (Math.abs(expected.x - pin.x) > 1e-6 || Math.abs(expected.y - pin.y) > 1e-6) throw new RoutingError('INVALID_LAYOUT_REQUEST', '/layout/pins/' + pathPart(edge.id), 'Fixed pin is not on its declared contour side.', { edgeId: edge.id });
    result.set(edge.id + '\0' + role, { ...local(pin), point: [box.x + pin.x * box.width, box.y + pin.y * box.height] });
  }
  for (const nodeId of boxes.keys()) {
    const own = edges.flatMap(edge => (['source', 'target'] as const).filter(role => edge[role === 'source' ? 'from' : 'to'] === nodeId).map(role => result.get(edge.id + '\0' + role)!));
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) if (distance(own[i].point, own[j].point) < MINIMUM_PORT_SEPARATION - PORT_SEPARATION_TOLERANCE) throw portCapacityError(nodeId, own[i].side, edges[0].id);
  }
  return result;
}
/** The public compatibility API continues to return only the route Map. */
export function routeEdges(boxes: Map<string, Box>, edges: LayoutEdge[], options: RoutingOptions): Map<string, EdgeRoute> {
  return routeEdgesDetailed(boxes, edges, options).routes;
}
/** One transaction with typed local pins and pre-join raw legs for the compact owner. */
/** Final measured boxes and explicit contours in; validated absolute orthogonal paths out. */
export function routeEdgesDetailed(boxes: Map<string, Box>, edges: LayoutEdge[], options: RoutingOptions): DetailedRoutingResult {
  const ordered = [...edges].sort((left, right) => left.id.localeCompare(right.id));
  if (!ordered.length) return { routes: new Map(), nodePins: new Map(), labelPins: new Map(), legs: new Map() };
  const { Avoid, nodes, buffer = 12, nudge = 12, labelSlots = new Map<string, Box>() } = options || {};
  if (!Array.isArray(nodes)) throw new RoutingError('INVALID_LAYOUT_REQUEST', '/layout/nodes',
    'Routing requires an explicit contour declaration for every final box.');
  const declared = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || declared.has(node.id) || !boxes.has(node.id)
      || !['rectangle', 'diamond'].includes(node.shape)) {
      const nodeId = node && typeof node.id === 'string' ? node.id : undefined;
      throw new RoutingError('INVALID_LAYOUT_REQUEST', nodeId === undefined ? '/layout/nodes' : `/layout/nodes/${pathPart(nodeId)}`,
        'Routing contours need distinct known node IDs and an explicit rectangle or diamond shape.', { nodeId });
    }
    declared.add(node.id);
  }
  for (const nodeId of boxes.keys()) if (!declared.has(nodeId)) {
    throw new RoutingError('INVALID_LAYOUT_REQUEST', `/layout/nodes/${pathPart(nodeId)}`,
      `Routing needs an explicit contour for final box ${nodeId}.`, { nodeId });
  }
  if (!Avoid) throw new RoutingError('ROUTING_FAILED', '/layout/routes', 'routeEdges requires an initialized libavoid instance.');
  const invalidSlot = inspectLabelSlots(ordered, labelSlots);
  if (invalidSlot) throw new RoutingError(invalidSlot.code, invalidSlot.path, invalidSlot.message, { edgeId: invalidSlot.edgeId });
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const assignments = options.fixedNodePins ? resolveFixedPins(boxes, ordered, nodeById, options.fixedNodePins) : pinAssignments(boxes, ordered, nodeById, labelSlots);
  const labelPairs = new Map<string, OppositeLabelPair>();
  if (options.labelPairs && (options.labelPairs.size !== labelSlots.size || [...options.labelPairs.keys()].some(id => !labelSlots.has(id)))) throw new RoutingError('INVALID_LAYOUT_REQUEST', '/layout/labels', 'Directed pairs refer to unknown label slots.');
  for (const edgeId of labelSlots.keys()) {
    const pair = options.labelPairs?.get(edgeId) ?? ['left', 'right'] as const;
    if (!Array.isArray(pair) || !['left:right', 'right:left', 'top:bottom', 'bottom:top'].includes(pair.join(':'))) throw new RoutingError('INVALID_LAYOUT_REQUEST', '/layout/labels/' + pathPart(edgeId), 'Label pins must be directed opposite sides.', { edgeId });
    labelPairs.set(edgeId, pair);
  }
  if (options.sharedPathPolicy !== undefined && (options.sharedPathPolicy !== 'suggested' || !Avoid.RoutingParameter.fixedSharedPathPenalty)) throw new RoutingError('ROUTING_FAILED', '/layout/routes', 'The runtime does not support suggested shared-path routing.');
  const nodePins = new Map(ordered.map(edge => [edge.id, { source: local(assignments.get(edge.id + '\0source')!), target: local(assignments.get(edge.id + '\0target')!) }]));
  const labelPins = new Map([...labelSlots].map(([id, box]) => { const pair = labelPairs.get(id)!; return [id, { entry: local(labelSlotPin(box, pair[0])), exit: local(labelSlotPin(box, pair[1])) }] as const; }));
  const rawLegs = new Map<string, RoutingLeg[]>();
  const result = new Map<string, EdgeRoute>();
  let router: AvoidRouter | undefined;
  let routingFailure: unknown;
  let subject: RoutingSubject = {};
  const owned: AvoidOwned[] = [];
  const own = <T extends AvoidOwned>(value: T): T => { owned.push(value); return value; };
  try {
    router = new Avoid.Router(Avoid.RouterFlag.OrthogonalRouting.value);
    const P = Avoid.RoutingParameter, O = Avoid.RoutingOption;
    if (options.sharedPathPolicy === 'suggested') router.setRoutingParameter(P.fixedSharedPathPenalty!, -1);
    router.setRoutingParameter(P.shapeBufferDistance, buffer);
    router.setRoutingParameter(P.idealNudgingDistance, nudge);
    router.setRoutingParameter(P.segmentPenalty, 50);
    router.setRoutingParameter(P.crossingPenalty, 200);
    router.setRoutingParameter(P.reverseDirectionPenalty, 500);
    router.setRoutingOption(O.nudgeOrthogonalSegmentsConnectedToShapes, false);
    router.setRoutingOption(O.nudgeSharedPathsWithCommonEndPoint, true);
    router.setRoutingOption(O.penaliseOrthogonalSharedPathsAtConnEnds, true);
    router.setRoutingOption(O.performUnifyingNudgingPreprocessingStep, true);
    const shapes = new Map<string, AvoidShape>();
    for (const [id, box] of boxes) {
      subject = { nodeId: id };
      shapes.set(id, new Avoid.ShapeRef(router, polygonFor(Avoid, box, nodeById.get(id)!.shape === 'diamond', own)));
    }
    const labelShapes = new Map<string, AvoidShape>();
    for (const [edgeId, box] of labelSlots) {
      subject = { edgeId };
      labelShapes.set(edgeId, new Avoid.ShapeRef(router, polygonFor(Avoid, box, false, own)));
    }
    let classId = 1;
    const connect = (edge: LayoutEdge, source: { shape: AvoidShape; pin: Assignment }, target: { shape: AvoidShape; pin: Assignment }) => {
      const endpoints: AvoidOwned[] = [];
      for (const { shape, pin } of [source, target]) {
        subject = { edgeId: edge.id };
        const connection = new Avoid.ShapeConnectionPin(shape, classId, pin.x, pin.y, true, 0, DIRECTIONS[pin.side]);
        connection.setExclusive(true);
        endpoints.push(own(new Avoid.ConnEnd(shape, classId)));
        // Distinct classes are essential when both endpoints share one shape:
        // libavoid otherwise sees an interchangeable set and may collapse a self-loop.
        classId += 1;
      }
      const connector = new Avoid.ConnRef(router!, endpoints[0], endpoints[1]);
      connector.setRoutingType(Avoid.ConnType.ConnType_Orthogonal.value);
      connector.setHateCrossings(true);
      return connector;
    };
    const connectors = ordered.map(edge => {
      const source = { shape: shapes.get(edge.from)!, pin: assignments.get(`${edge.id}\u0000source`)! };
      const target = { shape: shapes.get(edge.to)!, pin: assignments.get(`${edge.id}\u0000target`)! };
      const slot = labelSlots.get(edge.id);
      if (!slot) return { edge, legs: [connect(edge, source, target)] };
      const labelEnd = (side: Side) => ({ shape: labelShapes.get(edge.id)!, pin: labelSlotPin(slot, side) });
      const pair = labelPairs.get(edge.id)!;
      return { edge, legs: [connect(edge, source, labelEnd(pair[0])), connect(edge, labelEnd(pair[1]), target)] };
    });
    subject = {};
    router.processTransaction();
    for (const { edge, legs } of connectors) {
      subject = { edgeId: edge.id };
      const paths = legs.map(connector => {
        const display = connector.displayRoute(), points: Point[] = [];
        for (let index = 0; index < display.size(); index += 1) {
          const point = display.at(index);
          points.push([point.x, point.y]);
        }
        return points;
      });
      const node = (role: 'source' | 'target'): RoutingTerminal => ({ kind: 'node', nodeId: edge[role === 'source' ? 'from' : 'to'], role, pin: { ...nodePins.get(edge.id)![role] } });
      const pair = labelPairs.get(edge.id);
      rawLegs.set(edge.id, pair ? [
        { edgeId: edge.id, from: node('source'), to: { kind: 'caption', edgeId: edge.id, side: pair[0] }, points: paths[0].map(p => [...p]) },
        { edgeId: edge.id, from: { kind: 'caption', edgeId: edge.id, side: pair[1] }, to: node('target'), points: paths[1].map(p => [...p]) },
      ] : [{ edgeId: edge.id, from: node('source'), to: node('target'), points: paths[0].map(p => [...p]) }]);
      const joined = joinLabelRoute(edge.id, paths, labelSlots, pair, options.sharedPathPolicy);
      if (joined.diagnostic) throw new RoutingError(joined.diagnostic.code, joined.diagnostic.path, joined.diagnostic.message, { edgeId: edge.id });
      const sourcePin = assignments.get(`${edge.id}\u0000source`)!, targetPin = assignments.get(`${edge.id}\u0000target`)!;
      const route = { edge, points: joined.points, sourceSide: sourcePin.side, targetSide: targetPin.side };
      validateFinalRoute(boxes, nodeById, route, sourcePin, targetPin);
      result.set(edge.id, route);
    }
  } catch (cause) {
    routingFailure = cause;
    if (cause instanceof RoutingError) throw cause;
    throw new RoutingError('ROUTING_FAILED', '/layout/routes',
      `libavoid routing failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause, ...subject });
  } finally {
    // Shapes, pins and connectors are router-owned. Value arguments are ours;
    // release them after the router, including failures during construction.
    const failures: unknown[] = [];
    try { router?.delete(); } catch (cause) { failures.push(cause); }
    for (const value of owned.reverse()) {
      try { value.delete(); } catch (cause) { failures.push(cause); }
    }
    if (failures.length) {
      if (routingFailure !== undefined) failures.unshift(routingFailure);
      throw new RoutingError('ROUTING_FAILED', '/layout/routes', 'libavoid resource cleanup failed.',
        { cause: new AggregateError(failures, 'Routing and resource cleanup failures.') });
    }
  }
  const endpointEvents = new Map<string, { edge: LayoutEdge; point: Point; partner: string }[]>([...boxes.keys()].map(id => [id, []]));
  for (const route of result.values()) {
    endpointEvents.get(route.edge.from)!.push({ edge: route.edge, point: route.points[0], partner: route.edge.to });
    endpointEvents.get(route.edge.to)!.push({ edge: route.edge, point: route.points.at(-1)!, partner: route.edge.from });
  }
  for (const [nodeId, events] of endpointEvents) for (let left = 0; left < events.length; left += 1) {
    for (let right = left + 1; right < events.length; right += 1) {
      if (distance(events[left].point, events[right].point) < 8) {
        throw new RoutingError('ROUTING_FAILED', `/layout/nodes/${pathPart(nodeId)}`,
          `libavoid collapsed exclusive ports for edges ${events[left].edge.id} and ${events[right].edge.id} on card ${nodeId}: ${JSON.stringify([events[left].point, events[right].point])}.`, { nodeId });
      }
    }
  }
  return { routes: result, nodePins, labelPins, legs: rawLegs };
}
