import { measureText } from './text.js';
import type { Point, Size, Bounds, Box, LabelTypography, EdgeRoute, Diagnostic } from './types.js';
const EPSILON = 1e-6;
const pathPart = (id: string) => id.replace(/~/gu, '~0').replace(/\//gu, '~1');
const overlaps = (a: Bounds, b: Bounds) => a.left < b.right - EPSILON && b.left < a.right - EPSILON
  && a.top < b.bottom - EPSILON && b.top < a.bottom - EPSILON;
const boxAt = (center: Point, size: Size, padding = 0) => ({
  left: center[0] - size.width / 2 - padding,
  top: center[1] - size.height / 2 - padding,
  right: center[0] + size.width / 2 + padding,
  bottom: center[1] + size.height / 2 + padding,
});

export function estimateEdgeLabel(text: string, typography: LabelTypography) {
  const lines = text.split('\n');
  return {
    width: Math.ceil(Math.max(...lines.map(line => measureText(line, typography.fontSize)))) + typography.paddingX,
    height: lines.length * typography.fontSize * typography.lineHeight + typography.paddingY,
  };
}

export function segmentEntersOpenBox([[x, y], [endX, endY]]: readonly [Point, Point], box: Bounds) {
  let low = 0, high = 1;
  for (const [origin, delta, minimum, maximum] of [
    [x, endX - x, box.left + EPSILON, box.right - EPSILON],
    [y, endY - y, box.top + EPSILON, box.bottom - EPSILON],
  ]) {
    if (minimum >= maximum) return false;
    if (Math.abs(delta) < EPSILON) {
      if (origin <= minimum || origin >= maximum) return false;
    } else {
      const first = (minimum - origin) / delta, second = (maximum - origin) / delta;
      low = Math.max(low, Math.min(first, second));
      high = Math.min(high, Math.max(first, second));
      if (low >= high) return false;
    }
  }
  return high - low > EPSILON;
}

function candidateCenters(points: Point[], step: number) {
  const segments = points.slice(1).map((point, index): [Point, Point] => [points[index], point]);
  const lengths = segments.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const result: { center: Point; distance: number; middleDistance: number }[] = [];
  let travelled = 0;
  for (const [index, [a, b]] of segments.entries()) {
    const length = lengths[index];
    for (let distance = 0; distance <= length + EPSILON; distance += step) {
      const fraction = length ? Math.min(1, distance / length) : 0;
      result.push({
        center: [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])],
        distance: travelled + Math.min(distance, length),
        middleDistance: Math.abs(travelled + Math.min(distance, length) - total / 2),
      });
    }
    if (length && result.at(-1)!.distance < travelled + length - EPSILON) {
      result.push({ center: [...b], distance: travelled + length, middleDistance: Math.abs(travelled + length - total / 2) });
    }
    travelled += length;
  }
  return result.sort((a, b) => a.middleDistance - b.middleDistance || a.distance - b.distance);
}

/** Place longest labels first without changing any route. Missing space is explicit. */
export interface RouteLabelOptions {
  step?: number;
  padding?: number;
  preferContent?: boolean;
  /** Transparent boundary strokes block text, without becoming solid routing boxes. */
  blockedSegments?: readonly (readonly [Point, Point])[];
}

export function placeRouteLabels(boxes: Map<string, Box>, routes: Map<string, EdgeRoute>, sizes: Map<string, Size>, { step = 4, padding = 0, preferContent = false, blockedSegments = [] }: RouteLabelOptions = {}) {
  const cards = [...boxes].map(([id, box]) => ({ id, left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }));
  const content = {
    left: Math.min(...cards.map(card => card.left)), top: Math.min(...cards.map(card => card.top)),
    right: Math.max(...cards.map(card => card.right)), bottom: Math.max(...cards.map(card => card.bottom)),
  };
  const placed: { edgeId: string; box: Bounds }[] = [];
  const centers = new Map<string, { center: Point; box: Bounds }>();
  const diagnostics: Diagnostic[] = [];
  const availability = new Map([...routes].map(([edgeId, route]) => {
    const size = sizes.get(edgeId)!;
    const foreign = [...routes].filter(([id]) => id !== edgeId);
    const count = candidateCenters(route.points, step).filter(candidate => {
      const box = boxAt(candidate.center, size, padding);
      return !cards.some(card => overlaps(box, card))
        && !blockedSegments.some(segment => segmentEntersOpenBox(segment, box))
        && !foreign.some(([, other]) => other.points.slice(1).some((point, index) => segmentEntersOpenBox([other.points[index], point], box)));
    }).length;
    return [edgeId, count];
  }));
  const ordered = [...routes].sort(([leftId], [rightId]) => {
    const left = sizes.get(leftId)!, right = sizes.get(rightId)!;
    return availability.get(leftId)! - availability.get(rightId)!
      || right.width * right.height - left.width * left.height
      || leftId.localeCompare(rightId);
  });
  for (const [edgeId, route] of ordered) {
    const size = sizes.get(edgeId)!;
    const foreign = [...routes].filter(([id]) => id !== edgeId);
    const candidates = candidateCenters(route.points, step).map(candidate => {
      const box = boxAt(candidate.center, size, padding);
      const overflow = Math.max(0, content.left - box.left) + Math.max(0, box.right - content.right)
        + Math.max(0, content.top - box.top) + Math.max(0, box.bottom - content.bottom);
      return { ...candidate, overflow };
    }).sort((left, right) => (preferContent ? left.overflow - right.overflow : 0)
      || left.middleDistance - right.middleDistance || left.distance - right.distance);
    const selected = candidates.find(candidate => {
      const box = boxAt(candidate.center, size, padding);
      return !cards.some(card => overlaps(box, card))
        && !blockedSegments.some(segment => segmentEntersOpenBox(segment, box))
        && !placed.some(label => overlaps(box, label.box))
        && !foreign.some(([, other]) => other.points.slice(1).some((point, index) => segmentEntersOpenBox([other.points[index], point], box)));
    });
    if (!selected) {
      diagnostics.push({ code: 'LABEL_NO_SLOT', path: `/layout/labels/${pathPart(edgeId)}`, edgeId,
        message: 'No collision-free slot exists along this edge route; the route and label text were left unchanged.' });
      continue;
    }
    const box = boxAt(selected.center, size);
    placed.push({ edgeId, box: boxAt(selected.center, size, padding) });
    centers.set(edgeId, { center: selected.center, box });
  }
  return { centers, diagnostics };
}

function samePoint(left: Point, right: Point) {
  return left[0] === right[0] && left[1] === right[1];
}

function splitLongest(points: Point[]) {
  let longest = -1, index = 0;
  for (let cursor = 0; cursor < points.length - 1; cursor += 1) {
    const length = Math.hypot(points[cursor + 1][0] - points[cursor][0], points[cursor + 1][1] - points[cursor][1]);
    if (length > longest) { longest = length; index = cursor; }
  }
  if (longest <= EPSILON) return false;
  const middle: Point = [(points[index][0] + points[index + 1][0]) / 2, (points[index][1] + points[index + 1][1]) / 2];
  points.splice(index + 1, 0, middle);
  return true;
}

/** Make the chosen label center the odd middle point using only collinear padding. */
export function excalidrawLabelPath(points: Point[], center: Point, maximumPoints = 17) {
  let nearest = { distance: Infinity, index: 0, point: points[0] };
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index], b = points[index + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], square = dx * dx + dy * dy || 1;
    const fraction = Math.max(0, Math.min(1, ((center[0] - a[0]) * dx + (center[1] - a[1]) * dy) / square));
    const point: Point = [a[0] + fraction * dx, a[1] + fraction * dy];
    const distance = Math.hypot(point[0] - center[0], point[1] - center[1]);
    if (distance < nearest.distance) nearest = { distance, index, point };
  }
  const a = points[nearest.index], b = points[nearest.index + 1];
  const onSegment = b !== undefined && (center[0] - a[0]) * (b[1] - a[1]) === (center[1] - a[1]) * (b[0] - a[0])
    && center[0] >= Math.min(a[0], b[0]) && center[0] <= Math.max(a[0], b[0])
    && center[1] >= Math.min(a[1], b[1]) && center[1] <= Math.max(a[1], b[1]);
  // Preserve exact on-segment centers without rounding them through projection;
  // proximity alone must never introduce a bend or remove a nearby real vertex.
  const projected: Point = onSegment ? [...center] : nearest.point;
  const left = points.slice(0, nearest.index + 1);
  const right = points.slice(nearest.index + 1);
  if (samePoint(left.at(-1)!, projected)) left.pop();
  if (right.length && samePoint(right[0], projected)) right.shift();
  while (left.length < right.length) {
    const working = [...left, projected];
    if (!splitLongest(working)) break;
    left.splice(0, left.length, ...working.slice(0, -1));
  }
  while (right.length < left.length) {
    const working = [projected, ...right];
    if (!splitLongest(working)) break;
    right.splice(0, right.length, ...working.slice(1));
  }
  const result = [...left, projected, ...right];
  return {
    points: result,
    labelCenter: projected,
    offset: onSegment ? 0 : nearest.distance,
    valid: result.length <= maximumPoints && left.length === right.length,
  };
}
