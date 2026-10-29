import { segmentEntersOpenBox } from './labels.js';
import type { Box, Diagnostic, LayoutEdge, Point, Side } from './types.js';

const EPSILON = 1e-6;
const CLEANUP_EPSILON = 0.01;
const pathPart = (id: string) => id.replace(/~/gu, '~0').replace(/\//gu, '~1');
const bounds = (box: Box) => ({ left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height });
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Slot admission is complete before any native resource is created. */
export function inspectLabelSlots(edges: readonly LayoutEdge[], slots: ReadonlyMap<string, Box>): Diagnostic | undefined {
  const ids = new Set(edges.map(edge => edge.id));
  for (const [edgeId, slot] of slots) {
    if (!ids.has(edgeId) || !slot || ![slot.x, slot.y, slot.width, slot.height, slot.x + slot.width, slot.y + slot.height].every(Number.isFinite)
      || slot.width <= 0 || slot.height <= 0) {
      return { code: 'INVALID_LAYOUT_REQUEST', path: `/layout/labels/${pathPart(edgeId)}`, edgeId,
        message: `Reserved label ${edgeId} needs a known edge and finite positive geometry.` };
    }
  }
}

/** Opposite fixed central ports, never libavoid's automatic side selection. */
export function labelSlotPin(box: Box, side: Side) {
  const [x, y] = ({ left: [0, .5], right: [1, .5], top: [.5, 0], bottom: [.5, 1] } as const)[side];
  return { side, x, y, point: [box.x + x * box.width, box.y + y * box.height] as Point };
}

/** Compact geometry keeps every represented bend and both terminal coordinates.
 * Remove only exact duplicates or an intermediate point on one monotone axis. */
export function simplifyCompactPath(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    result.push([...point]);
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3);
      const axis = a[0] === b[0] && b[0] === c[0] ? 1
        : a[1] === b[1] && b[1] === c[1] ? 0 : -1;
      if (axis === -1 || b[axis] < Math.min(a[axis], c[axis]) || b[axis] > Math.max(a[axis], c[axis])) break;
      result.splice(-2, 1);
    }
  }
  return result;
}

function simplifyOrthogonal(points: Point[], preserveReversals: boolean) {
  const result: Point[] = [];
  for (const point of points) {
    if (result.length && distance(point, result.at(-1)!) < CLEANUP_EPSILON) continue;
    result.push(point);
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3);
      if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > CLEANUP_EPSILON) break;
      // Fixed-label joins retain retraces; ordinary routes keep the legacy spur cleanup.
      if (preserveReversals && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < -CLEANUP_EPSILON) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

export type JoinedLabelRoute = { points: Point[]; diagnostic?: never } | { diagnostic: Diagnostic; points?: never };

/** Join only verified central, opposite entry/exit legs; foreign slots remain obstacles. */
export function joinLabelRoute(edgeId: string, paths: readonly Point[][], slots: ReadonlyMap<string, Box>, pair: readonly [Side, Side] = ['left', 'right'], sharedPathPolicy?: 'suggested'): JoinedLabelRoute {
  const failure = (message: string): JoinedLabelRoute => ({ diagnostic: {
    code: 'ROUTING_FAILED', path: `/layout/routes/${pathPart(edgeId)}`, edgeId, message,
  } });
  const slot = slots.get(edgeId);
  if (slot) {
    const [before, after] = paths;
    const left = labelSlotPin(slot, pair[0]).point, right = labelSlotPin(slot, pair[1]).point;
    const outward = (side: Side, p: Point, q: Point) => ({ left: p[0] - q[0], right: q[0] - p[0], top: p[1] - q[1], bottom: q[1] - p[1] })[side];
    if (paths.length !== 2 || !before || !after || before.length < 2 || after.length < 2
      || before.some(point => point.some(value => !Number.isFinite(value))) || after.some(point => point.some(value => !Number.isFinite(value)))
      || distance(before.at(-1)!, left) > EPSILON || distance(after[0], right) > EPSILON
      || outward(pair[0], left, before.at(-2)!) < -EPSILON || outward(pair[1], right, after[1]) < -EPSILON
      || paths.some(path => path.slice(1).some((point, index) => segmentEntersOpenBox([path[index], point], bounds(slot))))) {
      return failure(`libavoid moved the fixed central label ports for edge ${edgeId}.`);
    }
  }
  const points = slot ? [...paths[0], [slot.x + slot.width / 2, slot.y + slot.height / 2] as Point, ...paths[1]] : paths[0];
  for (const [foreignId, box] of slots) {
    if (foreignId !== edgeId && points.slice(1).some((point, index) => segmentEntersOpenBox([points[index], point], bounds(box)))) {
      return failure(`libavoid routed edge ${edgeId} through reserved label ${foreignId}.`);
    }
  }
  return { points: sharedPathPolicy === 'suggested' ? simplifyCompactPath(points) : simplifyOrthogonal(points, slot !== undefined) };
}
