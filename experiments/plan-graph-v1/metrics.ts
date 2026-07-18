import type { Fixture } from "./fixture.js";
import type {
  MeasuredFixture,
  Point,
  Rect,
  RouteDiagnostics,
  Score,
  StructuralIssue,
} from "./model.js";

export function scoreGeometry(
  measured: MeasuredFixture,
  nodeBounds: Record<string, Rect>,
  groupBounds: Record<string, Rect>,
  routes: Record<string, Point[]>,
): { score: Score; structuralIssues: StructuralIssue[]; routeDiagnostics: RouteDiagnostics } {
  const { fixture } = measured;
  const structuralIssues = structuralChecks(
    measured,
    nodeBounds,
    groupBounds,
    routes,
  );
  const crossing = crossingMetrics(fixture, routes);
  const nodeSizes = Object.values(nodeBounds)
    .map((rect) => Math.max(rect.width, rect.height))
    .sort((left, right) => left - right);
  const medianNodeSize = median(nodeSizes);
  const totalLength = Object.values(routes).reduce(
    (total, points) => total + manhattanLength(points),
    0,
  );
  const layoutBounds = boundingRect([
    ...Object.values(nodeBounds),
    ...Object.values(groupBounds),
  ]);
  const nodeArea = Object.values(nodeBounds).reduce(
    (total, rect) => total + rect.width * rect.height,
    0,
  );
  return {
    score: {
      crossings: crossing.crossings,
      bends: Object.values(routes).reduce(
        (total, points) => total + Math.max(0, points.length - 2),
        0,
      ),
      normalizedLength:
        fixture.edges.length === 0 || medianNodeSize === 0
          ? 0
          : totalLength / (fixture.edges.length * medianNodeSize),
      normalizedArea:
        nodeArea === 0
          ? 0
          : (layoutBounds.width * layoutBounds.height) / nodeArea,
    },
    structuralIssues,
    routeDiagnostics: {
      nearMisses: nearMisses(fixture, nodeBounds, groupBounds, routes),
      nonSharedTouches: crossing.touches,
      nonSharedOverlapLength: crossing.overlapLength,
    },
  };
}

export function crossingMetrics(
  fixture: Fixture,
  routes: Record<string, Point[]>,
): { crossings: number; touches: number; overlapLength: number } {
  let crossings = 0;
  let touches = 0;
  let overlapLength = 0;
  for (let leftIndex = 0; leftIndex < fixture.edges.length; leftIndex += 1) {
    const leftEdge = fixture.edges[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < fixture.edges.length;
      rightIndex += 1
    ) {
      const rightEdge = fixture.edges[rightIndex];
      const sharedSemanticEndpoint =
        leftEdge.from === rightEdge.from ||
        leftEdge.from === rightEdge.to ||
        leftEdge.to === rightEdge.from ||
        leftEdge.to === rightEdge.to;
      const leftSegments = segments(routes[leftEdge.id]);
      const rightSegments = segments(routes[rightEdge.id]);
      for (const left of leftSegments) {
        for (const right of rightSegments) {
          const relation = segmentRelation(left, right);
          if (relation.kind === "proper") crossings += 1;
          if (!sharedSemanticEndpoint && relation.kind === "touch") touches += 1;
          if (!sharedSemanticEndpoint && relation.kind === "overlap") {
            overlapLength += relation.length;
          }
        }
      }
    }
  }
  return { crossings, touches, overlapLength };
}

export function structuralChecks(
  measured: MeasuredFixture,
  nodeBounds: Record<string, Rect>,
  groupBounds: Record<string, Rect>,
  routes: Record<string, Point[]>,
): StructuralIssue[] {
  const { fixture } = measured;
  const issues: StructuralIssue[] = [];
  for (let index = 0; index < fixture.nodes.length; index += 1) {
    const left = fixture.nodes[index];
    const leftRect = nodeBounds[left.id];
    for (let other = index + 1; other < fixture.nodes.length; other += 1) {
      const right = fixture.nodes[other];
      const rightRect = nodeBounds[right.id];
      if (axisGap(leftRect.x, leftRect.width, rightRect.x, rightRect.width) < 8 &&
        axisGap(leftRect.y, leftRect.height, rightRect.y, rightRect.height) < 8) {
        issues.push(issue("NODE_GAP", [left.id, right.id], "node gap below 8 px"));
      }
    }
  }
  for (let index = 0; index < fixture.groups.length; index += 1) {
    const left = fixture.groups[index];
    const leftRect = groupBounds[left.id];
    for (let other = index + 1; other < fixture.groups.length; other += 1) {
      const right = fixture.groups[other];
      if (positiveRectOverlap(leftRect, groupBounds[right.id])) {
        issues.push(issue("GROUP_INTERSECTION", [left.id, right.id], "group interiors overlap"));
      }
    }
    const measuredGroup = measured.groups[left.id];
    for (const member of left.members) {
      const child = nodeBounds[member];
      if (
        child.x < leftRect.x + measuredGroup.padding ||
        child.x + child.width >
          leftRect.x + leftRect.width - measuredGroup.padding ||
        child.y <
          leftRect.y +
            measuredGroup.padding +
            measuredGroup.titleHeight +
            measuredGroup.headerGap ||
        child.y + child.height >
          leftRect.y + leftRect.height - measuredGroup.padding
      ) {
        issues.push(issue("CHILD_OUTSIDE_GROUP", [left.id, member], "child is outside group content interior"));
      }
    }
  }
  const groupByNode = new Map(
    fixture.nodes.map((node) => [node.id, node.group]),
  );
  for (const edge of fixture.edges) {
    const route = routes[edge.id];
    const source = nodeBounds[edge.from];
    const target = nodeBounds[edge.to];
    if (!pointOnBoundary(route[0], source) || !pointOnBoundary(route.at(-1)!, target)) {
      issues.push(issue("ROUTE_ENDPOINT", [edge.id], "route endpoint is not on declared frame anchor"));
    }
    for (const node of fixture.nodes) {
      if (node.id === edge.from || node.id === edge.to) continue;
      if (polylinePositiveInside(route, nodeBounds[node.id])) {
        issues.push(issue("ROUTE_THROUGH_NODE", [edge.id, node.id], "route crosses unrelated node frame"));
      }
    }
    const sourceGroup = groupByNode.get(edge.from);
    const targetGroup = groupByNode.get(edge.to);
    for (const group of fixture.groups) {
      if (group.id === sourceGroup || group.id === targetGroup) continue;
      const frame = groupBounds[group.id];
      if (polylinePositiveInside(route, frame)) {
        issues.push(issue("ROUTE_THROUGH_GROUP", [edge.id, group.id], "route crosses unrelated group frame"));
      }
      const measuredGroup = measured.groups[group.id];
      const titleBand = {
        ...frame,
        height:
          measuredGroup.padding +
          measuredGroup.titleHeight +
          measuredGroup.headerGap,
      };
      if (polylinePositiveInside(route, titleBand)) {
        issues.push(issue("ROUTE_THROUGH_TITLE", [edge.id, group.id], "route crosses unrelated title band"));
      }
    }
  }
  return dedupeIssues(issues);
}

export function primaryRankIssues(
  fixture: Fixture,
  ranks: Record<string, number>,
): StructuralIssue[] {
  return fixture.edges
    .filter(
      (edge) =>
        edge.kind === "primary" && !(ranks[edge.to] > ranks[edge.from]),
    )
    .map((edge) =>
      issue(
        "PRIMARY_RANK_REVERSAL",
        [edge.id, edge.from, edge.to],
        "primary target rank must increase",
      ),
    );
}

function nearMisses(
  fixture: Fixture,
  nodeBounds: Record<string, Rect>,
  groupBounds: Record<string, Rect>,
  routes: Record<string, Point[]>,
): RouteDiagnostics["nearMisses"] {
  const found: RouteDiagnostics["nearMisses"] = [];
  for (const edge of fixture.edges) {
    for (const [id, rect] of [
      ...Object.entries(nodeBounds),
      ...Object.entries(groupBounds),
    ]) {
      if (
        !polylinePositiveInside(routes[edge.id], rect) &&
        polylinePositiveInside(routes[edge.id], inflate(rect, 6))
      ) {
        found.push({ edge: edge.id, obstacle: id, distanceBand: "0-6px" });
      }
    }
  }
  return found;
}

type Segment = [Point, Point];
type Relation =
  | { kind: "none" | "proper" | "touch" }
  | { kind: "overlap"; length: number };

function segmentRelation([a, b]: Segment, [c, d]: Segment): Relation {
  const ai = integerPoint(a);
  const bi = integerPoint(b);
  const ci = integerPoint(c);
  const di = integerPoint(d);
  const o1 = orientation(ai, bi, ci);
  const o2 = orientation(ai, bi, di);
  const o3 = orientation(ci, di, ai);
  const o4 = orientation(ci, di, bi);
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    const overlap = collinearOverlap(ai, bi, ci, di);
    if (overlap > 0) return { kind: "overlap", length: overlap / 100 };
    if (overlap === 0 && boundingBoxesTouch(ai, bi, ci, di)) return { kind: "touch" };
    return { kind: "none" };
  }
  if (opposite(o1, o2) && opposite(o3, o4)) return { kind: "proper" };
  if (
    (o1 === 0 && onSegment(ai, bi, ci)) ||
    (o2 === 0 && onSegment(ai, bi, di)) ||
    (o3 === 0 && onSegment(ci, di, ai)) ||
    (o4 === 0 && onSegment(ci, di, bi))
  ) {
    return { kind: "touch" };
  }
  return { kind: "none" };
}

function polylinePositiveInside(points: Point[], rect: Rect): boolean {
  return segments(points).some((segment) => segmentLengthInsideRect(segment, rect) > 0);
}

function segmentLengthInsideRect([start, end]: Segment, rect: Rect): number {
  let low = 0;
  let high = 1;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  for (const [p, q] of [
    [-dx, start[0] - rect.x],
    [dx, rect.x + rect.width - start[0]],
    [-dy, start[1] - rect.y],
    [dy, rect.y + rect.height - start[1]],
  ]) {
    if (p === 0 && q < 0) return 0;
    if (p < 0) low = Math.max(low, q / p);
    if (p > 0) high = Math.min(high, q / p);
  }
  if (high <= low) return 0;
  return Math.hypot(dx, dy) * (high - low);
}

function pointOnBoundary(point: Point, rect: Rect): boolean {
  const [x, y] = point.map((value) => Math.round(value * 100)) as Point;
  const left = Math.round(rect.x * 100);
  const right = Math.round((rect.x + rect.width) * 100);
  const top = Math.round(rect.y * 100);
  const bottom = Math.round((rect.y + rect.height) * 100);
  return (
    ((x === left || x === right) && y >= top && y <= bottom) ||
    ((y === top || y === bottom) && x >= left && x <= right)
  );
}

function segments(points: Point[]): Segment[] {
  return points.slice(1).map((point, index) => [points[index], point]);
}

function manhattanLength(points: Point[]): number {
  return segments(points).reduce(
    (total, [[x1, y1], [x2, y2]]) =>
      total + Math.abs(x2 - x1) + Math.abs(y2 - y1),
    0,
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function boundingRect(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function integerPoint([x, y]: Point): Point {
  return [Math.round(x * 100), Math.round(y * 100)];
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
  return Math.sign(value);
}

function opposite(left: number, right: number): boolean {
  return (left < 0 && right > 0) || (left > 0 && right < 0);
}

function onSegment(a: Point, b: Point, point: Point): boolean {
  return (
    point[0] >= Math.min(a[0], b[0]) &&
    point[0] <= Math.max(a[0], b[0]) &&
    point[1] >= Math.min(a[1], b[1]) &&
    point[1] <= Math.max(a[1], b[1])
  );
}

function collinearOverlap(a: Point, b: Point, c: Point, d: Point): number {
  const useX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const [a1, a2] = useX ? [a[0], b[0]] : [a[1], b[1]];
  const [c1, c2] = useX ? [c[0], d[0]] : [c[1], d[1]];
  return Math.min(Math.max(a1, a2), Math.max(c1, c2)) -
    Math.max(Math.min(a1, a2), Math.min(c1, c2));
}

function boundingBoxesTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
    Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
      Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
  );
}

function axisGap(
  leftStart: number,
  leftSize: number,
  rightStart: number,
  rightSize: number,
): number {
  return Math.max(
    0,
    rightStart - (leftStart + leftSize),
    leftStart - (rightStart + rightSize),
  );
}

function positiveRectOverlap(left: Rect, right: Rect): boolean {
  return (
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x) >
      0 &&
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y) >
      0
  );
}

function inflate(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function issue(
  code: StructuralIssue["code"],
  ids: string[],
  message: string,
): StructuralIssue {
  return { code, ids, message };
}

function dedupeIssues(issues: StructuralIssue[]): StructuralIssue[] {
  const seen = new Set<string>();
  return issues.filter((entry) => {
    const key = `${entry.code}:${entry.ids.join(":")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
