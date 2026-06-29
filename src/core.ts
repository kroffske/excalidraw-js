import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AssetRegistry } from "./assets.js";
import { Bounds, ElementLike, PlacedBlock, boundsFor } from "./geometry.js";

export const BLUE = "#0b1fb3";
export const GREEN = "#087f3f";
export const RED = "#d92027";
export const GRAY = "#475569";
export const LIGHT_GRAY = "#64748b";
export const WHITE = "transparent";
export const EXCALIFONT = 5;

export interface TextStyleOptions {
  size?: number;
  color?: string;
  family?: number;
  lineHeight?: number;
  align?: string;
  valign?: string;
}

export class TextStyle {
  readonly size: number;
  readonly color: string;
  readonly family: number;
  readonly lineHeight: number;
  readonly align: string;
  readonly valign: string;

  constructor(options: TextStyleOptions = {}) {
    this.size = options.size ?? 18;
    this.color = options.color ?? BLUE;
    this.family = options.family ?? EXCALIFONT;
    this.lineHeight = options.lineHeight ?? 1.22;
    this.align = options.align ?? "left";
    this.valign = options.valign ?? "top";
  }
}

export interface SceneOptions {
  seed?: number;
  assetRegistry?: AssetRegistry | null;
  asset_registry?: AssetRegistry | null;
  background?: string;
}

export interface BaseOptions {
  color?: string;
  strokeWidth?: number;
  stroke_width?: number;
  dashed?: boolean;
  roundness?: { type: number } | null;
}

export interface TextOptions {
  size?: number;
  color?: string;
  w?: number;
  width?: number;
  align?: string;
  valign?: string;
  family?: number;
  lineHeight?: number;
  line_height?: number;
  style?: TextStyle | null;
}

export interface AssetPlacementOptions {
  registry?: AssetRegistry | null;
}

export interface ExcalidrawSceneObject {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: ElementLike[];
  appState: Record<string, unknown>;
  files: Record<string, Record<string, unknown>>;
}

export function measureText(
  content: string,
  options: { size?: number; width?: number | null; family?: number; lineHeight?: number } = {},
): Bounds {
  const size = options.size ?? 18;
  const lineHeight = options.lineHeight ?? 1.22;
  const lines = content.split("\n");
  const fixedWidth = options.width ?? null;
  const measuredWidth = fixedWidth ?? Math.max(...lines.map((line) => line.length), 0) * size * 0.62;
  return new Bounds(0, 0, measuredWidth, lines.length * size * lineHeight);
}

export class Scene {
  readonly random: SeededRandom;
  readonly now: number;
  readonly files: Record<string, Record<string, unknown>>;
  readonly assetRegistry: AssetRegistry | null;
  readonly background: string;
  elements: ElementLike[];

  constructor(options: SceneOptions = {}) {
    this.random = new SeededRandom(options.seed ?? 7);
    this.now = Date.now();
    this.elements = [];
    this.files = {};
    this.assetRegistry = options.assetRegistry ?? options.asset_registry ?? null;
    this.background = options.background ?? "#ffffff";
  }

  base(color = BLUE, strokeWidth = 2, dashed = false): ElementLike {
    return {
      id: this.id(),
      angle: 0,
      strokeColor: color,
      backgroundColor: WHITE,
      fillStyle: "solid",
      strokeWidth,
      strokeStyle: dashed ? "dashed" : "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: this.seed(),
      version: 1,
      versionNonce: this.seed(),
      isDeleted: false,
      boundElements: [],
      updated: this.now,
      link: null,
      locked: false,
    };
  }

  add<T extends ElementLike>(element: T): T {
    this.elements.push(element);
    return element;
  }

  rect(x: number, y: number, w: number, h: number, options: BaseOptions = {}): ElementLike {
    const element = this.base(options.color ?? BLUE, options.strokeWidth ?? options.stroke_width ?? 2, options.dashed ?? false);
    Object.assign(element, { type: "rectangle", x, y, width: w, height: h });
    return this.add(element);
  }

  ellipse(x: number, y: number, w: number, h: number, options: BaseOptions = {}): ElementLike {
    const element = this.base(options.color ?? BLUE, options.strokeWidth ?? options.stroke_width ?? 2, false);
    Object.assign(element, { type: "ellipse", x, y, width: w, height: h });
    return this.add(element);
  }

  text(x: number, y: number, content: string, options: TextOptions = {}): ElementLike {
    let size = options.size ?? 18;
    let color = options.color ?? BLUE;
    let family = options.family ?? EXCALIFONT;
    let lineHeight = options.lineHeight ?? options.line_height ?? 1.22;
    let align = options.align ?? "left";
    let valign = options.valign ?? "top";

    if (options.style) {
      size = options.style.size;
      color = options.style.color;
      family = options.style.family;
      lineHeight = options.style.lineHeight;
      align = options.style.align;
      valign = options.style.valign;
    }

    const measured = measureText(content, { size, width: options.width ?? options.w ?? null, family, lineHeight });
    const element = this.base(color, 1);
    Object.assign(element, {
      type: "text",
      x,
      y,
      width: measured.width,
      height: measured.height,
      strokeColor: color,
      fontSize: size,
      fontFamily: family,
      text: content,
      textAlign: align,
      verticalAlign: valign,
      baseline: Math.trunc(size * 0.9),
      containerId: null,
      originalText: content,
      lineHeight,
      roundness: null,
    });
    return this.add(element);
  }

  line(points: Array<[number, number]>, options: BaseOptions = {}): ElementLike {
    const [minX, minY, maxX, maxY] = pointBounds(points);
    const element = this.base(options.color ?? BLUE, options.strokeWidth ?? options.stroke_width ?? 2, options.dashed ?? false);
    Object.assign(element, {
      type: "line",
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      points: points.map(([x, y]) => [x - minX, y - minY]),
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      roundness: options.roundness !== undefined ? options.roundness : points.length > 2 ? null : { type: 2 },
    });
    return this.add(element);
  }

  arrow(points: Array<[number, number]>, options: BaseOptions = {}): ElementLike {
    const [minX, minY, maxX, maxY] = pointBounds(points);
    const element = this.base(options.color ?? BLUE, options.strokeWidth ?? options.stroke_width ?? 2, options.dashed ?? false);
    Object.assign(element, {
      type: "arrow",
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      points: points.map(([x, y]) => [x - minX, y - minY]),
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
      roundness: options.roundness !== undefined ? options.roundness : points.length > 2 ? null : { type: 2 },
    });
    return this.add(element);
  }

  divider(x: number, y1: number, y2: number): ElementLike {
    return this.line([[x, y1], [x, y2]], { strokeWidth: 1, dashed: true });
  }

  bullets(x: number, y: number, items: string[], options: { size?: number; gap?: number; color?: string } = {}): PlacedBlock {
    const size = options.size ?? 14;
    const gap = options.gap ?? 24;
    const color = options.color ?? BLUE;
    const elements = items.map((item, index) => this.text(x, y + index * gap, `- ${item}`, { size, color }));
    return new PlacedBlock(elements, boundsFor(elements));
  }

  smallNumber(x: number, y: number, n: number): PlacedBlock {
    const elements = [this.ellipse(x, y, 20, 20, { strokeWidth: 1 }), this.text(x + 6, y + 1, String(n), { size: 14, w: 10 })];
    return new PlacedBlock(elements, boundsFor(elements));
  }

  embedSvgData(data: Buffer | Uint8Array, x: number, y: number, w: number, h: number): ElementLike {
    const bytes = Buffer.from(data);
    const fileId = `svg_${createHash("sha1").update(bytes).digest("hex").slice(0, 24)}`;
    this.files[fileId] = {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL: `data:image/svg+xml;base64,${bytes.toString("base64")}`,
      created: this.now,
      lastRetrieved: this.now,
    };
    const element = this.base(BLUE, 1);
    Object.assign(element, {
      type: "image",
      x,
      y,
      width: w,
      height: h,
      fileId,
      scale: [1, 1],
      status: "saved",
      strokeColor: "transparent",
      backgroundColor: "transparent",
      roundness: null,
    });
    return this.add(element);
  }

  embedSvg(path: string, x: number, y: number, w: number, h: number): ElementLike {
    return this.embedSvgData(readFileSync(path), x, y, w, h);
  }

  svgImage(path: string, x: number, y: number, w: number, h: number): ElementLike {
    return this.embedSvg(path, x, y, w, h);
  }

  embed_svg(path: string, x: number, y: number, w: number, h: number): ElementLike {
    return this.embedSvg(path, x, y, w, h);
  }

  placeAsset(iconId: string, x: number, y: number, size = 64, options: AssetPlacementOptions = {}): ElementLike {
    const registry = this.resolveRegistry(options.registry ?? null);
    const asset = registry.resolve(iconId);
    return this.embedSvgData(asset.data, x, y, size, size);
  }

  placeAssetRect(iconId: string, x: number, y: number, w: number, h: number, options: AssetPlacementOptions = {}): ElementLike {
    const registry = this.resolveRegistry(options.registry ?? null);
    const asset = registry.resolve(iconId);
    return this.embedSvgData(asset.data, x, y, w, h);
  }

  place_asset(iconId: string, x: number, y: number, size = 64, options: AssetPlacementOptions = {}): ElementLike {
    return this.placeAsset(iconId, x, y, size, options);
  }

  place_asset_rect(iconId: string, x: number, y: number, w: number, h: number, options: AssetPlacementOptions = {}): ElementLike {
    return this.placeAssetRect(iconId, x, y, w, h, options);
  }

  bounds(elements: ElementLike[] | null = null): Bounds {
    return boundsFor(elements ?? this.elements);
  }

  group(elements: ElementLike[]): PlacedBlock {
    const groupId = this.id();
    for (const element of elements) {
      const groupIds = Array.isArray(element.groupIds) ? element.groupIds : [];
      groupIds.push(groupId);
      element.groupIds = groupIds;
    }
    return new PlacedBlock(elements, boundsFor(elements));
  }

  toObject(): ExcalidrawSceneObject {
    return {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: this.elements,
      appState: {
        gridSize: null,
        viewBackgroundColor: this.background,
        currentItemFontFamily: EXCALIFONT,
      },
      files: this.files,
    };
  }

  toDict(): ExcalidrawSceneObject {
    return this.toObject();
  }

  to_dict(): ExcalidrawSceneObject {
    return this.toObject();
  }

  toJson(options: { indent?: number } = {}): string {
    return JSON.stringify(this.toObject(), null, options.indent ?? 2);
  }

  to_json(options: { indent?: number } = {}): string {
    return this.toJson(options);
  }

  write(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, this.toJson({ indent: 2 }), "utf8");
  }

  private resolveRegistry(registry: AssetRegistry | null): AssetRegistry {
    if (registry) {
      return registry;
    }
    if (this.assetRegistry) {
      return this.assetRegistry;
    }
    return AssetRegistry.bundled();
  }

  private id(): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 20 }, () => chars[this.random.int(0, chars.length - 1)]).join("");
  }

  private seed(): number {
    return this.random.int(1, 2_000_000_000);
  }
}

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

function pointBounds(points: Array<[number, number]>): [number, number, number, number] {
  if (points.length === 0) {
    throw new Error("At least one point is required.");
  }
  return [
    Math.min(...points.map(([x]) => x)),
    Math.min(...points.map(([, y]) => y)),
    Math.max(...points.map(([x]) => x)),
    Math.max(...points.map(([, y]) => y)),
  ];
}
