export type ElementLike = Record<string, unknown>;

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
  constructor(
    public elements: ElementLike[],
    public bounds: Bounds,
  ) {}

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
  return new PlacedBlock(elements, boundsFor(elements));
}

export function alignLeft(value: ElementLike | PlacedBlock | ElementLike[], x: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, x - boundsFor(elements).left, 0);
  return new PlacedBlock(elements, boundsFor(elements));
}

export function alignRight(value: ElementLike | PlacedBlock | ElementLike[], x: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, x - boundsFor(elements).right, 0);
  return new PlacedBlock(elements, boundsFor(elements));
}

export function alignCenter(value: ElementLike | PlacedBlock | ElementLike[], x: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, x - boundsFor(elements).centerX, 0);
  return new PlacedBlock(elements, boundsFor(elements));
}

export function alignTop(value: ElementLike | PlacedBlock | ElementLike[], y: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, 0, y - boundsFor(elements).top);
  return new PlacedBlock(elements, boundsFor(elements));
}

export function alignBottom(value: ElementLike | PlacedBlock | ElementLike[], y: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, 0, y - boundsFor(elements).bottom);
  return new PlacedBlock(elements, boundsFor(elements));
}

export function alignMiddle(value: ElementLike | PlacedBlock | ElementLike[], y: number): PlacedBlock {
  const elements = asElements(value);
  translate(elements, 0, y - boundsFor(elements).centerY);
  return new PlacedBlock(elements, boundsFor(elements));
}

export const bounds_for = boundsFor;
export const center_in = centerIn;
export const align_left = alignLeft;
export const align_right = alignRight;
export const align_center = alignCenter;
export const align_top = alignTop;
export const align_bottom = alignBottom;
export const align_middle = alignMiddle;

function boundsFromBox(box: Bounds | [number, number, number, number]): Bounds {
  if (box instanceof Bounds) {
    return box;
  }
  const [x, y, width, height] = box;
  return new Bounds(x, y, width, height);
}
