import { createHash } from "node:crypto";
import type { Fixture } from "./fixture.js";
import type { Placement, Point, Rect } from "./model.js";
import { codePointCompare } from "./rank.js";

export interface CanonicalGeometry extends Placement {
  routes: Record<string, Point[]>;
}

export function canonicalizeGeometry(
  fixture: Fixture,
  placement: Placement,
  routes: Record<string, Point[]>,
): CanonicalGeometry {
  assertCompleteKeys(
    fixture.nodes.map((node) => node.id),
    Object.keys(placement.nodeBounds),
    "INCOMPLETE_NODE_SET",
  );
  assertCompleteKeys(
    fixture.groups.map((group) => group.id),
    Object.keys(placement.groupBounds),
    "INCOMPLETE_GROUP_SET",
  );
  assertCompleteKeys(
    fixture.edges.map((edge) => edge.id),
    Object.keys(routes),
    "INCOMPLETE_EDGE_SET",
  );
  const frames = [
    ...Object.values(placement.nodeBounds),
    ...Object.values(placement.groupBounds),
  ];
  const minX = Math.min(...frames.map((rect) => rect.x));
  const minY = Math.min(...frames.map((rect) => rect.y));
  const nodeBounds = sortedRecord(
    placement.nodeBounds,
    (rect) => canonicalRect(rect, minX, minY),
  );
  const groupBounds = sortedRecord(
    placement.groupBounds,
    (rect) => canonicalRect(rect, minX, minY),
  );
  const canonicalRoutes = sortedRecord(routes, (points) =>
    stripRoute(
      points.map(([x, y]) => [round(x - minX), round(y - minY)] as Point),
    ),
  );
  return {
    ranks: sortedRecord(placement.ranks, (value) => value),
    order: sortedRecord(placement.order, (value) => value),
    nodeBounds,
    groupBounds,
    routes: canonicalRoutes,
  };
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function stripRoute(points: Point[]): Point[] {
  const distinct: Point[] = [];
  for (const point of points) {
    const previous = distinct.at(-1);
    if (!previous || toHundredths(previous[0]) !== toHundredths(point[0]) ||
      toHundredths(previous[1]) !== toHundredths(point[1])) {
      distinct.push(point);
    }
  }
  const stripped: Point[] = [];
  for (const point of distinct) {
    while (stripped.length >= 2 && collinearHundredths(
      stripped[stripped.length - 2],
      stripped[stripped.length - 1],
      point,
    )) {
      stripped.pop();
    }
    stripped.push(point);
  }
  if (stripped.length < 2) throw new Error("INCOMPLETE_EDGE_SET:short route");
  return stripped;
}

function canonicalRect(rect: Rect, minX: number, minY: number): Rect {
  return {
    x: round(rect.x - minX),
    y: round(rect.y - minY),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function round(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toHundredths(value: number): number {
  return Math.round(value * 100);
}

function collinearHundredths(a: Point, b: Point, c: Point): boolean {
  const ax = toHundredths(a[0]);
  const ay = toHundredths(a[1]);
  const bx = toHundredths(b[0]);
  const by = toHundredths(b[1]);
  const cx = toHundredths(c[0]);
  const cy = toHundredths(c[1]);
  return (
    (bx - ax) * (cy - ay) === (by - ay) * (cx - ax) &&
    bx >= Math.min(ax, cx) &&
    bx <= Math.max(ax, cx) &&
    by >= Math.min(ay, cy) &&
    by <= Math.max(ay, cy)
  );
}

function sortedRecord<T, U>(
  input: Record<string, T>,
  mapValue: (value: T) => U,
): Record<string, U> {
  return Object.fromEntries(
    Object.keys(input)
      .sort(codePointCompare)
      .map((key) => [key, mapValue(input[key])]),
  );
}

function assertCompleteKeys(
  expected: string[],
  actual: string[],
  reason: string,
): void {
  const left = [...expected].sort(codePointCompare);
  const right = [...actual].sort(codePointCompare);
  if (
    left.length !== right.length ||
    left.some((value, index) => value !== right[index])
  ) {
    throw new Error(`${reason}:expected=${left.join(",")}:actual=${right.join(",")}`);
  }
}
