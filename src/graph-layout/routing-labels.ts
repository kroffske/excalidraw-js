import { segmentEntersOpenBox } from './labels.js';
import type { Box, Diagnostic, LayoutEdge, Point } from './types.js';

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
export function labelSlotPin(box: Box, side: 'left' | 'right') {
  const x = side === 'left' ? 0 : 1;
  return { side, x, y: 0.5, point: [box.x + x * box.width, box.y + box.height / 2] as Point };
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
export function joinLabelRoute(edgeId: string, paths: readonly Point[][], slots: ReadonlyMap<string, Box>): JoinedLabelRoute {
  const failure = (message: string): JoinedLabelRoute => ({ diagnostic: {
    code: 'ROUTING_FAILED', path: `/layout/routes/${pathPart(edgeId)}`, edgeId, message,
  } });
  const slot = slots.get(edgeId);
  if (slot) {
    const [before, after] = paths;
    const left = labelSlotPin(slot, 'left').point, right = labelSlotPin(slot, 'right').point;
    if (paths.length !== 2 || !before || !after || before.length < 2 || after.length < 2
      || before.some(point => point.some(value => !Number.isFinite(value))) || after.some(point => point.some(value => !Number.isFinite(value)))
      || distance(before.at(-1)!, left) > EPSILON || distance(after[0], right) > EPSILON
      || before.at(-2)![0] > left[0] + EPSILON || after[1][0] < right[0] - EPSILON
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
  return { points: simplifyOrthogonal(points, slot !== undefined) };
}
