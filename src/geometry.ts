export type ElementLike = Record<string, unknown>;
export type PointTuple = [number, number];

export class Point {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}
}

export class Size {
  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}
}

export class Bounds {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly width: number,
    public readonly height: number,
  ) {}

  get left(): number {
    return this.x;
  }

  get right(): number {
    return this.x + this.width;
  }

  get top(): number {
    return this.y;
  }

  get bottom(): number {
    return this.y + this.height;
  }

  get centerX(): number {
    return this.x + this.width / 2;
  }

  get centerY(): number {
    return this.y + this.height / 2;
  }

  get center_x(): number {
    return this.centerX;
  }

  get center_y(): number {
    return this.centerY;
  }
}

export class PlacedBlock {
  bindingTarget?: ElementLike;

  constructor(
    public elements: ElementLike[],
    public bounds: Bounds,
  ) {}

  withBindingTarget(target: ElementLike): this {
    this.bindingTarget = target;
    return this;
  }

  translated(dx: number, dy: number): PlacedBlock {
    translate(this.elements, dx, dy);
    this.bounds = new Bounds(this.bounds.x + dx, this.bounds.y + dy, this.bounds.width, this.bounds.height);
    return this;
  }
}

export function elementBounds(element: ElementLike): Bounds {
  return new Bounds(
    Number(element.x ?? 0),
    Number(element.y ?? 0),
    Number(element.width ?? 0),
    Number(element.height ?? 0),
  );
}

export function boundsFor(elements: Iterable<ElementLike>): Bounds {
  const boxes = Array.from(elements, elementBounds);
  if (boxes.length === 0) {
    return new Bounds(0, 0, 0, 0);
  }
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return new Bounds(left, top, right - left, bottom - top);
}

export function inflateBounds(bounds: Bounds, padding: number): Bounds {
  return new Bounds(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2);
}

export function polylineIntersectsBounds(points: PointTuple[], bounds: Bounds): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsBounds(points[index], points[index + 1], bounds)) {
      return true;
    }
  }
  return false;
}

/** Total routed length of a polyline in px. */
export function polylineLength(points: PointTuple[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return total;
}

/**
 * Point at arc-length `distance` measured from the polyline's start, clamped to
 * `[0, polylineLength]`. Used to slide an edge label along its own connection
 * line so colliding labels can be nudged apart without leaving the line.
 */
export function pointAlongPolyline(points: PointTuple[], distance: number): PointTuple {
  if (points.length === 0) {
    return [0, 0];
  }
  if (points.length === 1) {
    return points[0];
  }
  let remaining = Math.max(0, Math.min(distance, polylineLength(points)));
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    const segment = Math.hypot(x2 - x1, y2 - y1);
    if (segment === 0) {
      continue;
    }
    if (remaining <= segment) {
      const t = remaining / segment;
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    remaining -= segment;
  }
  return points[points.length - 1];
}

/**
 * Connector styling shared by the high-level (`diagram.flow`) and low-level
 * (`layout.connect`) edge paths so both recede long edges the same way. A
 * neutral default connector whose routed length reaches `LONG_EDGE_LENGTH`
 * switches to `LONG_EDGE_COLOR` (a muted steel-blue) so one long line does not
 * dominate the canvas. Both are tunable; semantic/explicit colors are untouched.
 */
export const LONG_EDGE_LENGTH = 320;
export const LONG_EDGE_COLOR = "#6471a0";

export function segmentIntersectsBounds(start: PointTuple, end: PointTuple, bounds: Bounds): boolean {
  if (pointInsideBounds(start, bounds) || pointInsideBounds(end, bounds)) {
    return true;
  }
  const corners: PointTuple[] = [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.right, bounds.bottom],
    [bounds.left, bounds.bottom],
  ];
  return corners.some((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return segmentsIntersect(start, end, corner, next);
  });
}

export function asElements(value: ElementLike | PlacedBlock | ElementLike[]): ElementLike[] {
  if (value instanceof PlacedBlock) {
    return value.elements;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

export function translate(value: ElementLike | PlacedBlock | ElementLike[], dx: number, dy: number): void {
  for (const element of asElements(value)) {
    element.x = Number(element.x ?? 0) + dx;
    element.y = Number(element.y ?? 0) + dy;
  }
  if (value instanceof PlacedBlock) {
    value.bounds = new Bounds(value.bounds.x + dx, value.bounds.y + dy, value.bounds.width, value.bounds.height);
  }
}

export function centerIn(
  value: ElementLike | PlacedBlock | ElementLike[],
  box: Bounds | [number, number, number, number],
): PlacedBlock {
  const target = boundsFromBox(box);
  const elements = asElements(value);
  const current = boundsFor(elements);
  translate(elements, target.centerX - current.centerX, target.centerY - current.centerY);
  return replacementBlock(value, elements);
}

export function alignLeft(value: ElementLike | PlacedBlock | ElementLike[], x: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, x - boundsFor(elements).left, 0);
  return replacementBlock(value, elements);
}

export function alignRight(value: ElementLike | PlacedBlock | ElementLike[], x: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, x - boundsFor(elements).right, 0);
  return replacementBlock(value, elements);
}

export function alignCenter(value: ElementLike | PlacedBlock | ElementLike[], x: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, x - boundsFor(elements).centerX, 0);
  return replacementBlock(value, elements);
}

export function alignTop(value: ElementLike | PlacedBlock | ElementLike[], y: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, 0, y - boundsFor(elements).top);
  return replacementBlock(value, elements);
}

export function alignBottom(value: ElementLike | PlacedBlock | ElementLike[], y: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, 0, y - boundsFor(elements).bottom);
  return replacementBlock(value, elements);
}

export function alignMiddle(value: ElementLike | PlacedBlock | ElementLike[], y: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, 0, y - boundsFor(elements).centerY);
  return replacementBlock(value, elements);
}

export const bounds_for = boundsFor;
export const center_in = centerIn;
export const align_left = alignLeft;
export const align_right = alignRight;
export const align_center = alignCenter;
export const align_top = alignTop;
export const align_bottom = alignBottom;
export const align_middle = alignMiddle;
export const inflate_bounds = inflateBounds;
export const polyline_intersects_bounds = polylineIntersectsBounds;
export const segment_intersects_bounds = segmentIntersectsBounds;

function boundsFromBox(box: Bounds | [number, number, number, number]): Bounds {
  if (box instanceof Bounds) {
    return box;
  }
  const [x, y, width, height] = box;
  return new Bounds(x, y, width, height);
}

function replacementBlock(
  value: ElementLike | PlacedBlock | ElementLike[],
  elements: ElementLike[],
): PlacedBlock {
  const replacement = new PlacedBlock(elements, boundsFor(elements));
  if (
    value instanceof PlacedBlock
    && value.bindingTarget
    && elements.includes(value.bindingTarget)
  ) {
    replacement.withBindingTarget(value.bindingTarget);
  }
  return replacement;
}

function pointInsideBounds(point: PointTuple, bounds: Bounds): boolean {
  const [x, y] = point;
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function segmentsIntersect(a: PointTuple, b: PointTuple, c: PointTuple, d: PointTuple): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (abC === 0 && pointOnSegment(c, a, b)) return true;
  if (abD === 0 && pointOnSegment(d, a, b)) return true;
  if (cdA === 0 && pointOnSegment(a, c, d)) return true;
  if (cdB === 0 && pointOnSegment(b, c, d)) return true;
  return abC !== abD && cdA !== cdB;
}

function orientation(a: PointTuple, b: PointTuple, c: PointTuple): -1 | 0 | 1 {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function pointOnSegment(point: PointTuple, start: PointTuple, end: PointTuple): boolean {
  return (
    point[0] >= Math.min(start[0], end[0]) - 1e-9
    && point[0] <= Math.max(start[0], end[0]) + 1e-9
    && point[1] >= Math.min(start[1], end[1]) - 1e-9
    && point[1] <= Math.max(start[1], end[1]) + 1e-9
  );
}
