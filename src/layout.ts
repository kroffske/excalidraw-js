import * as assets from "./assets.js";
import { BLUE, GRAY, Scene, measureText } from "./core.js";
import {
  Bounds,
  ElementLike,
  LONG_EDGE_COLOR,
  LONG_EDGE_LENGTH,
  PlacedBlock,
  PointTuple,
  alignBottom,
  alignCenter,
  alignLeft,
  alignMiddle,
  alignRight,
  alignTop,
  boundsFor,
  centerIn,
  elementBounds,
  inflateBounds,
  pointAlongPolyline,
  polylineIntersectsBounds,
  polylineLength,
  translate,
} from "./geometry.js";

export {
  Bounds,
  PlacedBlock,
  alignBottom,
  alignCenter,
  alignLeft,
  alignMiddle,
  alignRight,
  alignTop,
  centerIn,
};

export const align_bottom = alignBottom;
export const align_center = alignCenter;
export const align_left = alignLeft;
export const align_middle = alignMiddle;
export const align_right = alignRight;
export const align_top = alignTop;
export const center_in = centerIn;

export interface IconWithLabelOptions {
  iconSize?: number;
  icon_size?: number;
  label: string;
  labelPosition?: "below" | "right" | "left";
  label_position?: "below" | "right" | "left";
  labelSize?: number;
  label_size?: number;
  labelWidth?: number | null;
  label_width?: number | null;
  gap?: number;
  color?: string;
}

export function iconWithLabel(scene: Scene, iconId: string, x: number, y: number, options: IconWithLabelOptions): PlacedBlock {
  const iconSize = options.iconSize ?? options.icon_size ?? 64;
  const labelPosition = options.labelPosition ?? options.label_position ?? "below";
  const labelSize = options.labelSize ?? options.label_size ?? 14;
  const labelWidth = options.labelWidth ?? options.label_width ?? null;
  const gap = options.gap ?? 8;
  const color = options.color ?? BLUE;
  const elements: ElementLike[] = [assets.place(scene, iconId, x, y, iconSize)];

  if (options.label) {
    const width = labelWidth ?? Math.max(iconSize * 1.8, 96);
    if (labelPosition === "below") {
      elements.push(scene.text(x + (iconSize - width) / 2, y + iconSize + gap, options.label, {
        size: labelSize,
        color,
        w: width,
        align: "center",
      }));
    } else if (labelPosition === "right") {
      elements.push(scene.text(x + iconSize + gap, y + iconSize * 0.12, options.label, { size: labelSize, color, w: width }));
    } else if (labelPosition === "left") {
      elements.push(scene.text(x - width - gap, y + iconSize * 0.12, options.label, {
        size: labelSize,
        color,
        w: width,
        align: "right",
      }));
    } else {
      throw new Error(`Unsupported labelPosition: ${labelPosition}`);
    }
  }

  return new PlacedBlock(elements, boundsFor(elements));
}

export const icon_with_label = iconWithLabel;

export interface IconTextRowOptions {
  iconSize?: number;
  icon_size?: number;
  textSize?: number;
  text_size?: number;
  textWidth?: number;
  text_width?: number;
  gap?: number;
  color?: string;
}

export function iconTextRow(scene: Scene, iconId: string, x: number, y: number, text: string, options: IconTextRowOptions = {}): PlacedBlock {
  const iconSize = options.iconSize ?? options.icon_size ?? 32;
  const textSize = options.textSize ?? options.text_size ?? 14;
  const textWidth = options.textWidth ?? options.text_width ?? 150;
  const gap = options.gap ?? 14;
  const color = options.color ?? BLUE;
  const icon = assets.place(scene, iconId, x, y, iconSize);
  const textHeight = text.split("\n").length * textSize * 1.22;
  const textY = y + Math.max(0, (iconSize - textHeight) / 2);
  const label = scene.text(x + iconSize + gap, textY, text, { size: textSize, color, w: textWidth });
  const elements = [icon, label];
  return new PlacedBlock(elements, boundsFor(elements));
}

export const icon_text_row = iconTextRow;

export interface IconTextListOptions extends IconTextRowOptions {
  rowGap?: number;
  row_gap?: number;
}

export function iconTextList(scene: Scene, rows: Array<[string, string]>, x: number, y: number, options: IconTextListOptions = {}): PlacedBlock {
  const rowGap = options.rowGap ?? options.row_gap ?? 42;
  const elements: ElementLike[] = [];
  rows.forEach(([iconId, label], index) => {
    const block = iconTextRow(scene, iconId, x, y + index * rowGap, label, options);
    elements.push(...block.elements);
  });
  return new PlacedBlock(elements, boundsFor(elements));
}

export const icon_text_list = iconTextList;

export interface BulletListOptions {
  textSize?: number;
  text_size?: number;
  lineGap?: number;
  line_gap?: number;
  width?: number;
  bullet?: string;
  color?: string;
}

export function bulletList(scene: Scene, x: number, y: number, items: string[], options: BulletListOptions = {}): PlacedBlock {
  const textSize = options.textSize ?? options.text_size ?? 13;
  const lineGap = options.lineGap ?? options.line_gap ?? 22;
  const width = options.width ?? 220;
  const bullet = options.bullet ?? "-";
  const color = options.color ?? BLUE;
  const elements: ElementLike[] = [];
  let currentY = y;
  for (const item of items) {
    const text = scene.text(x, currentY, `${bullet} ${item}`, { size: textSize, color, w: width });
    elements.push(text);
    currentY += Math.max(lineGap, boundsFor([text]).height + 4);
  }
  return new PlacedBlock(elements, boundsFor(elements));
}

export const bullet_list = bulletList;

export interface PanelOptions {
  title?: string | null;
  titleSize?: number;
  title_size?: number;
  color?: string;
}

export function panel(scene: Scene, x: number, y: number, w: number, h: number, options: PanelOptions = {}): PlacedBlock {
  const color = options.color ?? BLUE;
  const elements = [scene.rect(x, y, w, h, { strokeWidth: 1, color })];
  if (options.title) {
    elements.push(scene.text(x + 18, y + 14, options.title, { size: options.titleSize ?? options.title_size ?? 17, w: w - 36, color }));
  }
  return new PlacedBlock(elements, boundsFor(elements));
}

export type FitPanelContent = Bounds | PlacedBlock | ElementLike | ElementLike[];
export type SectionChild = PlacedBlock | ElementLike | ElementLike[];

export interface FitPanelOptions extends PanelOptions {
  x?: number;
  y?: number;
  padding?: number;
  titleHeight?: number;
  title_height?: number;
  headerGap?: number;
  header_gap?: number;
  minWidth?: number;
  min_width?: number;
  minHeight?: number;
  min_height?: number;
  group?: boolean;
}

export interface SectionOptions extends FitPanelOptions {
  x: number;
  y: number;
  children: SectionChild[];
}

export function fitPanel(scene: Scene, content: FitPanelContent, options: FitPanelOptions = {}): PlacedBlock {
  const childElements = elementsForContent(content);
  let childBounds = boundsForContent(content);
  const padding = options.padding ?? 24;
  const minWidth = options.minWidth ?? options.min_width ?? 0;
  const minHeight = options.minHeight ?? options.min_height ?? 0;
  const baseWidth = Math.max(minWidth, childBounds.width + padding * 2);
  const headerGap = options.title ? options.headerGap ?? options.header_gap ?? 8 : 0;
  const titleHeight = options.title ? resolvedTitleHeight(options, baseWidth) : 0;
  const headerBand = titleHeight + headerGap;
  const panelX = options.x ?? childBounds.left - padding;
  const panelY = options.y ?? childBounds.top - padding - headerBand;

  if (childElements.length > 0) {
    const dx = Math.max(0, panelX + padding - childBounds.left);
    const dy = Math.max(0, panelY + padding + headerBand - childBounds.top);
    if (dx !== 0 || dy !== 0) {
      translateContent(content, dx, dy);
      childBounds = boundsForContent(content);
    }
  }

  const contentRight = Math.max(childBounds.right, panelX + padding);
  const contentBottom = Math.max(childBounds.bottom, panelY + padding + headerBand);
  const width = Math.max(minWidth, contentRight - panelX + padding);
  const height = Math.max(minHeight, contentBottom - panelY + padding);
  const frame = panel(scene, panelX, panelY, width, height, options);
  moveElementsBefore(scene, frame.elements, childElements);

  const elements = [...frame.elements, ...childElements];
  if (options.group !== false && elements.length > 0) {
    scene.group(elements);
  }
  return new PlacedBlock(elements, boundsFor(elements));
}

export const fit_panel = fitPanel;

export function section(scene: Scene, options: SectionOptions): PlacedBlock {
  const content = sectionContent(options.children, new Bounds(options.x, options.y, 0, 0));
  const block = fitPanel(scene, content, options);
  refreshPlacedContentBounds(options.children);
  return block;
}

export const container = section;

class SectionChildBlock extends PlacedBlock {
  constructor(private readonly contents: SectionChild[]) {
    const elements = contents.flatMap(elementsForContent);
    super(elements, boundsFor(elements));
  }

  translated(dx: number, dy: number): this {
    for (const content of this.contents) {
      translateContent(content, dx, dy);
    }
    this.elements = this.contents.flatMap(elementsForContent);
    this.bounds = boundsFor(this.elements);
    return this;
  }
}

function sectionContent(children: SectionChild[], fallback: Bounds): FitPanelContent {
  if (children.length === 0) {
    return fallback;
  }
  if (children.length === 1) {
    return children[0];
  }
  return new SectionChildBlock(children);
}

function elementsForContent(content: FitPanelContent): ElementLike[] {
  if (content instanceof Bounds) {
    return [];
  }
  if (content instanceof PlacedBlock) {
    return content.elements;
  }
  if (Array.isArray(content)) {
    return content;
  }
  return [content];
}

function boundsForContent(content: FitPanelContent): Bounds {
  if (content instanceof Bounds) {
    return content;
  }
  return boundsFor(elementsForContent(content));
}

function resolvedTitleHeight(options: FitPanelOptions, width: number): number {
  if (!options.title) {
    return 0;
  }
  const requested = options.titleHeight ?? options.title_height ?? 42;
  const titleSize = options.titleSize ?? options.title_size ?? 17;
  const measured = measureText(options.title, { size: titleSize, width: Math.max(1, width - 36) }).height + 24;
  return Math.max(requested, measured);
}

function translateContent(content: FitPanelContent, dx: number, dy: number): void {
  if (content instanceof Bounds) {
    return;
  }
  if (content instanceof PlacedBlock) {
    content.translated(dx, dy);
    return;
  }
  translate(elementsForContent(content), dx, dy);
}

function refreshPlacedContentBounds(contents: SectionChild[]): void {
  for (const content of contents) {
    if (content instanceof PlacedBlock) {
      content.bounds = boundsFor(content.elements);
    }
  }
}

function moveElementsBefore(scene: Scene, moving: ElementLike[], before: ElementLike[]): void {
  if (moving.length === 0 || before.length === 0) {
    return;
  }
  const movingSet = new Set(moving);
  const beforeSet = new Set(before);
  const remaining = scene.elements.filter((element) => !movingSet.has(element));
  const insertAt = remaining.findIndex((element) => beforeSet.has(element));
  if (insertAt < 0) {
    return;
  }
  scene.elements = [
    ...remaining.slice(0, insertAt),
    ...moving,
    ...remaining.slice(insertAt),
  ];
}

export interface CardOptions {
  iconId?: string;
  icon_id?: string;
  title: string;
  description?: string;
  iconSize?: number;
  icon_size?: number;
  titleSize?: number;
  title_size?: number;
  descSize?: number;
  desc_size?: number;
}

export function card(scene: Scene, x: number, y: number, w: number, h: number, options: CardOptions): PlacedBlock {
  const iconId = options.iconId ?? options.icon_id;
  if (!iconId) {
    throw new Error("card requires iconId");
  }
  const iconSize = options.iconSize ?? options.icon_size ?? 64;
  const titleSize = options.titleSize ?? options.title_size ?? 17;
  const descSize = options.descSize ?? options.desc_size ?? 12;
  const elements = [scene.rect(x, y, w, h, { strokeWidth: 1 })];
  elements.push(assets.place(scene, iconId, x + (w - iconSize) / 2, y + 16, iconSize));
  elements.push(scene.text(x + 12, y + 16 + iconSize + 10, options.title, { size: titleSize, w: w - 24, align: "center" }));
  if (options.description) {
    elements.push(scene.text(x + 14, y + h - 50, options.description, { size: descSize, color: GRAY, w: w - 28, align: "center" }));
  }
  return new PlacedBlock(elements, boundsFor(elements));
}

export const agentCard = card;
export const agent_card = card;

export interface IconPanelOptions {
  title: string;
  iconId?: string;
  icon_id?: string;
  bullets: string[];
  iconSize?: number;
  icon_size?: number;
  titleSize?: number;
  title_size?: number;
  bulletSize?: number;
  bullet_size?: number;
  bulletGap?: number;
  bullet_gap?: number;
}

export interface NodeOptions extends Omit<IconPanelOptions, "bullets"> {
  bullets?: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  minWidth?: number;
  min_width?: number;
  maxWidth?: number;
  max_width?: number;
  minHeight?: number;
  min_height?: number;
}

export function node(scene: Scene, options: NodeOptions): PlacedBlock {
  const width = options.width ?? autoNodeWidth(options);
  const height = options.height ?? options.minHeight ?? options.min_height ?? autoNodeMinHeight(options);
  return iconPanel(scene, options.x ?? 0, options.y ?? 0, width, height, {
    title: options.title,
    iconId: options.iconId ?? options.icon_id,
    bullets: options.bullets ?? [],
    iconSize: options.iconSize ?? options.icon_size,
    titleSize: options.titleSize ?? options.title_size,
    bulletSize: options.bulletSize ?? options.bullet_size,
    bulletGap: options.bulletGap ?? options.bullet_gap,
  });
}

export const component = node;

export function iconPanel(scene: Scene, x: number, y: number, w: number, h: number, options: IconPanelOptions): PlacedBlock {
  const iconId = options.iconId ?? options.icon_id;
  if (!iconId) {
    throw new Error("iconPanel requires iconId");
  }
  const titleSize = options.titleSize ?? options.title_size ?? 17;
  const bulletSize = options.bulletSize ?? options.bullet_size ?? 13;
  const bulletGap = options.bulletGap ?? options.bullet_gap ?? 22;
  const iconSize = options.iconSize ?? options.icon_size ?? 58;
  const titleTop = 14;
  if (options.bullets.length === 0) {
    const titleHeight = measureText(options.title, { size: titleSize, width: w - 36 }).height;
    const iconTop = titleTop + titleHeight + 14;
    const bottomPadding = 18;
    const finalHeight = Math.max(h, iconTop + iconSize + bottomPadding);
    const elements: ElementLike[] = [
      scene.rect(x, y, w, finalHeight, { strokeWidth: 1 }),
      scene.text(x + 18, y + titleTop, options.title, { size: titleSize, w: w - 36, align: "center" }),
      assets.place(scene, iconId, x + (w - iconSize) / 2, y + iconTop, iconSize),
    ];
    return new PlacedBlock(elements, boundsFor(elements));
  }

  const iconTop = 50;
  const bulletTop = Math.max(54, titleTop + measureText(options.title, { size: titleSize, width: w - 36 }).height + 18);
  const bottomPadding = 20;
  const bulletWidth = w - 125;
  const minHeight = Math.max(
    iconTop + iconSize + bottomPadding,
    bulletTop + estimateBulletListHeight(options.bullets, bulletWidth, bulletSize, bulletGap) + bottomPadding,
  );
  const finalHeight = Math.max(h, minHeight);
  const elements = panel(scene, x, y, w, finalHeight, { title: options.title, titleSize }).elements;
  elements.push(assets.place(scene, iconId, x + 28, y + iconTop, iconSize));
  elements.push(...bulletList(scene, x + 105, y + bulletTop, options.bullets, {
    textSize: bulletSize,
    lineGap: bulletGap,
    width: bulletWidth,
  }).elements);
  return new PlacedBlock(elements, boundsFor(elements));
}

export const icon_panel = iconPanel;

function autoNodeWidth(options: NodeOptions): number {
  const minWidth = options.minWidth ?? options.min_width ?? 250;
  const maxWidth = options.maxWidth ?? options.max_width ?? 380;
  const titleSize = options.titleSize ?? options.title_size ?? 17;
  const bulletSize = options.bulletSize ?? options.bullet_size ?? 13;
  const titleWidth = measureText(options.title, { size: titleSize }).width + 52;
  const bulletWidth = Math.max(
    0,
    ...(options.bullets ?? []).map((bullet) => measureText(`- ${bullet}`, { size: bulletSize }).width + 138),
  );
  return Math.min(maxWidth, Math.max(minWidth, titleWidth, bulletWidth));
}

function autoNodeMinHeight(options: NodeOptions): number {
  return (options.bullets ?? []).length > 0 ? 112 : 92;
}

function estimateBulletListHeight(items: string[], width: number, textSize: number, lineGap: number, bullet = "-"): number {
  let currentY = 0;
  let bottom = 0;
  for (const item of items) {
    const height = measureText(`${bullet} ${item}`, { size: textSize, width }).height;
    bottom = currentY + height;
    currentY += Math.max(lineGap, height + 4);
  }
  return bottom;
}

export type BlockMap = Record<string, PlacedBlock>;
export type GroupOrder<T extends BlockMap> = Array<Extract<keyof T, string>>;

export interface GroupOptions<T extends BlockMap> {
  order?: GroupOrder<T>;
}

export interface ArrangeOptions<T extends BlockMap> extends GroupOptions<T> {
  x?: number;
  y?: number;
  gap?: number | null;
  align?: "start" | "center" | "end";
}

export class GroupBlock<T extends BlockMap = BlockMap> extends PlacedBlock {
  constructor(
    public readonly blocks: T,
    public readonly order: GroupOrder<T> = Object.keys(blocks) as GroupOrder<T>,
  ) {
    super(order.flatMap((key) => blocks[key].elements), boundsFor(order.flatMap((key) => blocks[key].elements)));
  }

  get<K extends Extract<keyof T, string>>(id: K): T[K] {
    return this.blocks[id];
  }

  translated(dx: number, dy: number): this {
    for (const key of this.order) {
      this.blocks[key].translated(dx, dy);
    }
    this.elements = this.order.flatMap((key) => this.blocks[key].elements);
    this.bounds = boundsFor(this.elements);
    return this;
  }
}

export type PlacedGroup<T extends BlockMap = BlockMap> = GroupBlock<T> & T;

export function group<T extends BlockMap>(blocks: T, options: GroupOptions<T> = {}): PlacedGroup<T> {
  return namedGroup(blocks, options.order);
}

export function row<T extends BlockMap>(blocks: T, options: ArrangeOptions<T> = {}): PlacedGroup<T> {
  const order = options.order ?? Object.keys(blocks) as GroupOrder<T>;
  const gap = options.gap ?? 0;
  const top = options.y ?? 0;
  const rowHeight = Math.max(0, ...order.map((key) => blocks[key].bounds.height));
  let currentX = options.x ?? 0;
  for (const key of order) {
    const block = blocks[key];
    const y = alignedStart(top, rowHeight, block.bounds.height, options.align ?? "start");
    block.translated(currentX - block.bounds.left, y - block.bounds.top);
    currentX += block.bounds.width + gap;
  }
  return namedGroup(blocks, order);
}

export function column<T extends BlockMap>(blocks: T, options: ArrangeOptions<T> = {}): PlacedGroup<T> {
  const order = options.order ?? Object.keys(blocks) as GroupOrder<T>;
  const gap = options.gap ?? 0;
  const left = options.x ?? 0;
  const columnWidth = Math.max(0, ...order.map((key) => blocks[key].bounds.width));
  let currentY = options.y ?? 0;
  for (const key of order) {
    const block = blocks[key];
    const x = alignedStart(left, columnWidth, block.bounds.width, options.align ?? "start");
    block.translated(x - block.bounds.left, currentY - block.bounds.top);
    currentY += block.bounds.height + gap;
  }
  return namedGroup(blocks, order);
}

export const hstack = row;
export const vstack = column;

function namedGroup<T extends BlockMap>(blocks: T, order?: GroupOrder<T>): PlacedGroup<T> {
  const groupBlock = new GroupBlock(blocks, order) as PlacedGroup<T>;
  Object.assign(groupBlock, blocks);
  return groupBlock;
}

function alignedStart(origin: number, container: number, item: number, align: ArrangeOptions<BlockMap>["align"]): number {
  if (align === "center") {
    return origin + (container - item) / 2;
  }
  if (align === "end") {
    return origin + container - item;
  }
  return origin;
}

export function distributeHorizontal(blocks: PlacedBlock[], x: number, y: number, options: { gap?: number | null } = {}): PlacedBlock[] {
  let currentX = x;
  const placed: PlacedBlock[] = [];
  for (const block of blocks) {
    block.translated(currentX - block.bounds.left, y - block.bounds.top);
    placed.push(block);
    currentX += block.bounds.width + (options.gap ?? 0);
  }
  return placed;
}

export const distribute_horizontal = distributeHorizontal;

export function distributeVertical(blocks: PlacedBlock[], x: number, y: number, options: { gap?: number | null } = {}): PlacedBlock[] {
  let currentY = y;
  const placed: PlacedBlock[] = [];
  for (const block of blocks) {
    block.translated(x - block.bounds.left, currentY - block.bounds.top);
    placed.push(block);
    currentY += block.bounds.height + (options.gap ?? 0);
  }
  return placed;
}

export const distribute_vertical = distributeVertical;

export type ConnectionSide = "left" | "right" | "top" | "bottom";
export type EdgeKind = "primary" | "secondary" | "feedback" | "annotation" | "provenance";
export type ConnectionDirection =
  | "left-to-right"
  | "right-to-left"
  | "top-down"
  | "bottom-up"
  | "lr"
  | "rl"
  | "td"
  | "bt";
export type ConnectionPath = "straight" | "orthogonal" | "outer" | "auto";
export type ConnectionEndpoint = ConnectionSide | ConnectionPort;
export type ConnectionObstacle = Bounds | PlacedBlock | ElementLike | ElementLike[];

export interface ConnectionPort {
  side: ConnectionSide;
  slot?: number;
}

export type Port = ConnectionPort;

export interface ConnectOptions {
  color?: string;
  strokeWidth?: number;
  stroke_width?: number;
  dashed?: boolean;
  kind?: EdgeKind;
  direction?: ConnectionDirection;
  from?: ConnectionEndpoint;
  to?: ConnectionEndpoint;
  path?: ConnectionPath;
  label?: string;
  labelWidth?: number;
  label_width?: number;
  labelSize?: number;
  label_size?: number;
  labelColor?: string;
  label_color?: string;
  labelOffset?: { dx?: number; dy?: number };
  label_offset?: { dx?: number; dy?: number };
  avoidRoutes?: PointTuple[][];
  avoid_routes?: PointTuple[][];
  avoidLabels?: ConnectionObstacle[];
  avoid_labels?: ConnectionObstacle[];
  obstacles?: ConnectionObstacle[];
  routeBounds?: Bounds;
  route_bounds?: Bounds;
  outerSide?: ConnectionSide;
  outer_side?: ConnectionSide;
  outerGap?: number;
  outer_gap?: number;
  cornerRadius?: number;
  corner_radius?: number;
  labelGap?: number;
  label_gap?: number;
  clearance?: number;
  /**
   * Place the label on its own connection line (snug above the longest segment's
   * midpoint) without the obstacle-avoiding candidate search, so it never flies
   * high above the cards. Intended for callers that run resolveLabelCollisions
   * afterwards to slide labels off card text / each other. Default false.
   */
  labelOnLine?: boolean;
}

export interface RoutedConnection {
  arrow: ElementLike;
  label?: ElementLike;
  points: PointTuple[];
}

/** Stroke for a default (non-overridden) connector: long lines recede to a muted
 *  steel-blue so a single long edge does not dominate the canvas. */
function edgeStrokeColor(points: PointTuple[]): string {
  return polylineLength(points) >= LONG_EDGE_LENGTH ? LONG_EDGE_COLOR : BLUE;
}

export function connect(scene: Scene, source: PlacedBlock, target: PlacedBlock, options: ConnectOptions = {}): ElementLike {
  const resolvedOptions = defaultConnectOptions(source, target, options);
  const ports = connectionPorts(resolvedOptions);
  const points = routedConnectionPoints(source.bounds, target.bounds, ports.from, ports.to, resolvedOptions, 0);
  const arrow = scene.arrow(points, {
    color: resolvedOptions.color ?? edgeStrokeColor(points),
    strokeWidth: resolvedOptions.strokeWidth ?? resolvedOptions.stroke_width ?? 2,
    dashed: resolvedOptions.dashed ?? resolvedOptions.kind === "feedback",
  });
  if (resolvedOptions.label) {
    connectionLabel(scene, resolvedOptions.label, source.bounds, target.bounds, points, resolvedOptions);
  }
  return arrow;
}

export function connectRouted(scene: Scene, source: PlacedBlock, target: PlacedBlock, options: ConnectOptions = {}): RoutedConnection {
  const resolvedOptions = defaultConnectOptions(source, target, options);
  const ports = connectionPorts(resolvedOptions);
  const points = routedConnectionPoints(source.bounds, target.bounds, ports.from, ports.to, resolvedOptions, DEFAULT_ROUTED_CORNER_RADIUS);
  const arrow = scene.arrow(points, {
    color: resolvedOptions.color ?? edgeStrokeColor(points),
    strokeWidth: resolvedOptions.strokeWidth ?? resolvedOptions.stroke_width ?? 2,
    dashed: resolvedOptions.dashed ?? resolvedOptions.kind === "feedback",
  });
  const label = resolvedOptions.label
    ? connectionLabel(scene, resolvedOptions.label, source.bounds, target.bounds, points, resolvedOptions)
    : undefined;
  return { arrow, label, points };
}

export const connect_routed = connectRouted;

export function connectSmart(scene: Scene, source: PlacedBlock, target: PlacedBlock, options: ConnectOptions = {}): ElementLike {
  return connect(scene, source, target, options);
}

export const connect_smart = connectSmart;

function defaultConnectOptions(source: PlacedBlock, target: PlacedBlock, options: ConnectOptions): ConnectOptions {
  return {
    ...options,
    direction: options.direction ?? inferDirection(source.bounds, target.bounds),
    path: options.path ?? (connectionObstacleBounds(options).length > 0 ? "auto" : "orthogonal"),
  };
}

export interface TreeNodeSpec {
  id: string;
  title: string;
  iconId?: string;
  icon_id?: string;
  bullets?: string[];
  children?: TreeNodeSpec[];
}

export interface TreeLayoutSpec {
  root: TreeNodeSpec;
  secondaryEdges?: SecondaryEdgeSpec[];
  secondary_edges?: SecondaryEdgeSpec[];
  sidecars?: SidecarSpec[];
}

export interface TreeLayoutOptions {
  x?: number;
  y?: number;
  nodeWidth?: number;
  node_width?: number;
  nodeHeight?: number;
  node_height?: number;
  levelGap?: number;
  level_gap?: number;
  siblingGap?: number;
  sibling_gap?: number;
  rowGap?: number;
  row_gap?: number;
  leafGap?: number;
  leaf_gap?: number;
  columns?: number;
  wrapColumns?: number;
  wrap_columns?: number;
  reservedTopBand?: number;
  reserved_top_band?: number;
}

export type TreeLayoutFamily = "tree" | "wide-tree" | "process-flow" | "horizontal-tree";
export type TreeLayoutRequest = TreeLayoutFamily | "left-right-tree" | "auto";

export interface TreeLayoutPlan {
  family: TreeLayoutFamily;
  reason: string;
  options: TreeLayoutOptions;
  stats: TreeLayoutStats;
}

export interface TreeLayoutStats {
  nodeCount: number;
  maxDepth: number;
  maxBreadth: number;
  maxBullets: number;
  linear: boolean;
  secondaryEdgeCount: number;
  sidecarCount: number;
}

export interface TreePrimaryEdge {
  from: string;
  to: string;
  arrow: ElementLike;
}

export type SecondaryEdgeLane = "leftOuter" | "rightOuter" | "auto";

export interface SecondaryEdgeSpec {
  from: string;
  to: string;
  kind?: EdgeKind;
  label?: string;
  lane?: SecondaryEdgeLane;
  forceArrow?: boolean;
}

export interface RoutedEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  arrow: ElementLike;
  label?: ElementLike;
  lane: Exclude<SecondaryEdgeLane, "auto">;
}

export interface RouteEdgesOptions {
  gutter?: number;
  gutter_step?: number;
  gutterStep?: number;
  color?: string;
  strokeWidth?: number;
  stroke_width?: number;
  reservedTopBand?: number;
  reserved_top_band?: number;
}

export type SidecarSide = "left" | "right" | "top" | "bottom" | "auto";

export interface SidecarSpec {
  id: string;
  attachTo?: string;
  attach_to?: string;
  side?: SidecarSide;
  title: string;
  bullets?: string[];
  width?: number;
  height?: number;
  gap?: number;
}

export interface TreeDiagram {
  nodes: Record<string, PlacedBlock>;
  primaryEdges: TreePrimaryEdge[];
  primary_edges: TreePrimaryEdge[];
  primaryConnectors: ElementLike[];
  primary_connectors: ElementLike[];
  secondaryEdges: RoutedEdge[];
  secondary_edges: RoutedEdge[];
  sidecars: Record<string, PlacedBlock>;
  sidecarConnectors: ElementLike[];
  sidecar_connectors: ElementLike[];
  bounds: Bounds;
}

interface MeasuredTreeNode {
  spec: TreeNodeSpec;
  block: PlacedBlock;
  depth: number;
  children: MeasuredTreeNode[];
  subtreeWidth: number;
  subtreeHeight: number;
}

export function planTreeLayout(
  spec: TreeLayoutSpec,
  options: TreeLayoutOptions = {},
  requested: TreeLayoutRequest = "auto",
): TreeLayoutPlan {
  const stats = treeStats(spec);
  const normalizedRequest = normalizeTreeLayoutRequest(requested);
  const family = normalizedRequest === "auto" ? chooseTreeLayoutFamily(stats) : normalizedRequest;
  const plannedOptions = optionsForTreeLayoutFamily(family, options, stats);
  return {
    family,
    reason: normalizedRequest === "auto" ? reasonForTreeLayoutFamily(family, stats) : requestedTreeLayoutReason(family, stats),
    options: plannedOptions,
    stats,
  };
}

export function tree(scene: Scene, spec: TreeLayoutSpec, options: TreeLayoutOptions = {}): TreeDiagram {
  const nodeWidth = options.nodeWidth ?? options.node_width ?? 280;
  const nodeHeight = options.nodeHeight ?? options.node_height ?? 120;
  const levelGap = options.levelGap ?? options.level_gap ?? 96;
  const siblingGap = options.siblingGap ?? options.sibling_gap ?? 48;
  const x = options.x ?? 0;
  const y = options.y ?? 0;

  const nodes: Record<string, PlacedBlock> = {};
  const rowHeights: number[] = [];
  const measured = measureTreeNode(scene, spec.root, 0, nodeWidth, nodeHeight, nodes, rowHeights);
  computeTreeWidth(measured, siblingGap);

  const rowTops: number[] = [];
  let currentY = y;
  for (const height of rowHeights) {
    rowTops.push(currentY);
    currentY += height + levelGap;
  }

  placeTreeNode(measured, x, rowTops, siblingGap);

  const primaryEdges: TreePrimaryEdge[] = [];
  const primaryConnectors: ElementLike[] = [];
  connectTreePrimaryEdges(scene, measured, primaryEdges, primaryConnectors);
  const primaryElements = [
    ...Object.values(nodes).flatMap((block) => block.elements),
    ...primaryConnectors,
    ...primaryEdges.map((edge) => edge.arrow),
  ];
  const primaryBounds = boundsFor(primaryElements);
  const routeOptions = routeOptionsFromTreeLayout(options);
  const placedSidecars = placeTreeSidecars(scene, nodes, spec.sidecars ?? [], primaryBounds, routeOptions);
  const secondaryEdges = routeEdges(scene, { nodes, bounds: primaryBounds }, spec.secondaryEdges ?? spec.secondary_edges ?? [], routeOptions);
  const elements = [
    ...primaryElements,
    ...Object.values(placedSidecars.sidecars).flatMap((block) => block.elements),
    ...placedSidecars.connectors,
    ...secondaryEdges.flatMap((edge) => edge.label ? [edge.arrow, edge.label] : [edge.arrow]),
  ];

  return {
    nodes,
    primaryEdges,
    primary_edges: primaryEdges,
    primaryConnectors,
    primary_connectors: primaryConnectors,
    secondaryEdges,
    secondary_edges: secondaryEdges,
    sidecars: placedSidecars.sidecars,
    sidecarConnectors: placedSidecars.connectors,
    sidecar_connectors: placedSidecars.connectors,
    bounds: boundsFor(elements),
  };
}

export const layout_tree = tree;

export function horizontalTree(scene: Scene, spec: TreeLayoutSpec, options: TreeLayoutOptions = {}): TreeDiagram {
  const nodeWidth = options.nodeWidth ?? options.node_width ?? 240;
  const nodeHeight = options.nodeHeight ?? options.node_height ?? 92;
  const levelGap = options.levelGap ?? options.level_gap ?? 84;
  const siblingGap = options.siblingGap ?? options.sibling_gap ?? options.rowGap ?? options.row_gap ?? 34;
  const leafGap = options.leafGap ?? options.leaf_gap ?? Math.min(22, siblingGap);
  const x = options.x ?? 0;
  const y = options.y ?? 0;

  const nodes: Record<string, PlacedBlock> = {};
  const measured = measureTreeNode(scene, spec.root, 0, nodeWidth, nodeHeight, nodes, []);
  const columnWidths: number[] = [];
  collectHorizontalTreeColumnWidths(measured, columnWidths);
  computeHorizontalTreeHeight(measured, siblingGap, leafGap);

  const columnLefts: number[] = [];
  let currentX = x;
  for (const width of columnWidths) {
    columnLefts.push(currentX);
    currentX += width + levelGap;
  }

  placeHorizontalTreeNode(measured, y, columnLefts, columnWidths, siblingGap, leafGap);

  const primaryEdges: TreePrimaryEdge[] = [];
  const primaryConnectors: ElementLike[] = [];
  connectHorizontalTreePrimaryEdges(scene, measured, primaryEdges, primaryConnectors);
  const primaryElements = [
    ...Object.values(nodes).flatMap((block) => block.elements),
    ...primaryConnectors,
    ...primaryEdges.map((edge) => edge.arrow),
  ];
  const primaryBounds = boundsFor(primaryElements);
  const routeOptions = routeOptionsFromTreeLayout(options);
  const placedSidecars = placeTreeSidecars(scene, nodes, spec.sidecars ?? [], primaryBounds, routeOptions);
  const secondaryEdges = routeEdges(scene, { nodes, bounds: primaryBounds }, spec.secondaryEdges ?? spec.secondary_edges ?? [], routeOptions);
  const elements = [
    ...primaryElements,
    ...Object.values(placedSidecars.sidecars).flatMap((block) => block.elements),
    ...placedSidecars.connectors,
    ...secondaryEdges.flatMap((edge) => edge.label ? [edge.arrow, edge.label] : [edge.arrow]),
  ];

  return {
    nodes,
    primaryEdges,
    primary_edges: primaryEdges,
    primaryConnectors,
    primary_connectors: primaryConnectors,
    secondaryEdges,
    secondary_edges: secondaryEdges,
    sidecars: placedSidecars.sidecars,
    sidecarConnectors: placedSidecars.connectors,
    sidecar_connectors: placedSidecars.connectors,
    bounds: boundsFor(elements),
  };
}

export const horizontal_tree = horizontalTree;
export const leftRightTree = horizontalTree;
export const left_right_tree = horizontalTree;

export function processFlow(scene: Scene, spec: TreeLayoutSpec, options: TreeLayoutOptions = {}): TreeDiagram {
  const nodeWidth = options.nodeWidth ?? options.node_width ?? 340;
  const nodeHeight = options.nodeHeight ?? options.node_height ?? 124;
  const columnGap = options.siblingGap ?? options.sibling_gap ?? 72;
  const rowGap = options.rowGap ?? options.row_gap ?? options.levelGap ?? options.level_gap ?? 92;
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const flattened = flattenTreeNodes(spec.root);
  const columns = Math.max(1, Math.min(
    flattened.length || 1,
    options.columns ?? options.wrapColumns ?? options.wrap_columns ?? defaultProcessFlowColumns(flattened.length),
  ));

  const nodes: Record<string, PlacedBlock> = {};
  const rowHeights: number[] = [];
  const rowWidths: number[] = [];
  const placements: Array<{ node: TreeNodeSpec; row: number; column: number; direction: "lr" | "rl" }> = [];

  for (const [index, node] of flattened.entries()) {
    if (nodes[node.id]) {
      throw new Error(`Duplicate tree node id: ${node.id}`);
    }
    const iconId = node.iconId ?? node.icon_id;
    if (!iconId) {
      throw new Error(`Tree node '${node.id}' requires iconId`);
    }
    const block = iconPanel(scene, 0, 0, nodeWidth, nodeHeight, {
      title: node.title,
      iconId,
      bullets: node.bullets ?? [],
    });
    nodes[node.id] = block;

    const row = Math.floor(index / columns);
    const indexInRow = index % columns;
    const rowStart = row * columns;
    const rowLength = Math.min(columns, flattened.length - rowStart);
    const direction = row % 2 === 0 ? "lr" : "rl";
    const column = direction === "lr" ? indexInRow : columns - rowLength + (rowLength - 1 - indexInRow);
    placements.push({ node, row, column, direction });
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, block.bounds.height);
    rowWidths[row] = Math.max(rowWidths[row] ?? 0, (column + 1) * nodeWidth + column * columnGap);
  }

  const totalWidth = Math.max(...rowWidths, nodeWidth);
  const rowTops: number[] = [];
  let currentY = y;
  for (const height of rowHeights) {
    rowTops.push(currentY);
    currentY += height + rowGap;
  }

  for (const placement of placements) {
    const block = nodes[placement.node.id];
    const rowWidth = rowWidths[placement.row] ?? totalWidth;
    const rowLeft = x + Math.max(0, (totalWidth - rowWidth) / 2);
    const nodeX = rowLeft + placement.column * (nodeWidth + columnGap);
    const nodeY = rowTops[placement.row] ?? y;
    block.translated(nodeX - block.bounds.left, nodeY - block.bounds.top);
  }

  const primaryEdges: TreePrimaryEdge[] = [];
  const primaryConnectors: ElementLike[] = [];
  for (let index = 0; index < flattened.length - 1; index += 1) {
    const source = nodes[flattened[index].id];
    const target = nodes[flattened[index + 1].id];
    primaryEdges.push({
      from: flattened[index].id,
      to: flattened[index + 1].id,
      arrow: connectSmart(scene, source, target, { kind: "primary" }),
    });
  }

  const primaryElements = [
    ...Object.values(nodes).flatMap((block) => block.elements),
    ...primaryEdges.map((edge) => edge.arrow),
  ];
  const primaryBounds = boundsFor(primaryElements);
  const routeOptions = routeOptionsFromTreeLayout(options);
  const placedSidecars = placeProcessFlowSidecars(scene, nodes, spec.sidecars ?? [], primaryBounds, routeOptions);
  const secondaryEdges = routeEdges(scene, { nodes, bounds: primaryBounds }, spec.secondaryEdges ?? spec.secondary_edges ?? [], routeOptions);
  const elements = [
    ...primaryElements,
    ...Object.values(placedSidecars.sidecars).flatMap((block) => block.elements),
    ...placedSidecars.connectors,
    ...secondaryEdges.flatMap((edge) => edge.label ? [edge.arrow, edge.label] : [edge.arrow]),
  ];

  return {
    nodes,
    primaryEdges,
    primary_edges: primaryEdges,
    primaryConnectors,
    primary_connectors: primaryConnectors,
    secondaryEdges,
    secondary_edges: secondaryEdges,
    sidecars: placedSidecars.sidecars,
    sidecarConnectors: placedSidecars.connectors,
    sidecar_connectors: placedSidecars.connectors,
    bounds: boundsFor(elements),
  };
}

export const process_flow = processFlow;

function treeStats(spec: TreeLayoutSpec): TreeLayoutStats {
  const depths = new Map<number, number>();
  let nodeCount = 0;
  let maxDepth = 0;
  let maxBullets = 0;
  let linear = true;

  function visit(node: TreeNodeSpec, depth: number): void {
    const children = node.children ?? [];
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    maxBullets = Math.max(maxBullets, (node.bullets ?? []).length);
    depths.set(depth, (depths.get(depth) ?? 0) + 1);
    if (children.length > 1) {
      linear = false;
    }
    for (const child of children) {
      visit(child, depth + 1);
    }
  }

  visit(spec.root, 0);
  return {
    nodeCount,
    maxDepth,
    maxBreadth: Math.max(...depths.values()),
    maxBullets,
    linear,
    secondaryEdgeCount: (spec.secondaryEdges ?? spec.secondary_edges ?? []).length,
    sidecarCount: (spec.sidecars ?? []).length,
  };
}

function chooseTreeLayoutFamily(stats: TreeLayoutStats): TreeLayoutFamily {
  if (stats.linear && stats.nodeCount >= 5) {
    return "process-flow";
  }
  if (stats.maxDepth >= 4 && stats.maxBreadth <= 2) {
    return "wide-tree";
  }
  return "tree";
}

function reasonForTreeLayoutFamily(family: TreeLayoutFamily, stats: TreeLayoutStats): string {
  if (family === "process-flow") {
    return `linear process with ${stats.nodeCount} nodes; wrapped process-flow avoids a tall narrow tree`;
  }
  if (family === "horizontal-tree") {
    return `left-to-right hierarchy with ${stats.nodeCount} nodes; leaf rows stay compact while parent groups remain centered`;
  }
  if (family === "wide-tree") {
    return `deep tree with maxDepth=${stats.maxDepth}; wider panels carry more context per level`;
  }
  return `branching or compact hierarchy with maxBreadth=${stats.maxBreadth}; measured top-down tree remains appropriate`;
}

function requestedTreeLayoutReason(family: TreeLayoutFamily, stats: TreeLayoutStats): string {
  return `requested ${family} layout for ${stats.nodeCount} nodes with maxDepth=${stats.maxDepth} and maxBreadth=${stats.maxBreadth}`;
}

function optionsForTreeLayoutFamily(family: TreeLayoutFamily, options: TreeLayoutOptions, stats: TreeLayoutStats): TreeLayoutOptions {
  if (family === "process-flow") {
    return {
      ...options,
      nodeWidth: Math.max(options.nodeWidth ?? options.node_width ?? 0, 340),
      nodeHeight: Math.max(options.nodeHeight ?? options.node_height ?? 0, 124),
      siblingGap: options.siblingGap ?? options.sibling_gap ?? 72,
      rowGap: options.rowGap ?? options.row_gap ?? options.levelGap ?? options.level_gap ?? 92,
      wrapColumns: options.wrapColumns ?? options.wrap_columns ?? options.columns ?? defaultProcessFlowColumns(stats.nodeCount),
    };
  }
  if (family === "wide-tree") {
    return {
      ...options,
      nodeWidth: Math.max(options.nodeWidth ?? options.node_width ?? 0, 360),
      levelGap: options.levelGap ?? options.level_gap ?? 72,
    };
  }
  if (family === "horizontal-tree") {
    return {
      ...options,
      nodeWidth: options.nodeWidth ?? options.node_width ?? 240,
      nodeHeight: options.nodeHeight ?? options.node_height ?? 92,
      levelGap: options.levelGap ?? options.level_gap ?? 84,
      siblingGap: options.siblingGap ?? options.sibling_gap ?? options.rowGap ?? options.row_gap ?? 34,
      leafGap: options.leafGap ?? options.leaf_gap ?? 22,
    };
  }
  return options;
}

function normalizeTreeLayoutRequest(requested: TreeLayoutRequest): TreeLayoutFamily | "auto" {
  return requested === "left-right-tree" ? "horizontal-tree" : requested;
}

function routeOptionsFromTreeLayout(options: TreeLayoutOptions): RouteEdgesOptions {
  return {
    reservedTopBand: options.reservedTopBand ?? options.reserved_top_band,
  };
}

function defaultProcessFlowColumns(nodeCount: number): number {
  if (nodeCount <= 4) {
    return Math.max(1, nodeCount);
  }
  if (nodeCount <= 8) {
    return 4;
  }
  return 5;
}

function flattenTreeNodes(root: TreeNodeSpec): TreeNodeSpec[] {
  const nodes: TreeNodeSpec[] = [];
  function visit(node: TreeNodeSpec): void {
    nodes.push(node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  }
  visit(root);
  return nodes;
}

export function routeEdges(
  scene: Scene,
  diagram: Pick<TreeDiagram, "nodes"> & { bounds?: Bounds },
  edges: SecondaryEdgeSpec[],
  options: RouteEdgesOptions = {},
): RoutedEdge[] {
  if (edges.length === 0) {
    return [];
  }
  const treeBounds = diagram.bounds ?? boundsFor(Object.values(diagram.nodes).flatMap((block) => block.elements));
  const reservedTopBand = options.reservedTopBand ?? options.reserved_top_band;
  const lanesSeen = { leftOuter: 0, rightOuter: 0 };
  return edges.map((edge) => {
    const source = diagram.nodes[edge.from];
    const target = diagram.nodes[edge.to];
    if (!source) {
      throw new Error(`Secondary edge source '${edge.from}' was not found in tree nodes`);
    }
    if (!target) {
      throw new Error(`Secondary edge target '${edge.to}' was not found in tree nodes`);
    }

    const lane = resolveSecondaryLane(edge, source, treeBounds);
    const laneIndex = lanesSeen[lane]++;
    const gutter = options.gutter ?? 48;
    const gutterStep = options.gutterStep ?? options.gutter_step ?? 16;
    const gutterX = lane === "leftOuter"
      ? treeBounds.left - gutter - laneIndex * gutterStep
      : treeBounds.right + gutter + laneIndex * gutterStep;
    const kind = edge.kind ?? "secondary";
    const sameRow = Math.abs(target.bounds.centerY - source.bounds.centerY) < Math.max(source.bounds.height, target.bounds.height) / 2;
    const route = sameRow
      ? sameRowSecondaryRoute(source.bounds, target.bounds, treeBounds, gutterX, gutter, reservedTopBand)
      : crossLevelSecondaryRoute(source.bounds, target.bounds, gutterX, lane, gutter, reservedTopBand);
    const arrow = scene.arrow(route.points, {
      color: options.color ?? GRAY,
      strokeWidth: options.strokeWidth ?? options.stroke_width ?? 1.5,
      dashed: kind !== "primary",
    });
    const label = edge.label ? secondaryEdgeLabel(scene, edge.label, gutterX, route.labelY, lane, options.color ?? GRAY) : undefined;
    return { from: edge.from, to: edge.to, kind, arrow, label, lane };
  });
}

export const route_edges = routeEdges;

interface PlacedSidecars {
  sidecars: Record<string, PlacedBlock>;
  connectors: ElementLike[];
}

function placeTreeSidecars(
  scene: Scene,
  nodes: Record<string, PlacedBlock>,
  specs: SidecarSpec[],
  treeBounds: Bounds,
  options: Pick<RouteEdgesOptions, "reservedTopBand" | "reserved_top_band"> = {},
): PlacedSidecars {
  const sidecars: Record<string, PlacedBlock> = {};
  const connectors: ElementLike[] = [];
  const sideCounts: Record<Exclude<SidecarSide, "auto">, number> = { left: 0, right: 0, top: 0, bottom: 0 };
  const reservedTopBand = options.reservedTopBand ?? options.reserved_top_band;
  for (const spec of specs) {
    if (sidecars[spec.id]) {
      throw new Error(`Duplicate sidecar id: ${spec.id}`);
    }
    const attachTo = spec.attachTo ?? spec.attach_to;
    if (!attachTo) {
      throw new Error(`Sidecar '${spec.id}' requires attachTo`);
    }
    const attached = nodes[attachTo];
    if (!attached) {
      throw new Error(`Sidecar '${spec.id}' attachTo '${attachTo}' was not found in tree nodes`);
    }

    let side = resolveSidecarSide(spec, attached, treeBounds);
    const width = spec.width ?? 210;
    const height = spec.height ?? 92;
    const gap = spec.gap ?? 34;
    if (side === "top" && reservedTopBand !== undefined) {
      const topY = sidecarY(side, treeBounds, attached.bounds, height, gap, sideCounts[side]);
      if (topY < reservedTopBand) {
        side = "bottom";
      }
    }
    const x = sidecarX(side, treeBounds, attached.bounds, width, gap, sideCounts[side]);
    const y = sidecarY(side, treeBounds, attached.bounds, height, gap, sideCounts[side], reservedTopBand);
    sideCounts[side] += 1;

    const block = sidecarPanel(scene, x, y, width, height, spec);
    sidecars[spec.id] = block;
    connectors.push(scene.line([
      anchor(block.bounds, { side: oppositeSide(side) }),
      anchor(attached.bounds, { side }),
    ], { color: GRAY, strokeWidth: 1, dashed: true }));
  }
  return { sidecars, connectors };
}

function measureTreeNode(
  scene: Scene,
  spec: TreeNodeSpec,
  depth: number,
  nodeWidth: number,
  nodeHeight: number,
  nodes: Record<string, PlacedBlock>,
  rowHeights: number[],
): MeasuredTreeNode {
  if (nodes[spec.id]) {
    throw new Error(`Duplicate tree node id: ${spec.id}`);
  }
  const iconId = spec.iconId ?? spec.icon_id;
  if (!iconId) {
    throw new Error(`Tree node '${spec.id}' requires iconId`);
  }
  const block = iconPanel(scene, 0, 0, nodeWidth, nodeHeight, {
    title: spec.title,
    iconId,
    bullets: spec.bullets ?? [],
  });
  nodes[spec.id] = block;
  rowHeights[depth] = Math.max(rowHeights[depth] ?? 0, block.bounds.height);
  return {
    spec,
    block,
    depth,
    children: (spec.children ?? []).map((child) => measureTreeNode(scene, child, depth + 1, nodeWidth, nodeHeight, nodes, rowHeights)),
    subtreeWidth: block.bounds.width,
    subtreeHeight: block.bounds.height,
  };
}

function computeTreeWidth(node: MeasuredTreeNode, siblingGap: number): number {
  if (node.children.length === 0) {
    node.subtreeWidth = node.block.bounds.width;
    return node.subtreeWidth;
  }
  const childrenWidth = node.children.reduce((total, child, index) => {
    return total + computeTreeWidth(child, siblingGap) + (index === 0 ? 0 : siblingGap);
  }, 0);
  node.subtreeWidth = Math.max(node.block.bounds.width, childrenWidth);
  return node.subtreeWidth;
}

function placeTreeNode(node: MeasuredTreeNode, left: number, rowTops: number[], siblingGap: number): void {
  const nodeX = left + node.subtreeWidth / 2 - node.block.bounds.width / 2;
  const nodeY = rowTops[node.depth] ?? 0;
  node.block.translated(nodeX - node.block.bounds.left, nodeY - node.block.bounds.top);

  const childrenWidth = node.children.reduce((total, child, index) => total + child.subtreeWidth + (index === 0 ? 0 : siblingGap), 0);
  let childLeft = left + Math.max(0, (node.subtreeWidth - childrenWidth) / 2);
  for (const child of node.children) {
    placeTreeNode(child, childLeft, rowTops, siblingGap);
    childLeft += child.subtreeWidth + siblingGap;
  }
}

function collectHorizontalTreeColumnWidths(node: MeasuredTreeNode, columnWidths: number[]): void {
  columnWidths[node.depth] = Math.max(columnWidths[node.depth] ?? 0, node.block.bounds.width);
  for (const child of node.children) {
    collectHorizontalTreeColumnWidths(child, columnWidths);
  }
}

function computeHorizontalTreeHeight(node: MeasuredTreeNode, siblingGap: number, leafGap: number): number {
  if (node.children.length === 0) {
    node.subtreeHeight = node.block.bounds.height;
    return node.subtreeHeight;
  }
  const childrenHeight = node.children.reduce((total, child, index) => {
    const gap = index === 0 ? 0 : horizontalSiblingGap(node.children[index - 1], child, siblingGap, leafGap);
    return total + computeHorizontalTreeHeight(child, siblingGap, leafGap) + gap;
  }, 0);
  node.subtreeHeight = Math.max(node.block.bounds.height, childrenHeight);
  return node.subtreeHeight;
}

function placeHorizontalTreeNode(
  node: MeasuredTreeNode,
  top: number,
  columnLefts: number[],
  columnWidths: number[],
  siblingGap: number,
  leafGap: number,
): void {
  const columnLeft = columnLefts[node.depth] ?? 0;
  const columnWidth = columnWidths[node.depth] ?? node.block.bounds.width;
  const nodeX = columnLeft + columnWidth / 2 - node.block.bounds.width / 2;
  const nodeY = top + node.subtreeHeight / 2 - node.block.bounds.height / 2;
  node.block.translated(nodeX - node.block.bounds.left, nodeY - node.block.bounds.top);

  const childrenHeight = node.children.reduce((total, child, index) => {
    const gap = index === 0 ? 0 : horizontalSiblingGap(node.children[index - 1], child, siblingGap, leafGap);
    return total + child.subtreeHeight + gap;
  }, 0);
  let childTop = top + Math.max(0, (node.subtreeHeight - childrenHeight) / 2);
  for (const [index, child] of node.children.entries()) {
    placeHorizontalTreeNode(child, childTop, columnLefts, columnWidths, siblingGap, leafGap);
    const next = node.children[index + 1];
    childTop += child.subtreeHeight + (next ? horizontalSiblingGap(child, next, siblingGap, leafGap) : 0);
  }
}

function horizontalSiblingGap(left: MeasuredTreeNode, right: MeasuredTreeNode, siblingGap: number, leafGap: number): number {
  return left.children.length === 0 && right.children.length === 0 ? leafGap : siblingGap;
}

function connectTreePrimaryEdges(scene: Scene, node: MeasuredTreeNode, edges: TreePrimaryEdge[], connectors: ElementLike[]): void {
  if (node.children.length === 1) {
    const child = node.children[0];
    edges.push({
      from: node.spec.id,
      to: child.spec.id,
      arrow: connect(scene, node.block, child.block, { kind: "primary", direction: "top-down", path: "orthogonal" }),
    });
    connectTreePrimaryEdges(scene, child, edges, connectors);
    return;
  }

  if (node.children.length > 1) {
    const parentPort = anchor(node.block.bounds, { side: "bottom" });
    const childPorts = node.children.map((child) => anchor(child.block.bounds, { side: "top" }));
    const trunkY = parentPort[1] + (Math.min(...childPorts.map((point) => point[1])) - parentPort[1]) / 2;
    const minChildX = Math.min(...childPorts.map((point) => point[0]));
    const maxChildX = Math.max(...childPorts.map((point) => point[0]));

    connectors.push(scene.line([parentPort, [parentPort[0], trunkY]], { strokeWidth: 2 }));
    connectors.push(scene.line([[minChildX, trunkY], [maxChildX, trunkY]], { strokeWidth: 2 }));

    for (const [index, child] of node.children.entries()) {
      const childPort = childPorts[index];
      edges.push({
        from: node.spec.id,
        to: child.spec.id,
        arrow: scene.arrow([[childPort[0], trunkY], childPort], { strokeWidth: 2 }),
      });
      connectTreePrimaryEdges(scene, child, edges, connectors);
    }
    return;
  }

  for (const child of node.children) {
    edges.push({
      from: node.spec.id,
      to: child.spec.id,
      arrow: connect(scene, node.block, child.block, { kind: "primary", direction: "top-down", path: "orthogonal" }),
    });
    connectTreePrimaryEdges(scene, child, edges, connectors);
  }
}

function connectHorizontalTreePrimaryEdges(scene: Scene, node: MeasuredTreeNode, edges: TreePrimaryEdge[], connectors: ElementLike[]): void {
  if (node.children.length === 1) {
    const child = node.children[0];
    edges.push({
      from: node.spec.id,
      to: child.spec.id,
      arrow: connect(scene, node.block, child.block, { kind: "primary", direction: "left-to-right", path: "orthogonal" }),
    });
    connectHorizontalTreePrimaryEdges(scene, child, edges, connectors);
    return;
  }

  if (node.children.length > 1) {
    const parentPort = anchor(node.block.bounds, { side: "right" });
    const childPorts = node.children.map((child) => anchor(child.block.bounds, { side: "left" }));
    const trunkX = parentPort[0] + (Math.min(...childPorts.map((point) => point[0])) - parentPort[0]) / 2;
    const minChildY = Math.min(...childPorts.map((point) => point[1]));
    const maxChildY = Math.max(...childPorts.map((point) => point[1]));

    connectors.push(scene.line([parentPort, [trunkX, parentPort[1]]], { strokeWidth: 2 }));
    connectors.push(scene.line([[trunkX, minChildY], [trunkX, maxChildY]], { strokeWidth: 2 }));

    for (const [index, child] of node.children.entries()) {
      const childPort = childPorts[index];
      edges.push({
        from: node.spec.id,
        to: child.spec.id,
        arrow: scene.arrow([[trunkX, childPort[1]], childPort], { strokeWidth: 2 }),
      });
      connectHorizontalTreePrimaryEdges(scene, child, edges, connectors);
    }
  }
}

function resolveSecondaryLane(edge: SecondaryEdgeSpec, source: PlacedBlock, treeBounds: Bounds): Exclude<SecondaryEdgeLane, "auto"> {
  if (edge.lane === "leftOuter" || edge.lane === "rightOuter") {
    return edge.lane;
  }
  return source.bounds.centerX <= treeBounds.centerX ? "leftOuter" : "rightOuter";
}

function sameRowSecondaryRoute(
  source: Bounds,
  target: Bounds,
  treeBounds: Bounds,
  gutterX: number,
  gutter: number,
  reservedTopBand?: number,
): { points: Array<[number, number]>; labelY: number } {
  const sourceBeforeTarget = source.centerX <= target.centerX;
  const topBandY = treeBounds.top - gutter;
  const useBottomBand = sourceBeforeTarget || (reservedTopBand !== undefined && topBandY < reservedTopBand);
  const bandY = useBottomBand ? treeBounds.bottom + gutter : topBandY;
  const side = useBottomBand ? "bottom" : "top";
  const start = anchor(source, { side });
  const end = anchor(target, { side });
  return {
    points: [start, [start[0], bandY], [gutterX, bandY], [end[0], bandY], end],
    labelY: bandY,
  };
}

function crossLevelSecondaryRoute(
  source: Bounds,
  target: Bounds,
  gutterX: number,
  lane: Exclude<SecondaryEdgeLane, "auto">,
  gutter = 48,
  reservedTopBand?: number,
): { points: Array<[number, number]>; labelY: number } {
  const side = lane === "leftOuter" ? "left" : "right";
  const start = anchor(source, { side });
  const targetBelowSource = target.centerY >= source.centerY;
  let targetSide: ConnectionSide = targetBelowSource ? "top" : "bottom";
  let routeY = targetBelowSource ? target.top - gutter / 2 : target.bottom + gutter / 2;
  if (targetBelowSource && reservedTopBand !== undefined && routeY < reservedTopBand) {
    targetSide = "bottom";
    routeY = target.bottom + gutter / 2;
  }
  const end = anchor(target, { side: targetSide });
  return {
    points: [start, [gutterX, start[1]], [gutterX, routeY], [end[0], routeY], end],
    labelY: routeY,
  };
}

function secondaryEdgeLabel(
  scene: Scene,
  text: string,
  gutterX: number,
  centerY: number,
  lane: Exclude<SecondaryEdgeLane, "auto">,
  color: string,
): ElementLike {
  const width = 170;
  const x = lane === "leftOuter" ? gutterX + 8 : gutterX - width - 8;
  return scene.text(x, centerY - 8, text, {
    size: 12,
    color,
    width,
    align: lane === "leftOuter" ? "left" : "right",
  });
}

function resolveSidecarSide(spec: SidecarSpec, attached: PlacedBlock, treeBounds: Bounds): Exclude<SidecarSide, "auto"> {
  if (spec.side === "left" || spec.side === "right" || spec.side === "top" || spec.side === "bottom") {
    return spec.side;
  }
  return attached.bounds.centerX <= treeBounds.centerX ? "left" : "right";
}

function resolveProcessFlowSidecarSide(spec: SidecarSpec, attached: PlacedBlock, flowBounds: Bounds): Exclude<SidecarSide, "auto"> {
  if (spec.side === "top" || spec.side === "bottom") {
    return spec.side;
  }
  if (spec.side === "left" && Math.abs(attached.bounds.left - flowBounds.left) < 1e-6) {
    return "left";
  }
  if (spec.side === "right" && Math.abs(attached.bounds.right - flowBounds.right) < 1e-6) {
    return "right";
  }
  return attached.bounds.centerY <= flowBounds.centerY ? "top" : "bottom";
}

function placeProcessFlowSidecars(
  scene: Scene,
  nodes: Record<string, PlacedBlock>,
  specs: SidecarSpec[],
  flowBounds: Bounds,
  options: Pick<RouteEdgesOptions, "reservedTopBand" | "reserved_top_band"> = {},
): PlacedSidecars {
  const sidecars: Record<string, PlacedBlock> = {};
  const connectors: ElementLike[] = [];
  const sideCounts: Record<Exclude<SidecarSide, "auto">, number> = { left: 0, right: 0, top: 0, bottom: 0 };
  const reservedTopBand = options.reservedTopBand ?? options.reserved_top_band;
  for (const spec of specs) {
    if (sidecars[spec.id]) {
      throw new Error(`Duplicate sidecar id: ${spec.id}`);
    }
    const attachTo = spec.attachTo ?? spec.attach_to;
    if (!attachTo) {
      throw new Error(`Sidecar '${spec.id}' requires attachTo`);
    }
    const attached = nodes[attachTo];
    if (!attached) {
      throw new Error(`Sidecar '${spec.id}' attachTo '${attachTo}' was not found in process-flow nodes`);
    }

    let side = resolveProcessFlowSidecarSide(spec, attached, flowBounds);
    const width = spec.width ?? 210;
    const height = spec.height ?? 92;
    const gap = spec.gap ?? 34;
    if (side === "top" && reservedTopBand !== undefined) {
      const topY = sidecarY(side, flowBounds, attached.bounds, height, gap, sideCounts[side]);
      if (topY < reservedTopBand) {
        side = "bottom";
      }
    }
    const x = sidecarX(side, flowBounds, attached.bounds, width, gap, sideCounts[side]);
    const y = sidecarY(side, flowBounds, attached.bounds, height, gap, sideCounts[side], reservedTopBand);
    sideCounts[side] += 1;

    const block = sidecarPanel(scene, x, y, width, height, spec);
    sidecars[spec.id] = block;
    connectors.push(scene.line([
      anchor(block.bounds, { side: oppositeSide(side) }),
      anchor(attached.bounds, { side }),
    ], { color: GRAY, strokeWidth: 1, dashed: true }));
  }
  return { sidecars, connectors };
}

function sidecarX(
  side: Exclude<SidecarSide, "auto">,
  diagramBounds: Bounds,
  attached: Bounds,
  width: number,
  gap: number,
  sideIndex: number,
): number {
  if (side === "left") {
    return diagramBounds.left - gap - width - sideIndex * 18;
  }
  if (side === "right") {
    return diagramBounds.right + gap + sideIndex * 18;
  }
  return attached.centerX - width / 2 + sideIndex * 18;
}

function sidecarY(
  side: Exclude<SidecarSide, "auto">,
  diagramBounds: Bounds,
  attached: Bounds,
  height: number,
  gap: number,
  sideIndex: number,
  reservedTopBand?: number,
): number {
  if (side === "top") {
    return diagramBounds.top - gap - height - sideIndex * 18;
  }
  if (side === "bottom") {
    return diagramBounds.bottom + gap + sideIndex * 18;
  }
  const y = attached.top + sideIndex * 18;
  return reservedTopBand === undefined ? y : Math.max(y, reservedTopBand);
}

function oppositeSide(side: Exclude<SidecarSide, "auto">): ConnectionSide {
  if (side === "left") return "right";
  if (side === "right") return "left";
  if (side === "top") return "bottom";
  return "top";
}

function sidecarPanel(scene: Scene, x: number, y: number, w: number, h: number, spec: SidecarSpec): PlacedBlock {
  const titleSize = 14;
  const bulletSize = 12;
  const bulletGap = 18;
  const padding = 14;
  const titleHeight = measureText(spec.title, { size: titleSize, width: w - padding * 2 }).height;
  const bulletTop = padding + titleHeight + 10;
  const bulletHeight = estimateBulletListHeight(spec.bullets ?? [], w - padding * 2, bulletSize, bulletGap);
  const finalHeight = Math.max(h, bulletTop + bulletHeight + padding);
  const rect = scene.rect(x, y, w, finalHeight, { color: GRAY, strokeWidth: 1 });
  const title = scene.text(x + padding, y + padding, spec.title, {
    size: titleSize,
    color: GRAY,
    width: w - padding * 2,
  });
  const bullets = bulletList(scene, x + padding, y + bulletTop, spec.bullets ?? [], {
    textSize: bulletSize,
    lineGap: bulletGap,
    width: w - padding * 2,
    color: GRAY,
  });
  return new PlacedBlock([rect, title, ...bullets.elements], boundsFor([rect, title, ...bullets.elements]));
}

export interface MermaidLayoutOptions {
  x?: number;
  y?: number;
  scenario?: "draft" | "tree";
  direction?: "TD" | "TB" | "BT" | "LR" | "RL";
  nodeWidth?: number;
  node_width?: number;
  nodeHeight?: number;
  node_height?: number;
  levelGap?: number;
  level_gap?: number;
  siblingGap?: number;
  sibling_gap?: number;
  textSize?: number;
  text_size?: number;
  color?: string;
  icons?: Record<string, string>;
  defaultIconId?: string;
  default_icon_id?: string;
  reservedTopBand?: number;
  reserved_top_band?: number;
}

export interface MermaidDiagram {
  nodes: Record<string, PlacedBlock>;
  arrows: ElementLike[];
  primaryEdges?: TreePrimaryEdge[];
  primary_edges?: TreePrimaryEdge[];
  primaryConnectors?: ElementLike[];
  primary_connectors?: ElementLike[];
  secondaryEdges?: RoutedEdge[];
  secondary_edges?: RoutedEdge[];
  sidecars?: Record<string, PlacedBlock>;
  sidecarConnectors?: ElementLike[];
  sidecar_connectors?: ElementLike[];
  bounds: Bounds;
}

export function fromMermaid(scene: Scene, source: string, options: MermaidLayoutOptions = {}): MermaidDiagram {
  const parsed = parseMermaid(source);
  if (options.scenario === "tree") {
    return mermaidTree(scene, parsed, options);
  }

  const direction = options.direction ?? parsed.direction;
  const nodeWidth = options.nodeWidth ?? options.node_width ?? 180;
  const nodeHeight = options.nodeHeight ?? options.node_height ?? 76;
  const levelGap = options.levelGap ?? options.level_gap ?? 110;
  const siblingGap = options.siblingGap ?? options.sibling_gap ?? 34;
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const levels = assignLevels(parsed.nodes, parsed.edges);
  const blocks: Record<string, PlacedBlock> = {};

  for (const [levelIndex, nodeIds] of levels.entries()) {
    const totalBreadth = nodeIds.length * nodeBreadth(direction, nodeWidth, nodeHeight) + Math.max(0, nodeIds.length - 1) * siblingGap;
    for (const [index, id] of nodeIds.entries()) {
      const breadthOffset = index * (nodeBreadth(direction, nodeWidth, nodeHeight) + siblingGap);
      const mainOffset = levelIndex * (nodeDepth(direction, nodeWidth, nodeHeight) + levelGap);
      const nodeX = isHorizontal(direction) ? x + mainOffset : x + breadthOffset - totalBreadth / 2 + nodeWidth / 2;
      const nodeY = isHorizontal(direction) ? y + breadthOffset - totalBreadth / 2 + nodeHeight / 2 : y + mainOffset;
      blocks[id] = textBox(scene, nodeX, nodeY, nodeWidth, nodeHeight, parsed.nodes.get(id) ?? id, {
        textSize: options.textSize ?? options.text_size ?? 15,
        color: options.color ?? BLUE,
      });
    }
  }

  const arrows = parsed.edges.map((edge) => connect(scene, blocks[edge.from], blocks[edge.to], {
    direction: mermaidConnectionDirection(direction),
    path: "orthogonal",
    color: options.color ?? BLUE,
  }));
  return { nodes: blocks, arrows, bounds: boundsFor([...Object.values(blocks).flatMap((block) => block.elements), ...arrows]) };
}

export const from_mermaid = fromMermaid;

function mermaidTree(scene: Scene, parsed: ParsedMermaid, options: MermaidLayoutOptions): MermaidDiagram {
  const primaryEdges = parsed.edges.filter((edge) => !edge.dotted && !edge.label);
  const secondaryEdges = parsed.edges.filter((edge) => edge.dotted || edge.label);
  const rootId = mermaidRootId(parsed.nodes, primaryEdges);
  const treeSpec = mermaidTreeNode(rootId, parsed, primaryEdges, options, new Set());
  const diagram = tree(scene, {
    root: treeSpec,
    secondaryEdges: secondaryEdges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: edge.dotted ? "feedback" : "secondary",
      label: edge.label,
      lane: "auto",
    })),
  }, {
    x: options.x,
    y: options.y,
    nodeWidth: options.nodeWidth ?? options.node_width,
    nodeHeight: options.nodeHeight ?? options.node_height,
    levelGap: options.levelGap ?? options.level_gap,
    siblingGap: options.siblingGap ?? options.sibling_gap,
    reservedTopBand: options.reservedTopBand ?? options.reserved_top_band,
  });
  const arrows = [
    ...diagram.primaryEdges.map((edge) => edge.arrow),
    ...diagram.secondaryEdges.map((edge) => edge.arrow),
  ];
  return { ...diagram, arrows };
}

function connectionPorts(options: ConnectOptions): { from: ConnectionPort; to: ConnectionPort } {
  const sides = connectionSides(options);
  return {
    from: normalizeEndpoint(options.from, sides.from),
    to: normalizeEndpoint(options.to, sides.to),
  };
}

function connectionSides(options: ConnectOptions): { from: ConnectionSide; to: ConnectionSide } {
  if (options.from && options.to) {
    return { from: endpointSide(options.from), to: endpointSide(options.to) };
  }
  switch (normalizeDirection(options.direction ?? "left-to-right")) {
    case "right-to-left": {
      return { from: endpointSide(options.from, "left"), to: endpointSide(options.to, "right") };
    }
    case "top-down": {
      return { from: endpointSide(options.from, "bottom"), to: endpointSide(options.to, "top") };
    }
    case "bottom-up": {
      return { from: endpointSide(options.from, "top"), to: endpointSide(options.to, "bottom") };
    }
    case "left-to-right":
    default:
      return { from: endpointSide(options.from, "right"), to: endpointSide(options.to, "left") };
  }
}

const DEFAULT_ROUTED_CORNER_RADIUS = 18;
const DEFAULT_LABEL_GAP = 10;
// How far above its line a labelOnLine label sits. Small so the label hugs the
// line (clear association); tune up to lift it, down to 0/negative to sit on it.
const LABEL_ON_LINE_GAP = 2;
const ROUNDED_CORNER_STEPS = 4;

function routedConnectionPoints(
  source: Bounds,
  target: Bounds,
  from: ConnectionPort,
  to: ConnectionPort,
  options: ConnectOptions,
  defaultCornerRadius: number,
): PointTuple[] {
  const path = options.path ?? "straight";
  const obstacles = connectionObstacleBounds(options)
    .filter((bounds) => !sameBounds(bounds, source) && !sameBounds(bounds, target));
  const clearance = options.clearance ?? 6;
  const withRouteStyle = (points: PointTuple[]) => routedPolyline(points, options, defaultCornerRadius, obstacles, clearance);

  if (path === "auto") {
    const straight = connectionPoints(source, target, from, to, "straight");
    if (routeClears(straight, obstacles, clearance)) {
      return straight;
    }
    const orthogonal = connectionPoints(source, target, from, to, "orthogonal");
    if (routeClears(orthogonal, obstacles, clearance)) {
      return withRouteStyle(orthogonal);
    }
    return withRouteStyle(outerConnectionPoints(source, target, from, to, options, obstacles));
  }

  if (path === "outer") {
    return withRouteStyle(outerConnectionPoints(source, target, from, to, options, obstacles));
  }

  return withRouteStyle(connectionPoints(source, target, from, to, path));
}

function connectionPoints(source: Bounds, target: Bounds, from: ConnectionPort, to: ConnectionPort, path: Exclude<ConnectionPath, "outer" | "auto">): PointTuple[] {
  const start = anchor(source, from);
  const end = anchor(target, to);
  if (path === "straight") {
    return [start, end];
  }
  if (from.side === "left" || from.side === "right" || to.side === "left" || to.side === "right") {
    const midX = (start[0] + end[0]) / 2;
    return simplifyPolyline([start, [midX, start[1]], [midX, end[1]], end]);
  }
  const midY = (start[1] + end[1]) / 2;
  return simplifyPolyline([start, [start[0], midY], [end[0], midY], end]);
}

function outerConnectionPoints(
  source: Bounds,
  target: Bounds,
  from: ConnectionPort,
  to: ConnectionPort,
  options: ConnectOptions,
  obstacles: Bounds[],
): PointTuple[] {
  const routeBounds = options.routeBounds ?? options.route_bounds ?? unionBounds([source, target, ...obstacles]);
  const side = options.outerSide ?? options.outer_side ?? defaultOuterSide(from, to, source, target);
  const gap = options.outerGap ?? options.outer_gap ?? 48;

  if (side === "top" || side === "bottom") {
    const start = anchor(source, from);
    const end = anchor(target, to);
    const laneY = side === "top" ? routeBounds.top - gap : routeBounds.bottom + gap;
    return simplifyPolyline([start, [start[0], laneY], [end[0], laneY], end]);
  }

  const start = anchor(source, from);
  const end = anchor(target, to);
  const laneX = side === "left" ? routeBounds.left - gap : routeBounds.right + gap;
  return simplifyPolyline([start, [laneX, start[1]], [laneX, end[1]], end]);
}

function defaultOuterSide(from: ConnectionPort, to: ConnectionPort, source: Bounds, target: Bounds): ConnectionSide {
  if (from.side === "top" || from.side === "bottom" || to.side === "top" || to.side === "bottom") {
    return target.centerX >= source.centerX ? "right" : "left";
  }
  return "bottom";
}

function routeClears(points: PointTuple[], obstacles: Bounds[], clearance: number): boolean {
  return obstacles.every((bounds) => !polylineIntersectsBounds(points, inflateBounds(bounds, clearance)));
}

function routedPolyline(
  points: PointTuple[],
  options: ConnectOptions,
  defaultCornerRadius: number,
  obstacles: Bounds[],
  clearance: number,
): PointTuple[] {
  const radius = options.cornerRadius ?? options.corner_radius ?? defaultCornerRadius;
  if (!Number.isFinite(radius) || radius <= 0 || points.length <= 2) {
    return points;
  }

  const rounded = roundedPolyline(points, radius);
  return routeClears(rounded, obstacles, clearance) ? rounded : points;
}

function roundedPolyline(points: PointTuple[], radius: number): PointTuple[] {
  const rounded: PointTuple[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incomingLength = Math.hypot(corner[0] - previous[0], corner[1] - previous[1]);
    const outgoingLength = Math.hypot(next[0] - corner[0], next[1] - corner[1]);

    if (incomingLength < 1 || outgoingLength < 1) {
      pushDistinctPoint(rounded, corner);
      continue;
    }

    const incoming: PointTuple = [(corner[0] - previous[0]) / incomingLength, (corner[1] - previous[1]) / incomingLength];
    const outgoing: PointTuple = [(next[0] - corner[0]) / outgoingLength, (next[1] - corner[1]) / outgoingLength];
    const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    if (Math.abs(dot) > 0.999) {
      pushDistinctPoint(rounded, corner);
      continue;
    }

    const cornerRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    if (cornerRadius < 2) {
      pushDistinctPoint(rounded, corner);
      continue;
    }

    const curveStart: PointTuple = [
      corner[0] - incoming[0] * cornerRadius,
      corner[1] - incoming[1] * cornerRadius,
    ];
    const curveEnd: PointTuple = [
      corner[0] + outgoing[0] * cornerRadius,
      corner[1] + outgoing[1] * cornerRadius,
    ];

    pushDistinctPoint(rounded, curveStart);
    for (let step = 1; step <= ROUNDED_CORNER_STEPS; step += 1) {
      const t = step / (ROUNDED_CORNER_STEPS + 1);
      pushDistinctPoint(rounded, quadraticPoint(curveStart, corner, curveEnd, t));
    }
    pushDistinctPoint(rounded, curveEnd);
  }

  pushDistinctPoint(rounded, points[points.length - 1]);
  return rounded;
}

function quadraticPoint(start: PointTuple, control: PointTuple, end: PointTuple, t: number): PointTuple {
  const inverse = 1 - t;
  return [
    inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
    inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
  ];
}

function pushDistinctPoint(points: PointTuple[], point: PointTuple): void {
  if (!samePoint(points[points.length - 1], point)) {
    points.push(point);
  }
}

function connectionObstacleBounds(options: ConnectOptions): Bounds[] {
  return (options.obstacles ?? []).map(boundsForObstacle);
}

function connectionLabelObstacleBounds(options: ConnectOptions): Bounds[] {
  return (options.avoidLabels ?? options.avoid_labels ?? []).map(boundsForObstacle);
}

function boundsForObstacle(obstacle: ConnectionObstacle): Bounds {
  if (obstacle instanceof Bounds) {
    return obstacle;
  }
  if (obstacle instanceof PlacedBlock) {
    return obstacle.bounds;
  }
  if (Array.isArray(obstacle)) {
    return boundsFor(obstacle);
  }
  return boundsFor([obstacle]);
}

function connectionLabel(
  scene: Scene,
  text: string,
  source: Bounds,
  target: Bounds,
  points: PointTuple[],
  options: ConnectOptions,
): ElementLike {
  const width = options.labelWidth ?? options.label_width ?? 132;
  const size = options.labelSize ?? options.label_size ?? 10;
  const color = options.labelColor ?? options.label_color ?? options.color ?? GRAY;
  const offset = options.labelOffset ?? options.label_offset ?? {};
  const height = measureText(text, { size, width }).height;
  const gap = options.labelGap ?? options.label_gap ?? DEFAULT_LABEL_GAP;
  // labelOnLine: drop the obstacle-avoiding search and pin the label to its own
  // line (snug above the longest segment's midpoint). It may overlap cards here;
  // resolveLabelCollisions slides it off card *text* and other labels afterwards,
  // leaving it on its line so the association stays obvious.
  if (options.labelOnLine) {
    const [lx, ly] = segmentLabelCandidates(points, width, height, LABEL_ON_LINE_GAP)[0] ?? [0, 0];
    const offset = options.labelOffset ?? options.label_offset ?? {};
    return scene.text(lx + (offset.dx ?? 0), ly + (offset.dy ?? 0), text, { size, color, width, align: "center" });
  }
  const obstacles = [source, target, ...connectionObstacleBounds(options), ...connectionLabelObstacleBounds(options)];
  const avoidRoutes = options.avoidRoutes ?? options.avoid_routes ?? [];
  const candidates = connectionLabelCandidates(source, target, points, width, height, options);
  const [x, y] = candidates.find((candidate) => labelClears(candidate, width, height, obstacles, points, avoidRoutes, gap))
    ?? candidates.find((candidate) => labelClears(candidate, width, height, obstacles, [], avoidRoutes, gap))
    ?? candidates.find((candidate) => labelClears(candidate, width, height, obstacles, [], [], gap))
    ?? candidates[0]
    ?? [0, 0];
  return scene.text(x + (offset.dx ?? 0), y + (offset.dy ?? 0), text, {
    size,
    color,
    width,
    align: "center",
  });
}

/** A placed edge label paired with the connection polyline it rides. */
export interface LabelPlacement {
  element: ElementLike;
  points: PointTuple[];
  /** Ids of the cards this label's own edge connects; those cards never push it. */
  ownerIds?: string[];
}

/** A card the post-pass should keep labels off of — its border and its text. */
export interface LabelCardObstacle {
  id: string;
  bounds: Bounds;
  /** Bounds of the card's own text elements (title, bullets). */
  textBounds: Bounds[];
}

// Text-text overlap below this share of the smaller label is "minor" and left
// alone; the slide search steps along the line in LABEL_SLIDE_STEP px and never
// strays more than LABEL_SLIDE_FRACTION of the longest segment from where it sits.
// Straddling an unrelated card's border costs a flat penalty so the search prefers
// a slot that is either fully clear of the card or fully inside its free interior.
const LABEL_OVERLAP_RATIO = 0.18;
const LABEL_SLIDE_STEP = 10;
const LABEL_SLIDE_FRACTION = 0.45;
const LABEL_BORDER_PENALTY = 600;
const LABEL_MAX_PASSES = 4;

/**
 * Post-pass over the whole scene: nudges edge labels along their own connection
 * lines until they read cleanly. A label only ever moves parallel to its line
 * (its perpendicular offset is preserved), so it stays glued to the line it
 * belongs to. It slides away from three things: other labels, an unrelated card's
 * text, and an unrelated card's border (so it never straddles a card edge). A
 * label resting in a card's free interior, crossing its own line, or overlapping
 * the two cards its edge connects is all fine. When no zero-cost slot exists the
 * label keeps the least-bad position, still on its line. Deterministic (smaller
 * magnitude, then positive direction, wins); mutates the label elements in place.
 */
export function resolveLabelCollisions(labels: LabelPlacement[], options: { cards?: LabelCardObstacle[] } = {}): void {
  const cards = options.cards ?? [];
  const items = labels
    .filter((label) => label.element && label.points.length >= 2)
    .map((label) => ({
      element: label.element,
      bounds: elementBounds(label.element),
      tangent: dominantTangent(label.points),
      reach: dominantReach(label.points),
      ownerIds: new Set(label.ownerIds ?? []),
    }));

  // Several passes: moving one label changes what its neighbours see, so re-run
  // until nothing moves (or a small cap), which clears far more clusters than a
  // single greedy sweep. Each label still only slides along its own line.
  for (let pass = 0; pass < LABEL_MAX_PASSES; pass += 1) {
    let moved = false;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const others = items.filter((_, other) => other !== index).map((entry) => entry.bounds);
      const cost = (bounds: Bounds) => labelOverlap(bounds, others) + cardCost(bounds, cards, item.ownerIds);
      let best = { distance: 0, cost: cost(item.bounds) };
      if (best.cost <= 0) {
        continue;
      }
      const maxDistance = item.reach * LABEL_SLIDE_FRACTION;
      for (let distance = LABEL_SLIDE_STEP; distance <= maxDistance && best.cost > 0; distance += LABEL_SLIDE_STEP) {
        for (const sign of [1, -1]) {
          const signed = sign * distance;
          const candidate = shiftBounds(item.bounds, item.tangent[0] * signed, item.tangent[1] * signed);
          const candidateCost = cost(candidate);
          if (candidateCost < best.cost) {
            best = { distance: signed, cost: candidateCost };
          }
          if (candidateCost <= 0) {
            break;
          }
        }
      }
      if (best.distance !== 0) {
        translate(item.element, item.tangent[0] * best.distance, item.tangent[1] * best.distance);
        item.bounds = elementBounds(item.element);
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
}

/**
 * Cost of a label box against the cards it does NOT belong to: overlapping a
 * card's text, or straddling its border, both push the label away; resting fully
 * inside a card's free interior (clear of text) is free.
 */
function cardCost(bounds: Bounds, cards: LabelCardObstacle[], ownerIds: Set<string>): number {
  let cost = 0;
  for (const card of cards) {
    if (ownerIds.has(card.id) || intersectionArea(bounds, card.bounds) <= 0) {
      continue;
    }
    for (const text of card.textBounds) {
      cost += intersectionArea(bounds, text);
    }
    const insideCard = bounds.left >= card.bounds.left && bounds.right <= card.bounds.right
      && bounds.top >= card.bounds.top && bounds.bottom <= card.bounds.bottom;
    if (!insideCard) {
      cost += LABEL_BORDER_PENALTY;
    }
  }
  return cost;
}

/** Unit direction of the polyline's longest segment (the segment a label rides). */
function dominantTangent(points: PointTuple[]): PointTuple {
  let best: PointTuple = [1, 0];
  let longest = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length > longest) {
      longest = length;
      best = [(x2 - x1) / length, (y2 - y1) / length];
    }
  }
  return best;
}

/** Length of the polyline's longest segment — how far a label may slide. */
function dominantReach(points: PointTuple[]): number {
  let longest = 0;
  for (let index = 1; index < points.length; index += 1) {
    longest = Math.max(longest, Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
  }
  return longest;
}

function shiftBounds(bounds: Bounds, dx: number, dy: number): Bounds {
  return new Bounds(bounds.x + dx, bounds.y + dy, bounds.width, bounds.height);
}

/** Summed notable text-text overlap area between one label and the others. */
function labelOverlap(bounds: Bounds, others: Bounds[]): number {
  let total = 0;
  for (const other of others) {
    const area = intersectionArea(bounds, other);
    if (area <= 0) {
      continue;
    }
    const minArea = Math.min(bounds.width * bounds.height, other.width * other.height);
    if (minArea > 0 && area / minArea >= LABEL_OVERLAP_RATIO) {
      total += area;
    }
  }
  return total;
}

function intersectionArea(a: Bounds, b: Bounds): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function connectionLabelCandidates(
  source: Bounds,
  target: Bounds,
  points: PointTuple[],
  width: number,
  height: number,
  options: ConnectOptions,
): PointTuple[] {
  const gap = options.labelGap ?? options.label_gap ?? DEFAULT_LABEL_GAP;
  const direction = normalizeDirection(options.direction ?? inferDirection(source, target));
  const candidates: PointTuple[] = [];

  // Prefer the middle of the line first: the longest segment's midpoint. For a
  // long edge crossing open canvas this clears and the label rides the line; for
  // a short in-row edge it overlaps a card, fails the clearance test, and falls
  // through to the gap-based candidates below.
  for (const candidate of segmentLabelCandidates(points, width, height, gap)) {
    candidates.push(candidate);
  }

  if ((direction === "left-to-right" || direction === "right-to-left") && horizontalGap(source, target) > 0) {
    const left = Math.min(source.right, target.right);
    const right = Math.max(source.left, target.left);
    const overlapTop = Math.max(source.top, target.top);
    const overlapBottom = Math.min(source.bottom, target.bottom);
    const lineY = dominantHorizontalY(points) ?? (source.centerY + target.centerY) / 2;
    const x = (left + right - width) / 2;
    if (overlapBottom - overlapTop > height + gap * 2) {
      candidates.push([x, lineY - height - gap]);
      candidates.push([x, lineY + gap]);
      candidates.push([x, overlapTop - height - gap]);
      candidates.push([x, overlapBottom + gap]);
      candidates.push([x, Math.min(source.top, target.top) - height - gap * 4]);
      candidates.push([x, Math.max(source.bottom, target.bottom) + gap * 4]);
    }
  }

  if ((direction === "top-down" || direction === "bottom-up") && verticalGap(source, target) > 0) {
    const top = Math.min(source.bottom, target.bottom);
    const bottom = Math.max(source.top, target.top);
    const overlapLeft = Math.max(source.left, target.left);
    const overlapRight = Math.min(source.right, target.right);
    const lineX = dominantVerticalX(points) ?? (source.centerX + target.centerX) / 2;
    const y = (top + bottom - height) / 2;
    if (overlapRight - overlapLeft > width + gap * 2) {
      candidates.push([lineX + gap, y]);
      candidates.push([lineX - width - gap, y]);
      candidates.push([overlapRight + gap, y]);
      candidates.push([overlapLeft - width - gap, y]);
      candidates.push([Math.max(source.right, target.right) + gap * 4, y]);
      candidates.push([Math.min(source.left, target.left) - width - gap * 4, y]);
    }
  }

  const center = polylineCenter(points);
  const routeBounds = unionBounds([source, target, boundsForPoints(points)]);
  candidates.push([center[0] - width / 2, routeBounds.top - height - gap * 4]);
  candidates.push([center[0] - width / 2, routeBounds.bottom + gap * 4]);
  candidates.push([routeBounds.right + gap * 4, center[1] - height / 2]);
  candidates.push([routeBounds.left - width - gap * 4, center[1] - height / 2]);
  candidates.push([center[0] - width / 2, center[1] - height / 2]);
  return dedupePoints(candidates);
}

function horizontalGap(a: Bounds, b: Bounds): number {
  if (a.right <= b.left) return b.left - a.right;
  if (b.right <= a.left) return a.left - b.right;
  return 0;
}

function verticalGap(a: Bounds, b: Bounds): number {
  if (a.bottom <= b.top) return b.top - a.bottom;
  if (b.bottom <= a.top) return a.top - b.bottom;
  return 0;
}

function segmentLabelCandidates(points: PointTuple[], width: number, height: number, gap: number): PointTuple[] {
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    segments.push({ start, end, length: Math.hypot(end[0] - start[0], end[1] - start[1]) });
  }
  segments.sort((a, b) => b.length - a.length);

  const candidates: PointTuple[] = [];
  for (const { start, end } of segments) {
    const mid: PointTuple = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    if (Math.abs(start[1] - end[1]) <= Math.abs(start[0] - end[0])) {
      candidates.push([mid[0] - width / 2, mid[1] - height - gap]);
      candidates.push([mid[0] - width / 2, mid[1] + gap]);
    } else {
      candidates.push([mid[0] + gap, mid[1] - height / 2]);
      candidates.push([mid[0] - width - gap, mid[1] - height / 2]);
    }
  }
  return candidates;
}

function dominantHorizontalY(points: PointTuple[]): number | null {
  let longest = 0;
  let y: number | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = Math.abs(end[0] - start[0]);
    const dy = Math.abs(end[1] - start[1]);
    if (dy <= dx && dx > longest) {
      longest = dx;
      y = (start[1] + end[1]) / 2;
    }
  }
  return y;
}

function dominantVerticalX(points: PointTuple[]): number | null {
  let longest = 0;
  let x: number | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = Math.abs(end[0] - start[0]);
    const dy = Math.abs(end[1] - start[1]);
    if (dx <= dy && dy > longest) {
      longest = dy;
      x = (start[0] + end[0]) / 2;
    }
  }
  return x;
}

function labelClears(
  candidate: PointTuple,
  width: number,
  height: number,
  obstacles: Bounds[],
  points: PointTuple[],
  avoidRoutes: PointTuple[][],
  clearance: number,
): boolean {
  const bounds = new Bounds(candidate[0], candidate[1], width, height);
  const routes = points.length === 0 ? avoidRoutes : [points, ...avoidRoutes];
  return obstacles.every((obstacle) => !boundsOverlap(bounds, inflateBounds(obstacle, clearance)))
    && routes.every((route) => !polylineIntersectsBounds(route, bounds));
}

function polylineCenter(points: PointTuple[]): PointTuple {
  if (points.length === 0) {
    return [0, 0];
  }
  const totalLength = points.slice(0, -1).reduce((sum, point, index) => {
    const next = points[index + 1];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
  if (totalLength === 0) {
    return points[0];
  }
  let walked = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (walked + length >= totalLength / 2) {
      const ratio = (totalLength / 2 - walked) / Math.max(length, 1);
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    }
    walked += length;
  }
  return points[points.length - 1];
}

function simplifyPolyline(points: PointTuple[]): PointTuple[] {
  const withoutDuplicates = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  const simplified: PointTuple[] = [];
  for (const point of withoutDuplicates) {
    simplified.push(point);
    while (simplified.length >= 3) {
      const a = simplified[simplified.length - 3];
      const b = simplified[simplified.length - 2];
      const c = simplified[simplified.length - 1];
      if (!collinear(a, b, c)) {
        break;
      }
      simplified.splice(simplified.length - 2, 1);
    }
  }
  return simplified;
}

function dedupePoints(points: PointTuple[]): PointTuple[] {
  const result: PointTuple[] = [];
  for (const point of points) {
    if (!result.some((existing) => samePoint(existing, point))) {
      result.push(point);
    }
  }
  return result;
}

function samePoint(a: PointTuple, b: PointTuple): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function collinear(a: PointTuple, b: PointTuple, c: PointTuple): boolean {
  return Math.abs((b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])) < 1e-6;
}

function unionBounds(bounds: Bounds[]): Bounds {
  if (bounds.length === 0) {
    return new Bounds(0, 0, 0, 0);
  }
  const left = Math.min(...bounds.map((box) => box.left));
  const top = Math.min(...bounds.map((box) => box.top));
  const right = Math.max(...bounds.map((box) => box.right));
  const bottom = Math.max(...bounds.map((box) => box.bottom));
  return new Bounds(left, top, right - left, bottom - top);
}

function boundsForPoints(points: PointTuple[]): Bounds {
  if (points.length === 0) {
    return new Bounds(0, 0, 0, 0);
  }
  const left = Math.min(...points.map((point) => point[0]));
  const top = Math.min(...points.map((point) => point[1]));
  const right = Math.max(...points.map((point) => point[0]));
  const bottom = Math.max(...points.map((point) => point[1]));
  return new Bounds(left, top, right - left, bottom - top);
}

function sameBounds(a: Bounds, b: Bounds): boolean {
  return Math.abs(a.left - b.left) < 1e-6
    && Math.abs(a.top - b.top) < 1e-6
    && Math.abs(a.width - b.width) < 1e-6
    && Math.abs(a.height - b.height) < 1e-6;
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function anchor(bounds: Bounds, port: ConnectionPort): [number, number] {
  const slot = clampSlot(port.slot ?? 0.5);
  switch (port.side) {
    case "left":
      return [bounds.left, bounds.top + bounds.height * slot];
    case "right":
      return [bounds.right, bounds.top + bounds.height * slot];
    case "top":
      return [bounds.left + bounds.width * slot, bounds.top];
    case "bottom":
      return [bounds.left + bounds.width * slot, bounds.bottom];
  }
}

function normalizeEndpoint(endpoint: ConnectionEndpoint | undefined, fallback: ConnectionSide): ConnectionPort {
  if (!endpoint) {
    return { side: fallback };
  }
  if (typeof endpoint === "string") {
    return { side: endpoint };
  }
  return endpoint;
}

function endpointSide(endpoint: ConnectionEndpoint | undefined, fallback?: ConnectionSide): ConnectionSide {
  if (!endpoint) {
    if (!fallback) {
      throw new Error("Connection endpoint side is required");
    }
    return fallback;
  }
  return typeof endpoint === "string" ? endpoint : endpoint.side;
}

function clampSlot(slot: number): number {
  return Math.min(1, Math.max(0, slot));
}

function inferDirection(source: Bounds, target: Bounds): ConnectionDirection {
  const dx = target.centerX - source.centerX;
  const dy = target.centerY - source.centerY;
  const rowGap = verticalGap(source, target);
  if (rowGap >= Math.min(source.height, target.height) * 0.25) {
    return dy >= 0 ? "top-down" : "bottom-up";
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "left-to-right" : "right-to-left";
  }
  return dy >= 0 ? "top-down" : "bottom-up";
}

function normalizeDirection(direction: ConnectionDirection): Exclude<ConnectionDirection, "lr" | "rl" | "td" | "bt"> {
  if (direction === "lr") return "left-to-right";
  if (direction === "rl") return "right-to-left";
  if (direction === "td") return "top-down";
  if (direction === "bt") return "bottom-up";
  return direction;
}

function mermaidRootId(nodes: Map<string, string>, edges: ParsedMermaidEdge[]): string {
  const incoming = new Set(edges.map((edge) => edge.to));
  const root = [...nodes.keys()].find((id) => !incoming.has(id));
  return root ?? [...nodes.keys()][0] ?? "root";
}

function mermaidTreeNode(
  id: string,
  parsed: ParsedMermaid,
  primaryEdges: ParsedMermaidEdge[],
  options: MermaidLayoutOptions,
  seen: Set<string>,
): TreeNodeSpec {
  if (seen.has(id)) {
    return {
      id: `${id}_cycle`,
      title: parsed.nodes.get(id) ?? id,
      iconId: mermaidIconId(id, parsed, options),
      bullets: ["cycle reference"],
    };
  }
  seen.add(id);
  return {
    id,
    title: parsed.nodes.get(id) ?? id,
    iconId: mermaidIconId(id, parsed, options),
    bullets: [],
    children: primaryEdges
      .filter((edge) => edge.from === id)
      .map((edge) => mermaidTreeNode(edge.to, parsed, primaryEdges, options, new Set(seen))),
  };
}

function mermaidIconId(id: string, parsed: ParsedMermaid, options: MermaidLayoutOptions): string {
  const label = parsed.nodes.get(id) ?? id;
  return options.icons?.[id] ?? options.icons?.[label] ?? options.defaultIconId ?? options.default_icon_id ?? "tool_call";
}

function textBox(scene: Scene, x: number, y: number, w: number, h: number, label: string, options: { textSize: number; color: string }): PlacedBlock {
  const rect = scene.rect(x, y, w, h, { color: options.color, strokeWidth: 1 });
  const text = scene.text(x + 12, y + 14, label, { size: options.textSize, color: options.color, width: w - 24, align: "center" });
  return new PlacedBlock([rect, text], boundsFor([rect, text]));
}

interface ParsedMermaid {
  direction: "TD" | "TB" | "BT" | "LR" | "RL";
  nodes: Map<string, string>;
  edges: ParsedMermaidEdge[];
}

interface ParsedMermaidEdge {
  from: string;
  to: string;
  label?: string;
  dotted: boolean;
}

function parseMermaid(source: string): ParsedMermaid {
  const nodes = new Map<string, string>();
  const edges: ParsedMermaidEdge[] = [];
  let direction: ParsedMermaid["direction"] = "TD";
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%%")) continue;
    const graph = /^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i.exec(line);
    if (graph) {
      direction = graph[1].toUpperCase() as ParsedMermaid["direction"];
      continue;
    }
    const edge = parseMermaidEdge(line);
    if (!edge) continue;
    setMermaidLabel(nodes, edge.from);
    setMermaidLabel(nodes, edge.to);
    edges.push({ from: edge.from.id, to: edge.to.id, label: edge.label, dotted: edge.dotted });
  }
  return { direction, nodes, edges };
}

function setMermaidLabel(nodes: Map<string, string>, node: MermaidNodeRef): void {
  const existing = nodes.get(node.id);
  if (!existing || existing === node.id || node.label !== node.id) {
    nodes.set(node.id, node.label);
  }
}

function parseMermaidEdge(line: string): { from: MermaidNodeRef; to: MermaidNodeRef; label?: string; dotted: boolean } | null {
  const cleanLine = line.replace(/;$/, "").trim();
  const solidPipeLabel = /^(.+?)\s*-->\|(.+?)\|\s*(.+)$/.exec(cleanLine);
  if (solidPipeLabel) {
    return {
      from: parseMermaidNode(solidPipeLabel[1]),
      to: parseMermaidNode(solidPipeLabel[3]),
      label: stripMermaidQuotes(solidPipeLabel[2]),
      dotted: false,
    };
  }

  const solidLabel = /^(.+?)\s+--\s+(.+?)\s+-->\s+(.+)$/.exec(cleanLine);
  if (solidLabel) {
    return {
      from: parseMermaidNode(solidLabel[1]),
      to: parseMermaidNode(solidLabel[3]),
      label: stripMermaidQuotes(solidLabel[2]),
      dotted: false,
    };
  }

  const dottedLabel = /^(.+?)\s+-\.\s+(.+?)\s+\.->\s+(.+)$/.exec(cleanLine);
  if (dottedLabel) {
    return {
      from: parseMermaidNode(dottedLabel[1]),
      to: parseMermaidNode(dottedLabel[3]),
      label: stripMermaidQuotes(dottedLabel[2]),
      dotted: true,
    };
  }

  const dotted = /^(.+?)\s*-.->\s*(.+)$/.exec(cleanLine);
  if (dotted) {
    return { from: parseMermaidNode(dotted[1]), to: parseMermaidNode(dotted[2]), dotted: true };
  }

  const solid = /^(.+?)\s*-->\s*(.+)$/.exec(cleanLine);
  if (solid) {
    return { from: parseMermaidNode(solid[1]), to: parseMermaidNode(solid[2]), dotted: false };
  }

  return null;
}

interface MermaidNodeRef {
  id: string;
  label: string;
}

function parseMermaidNode(raw: string): MermaidNodeRef {
  const trimmed = raw.trim();
  const shaped = /^([A-Za-z0-9_.$:-]+)\s*(?:\[(.*)\]|\((.*)\)|\{(.*)\})?$/.exec(trimmed);
  if (!shaped) {
    return { id: trimmed, label: trimmed };
  }
  const id = shaped[1];
  const label = stripMermaidQuotes(shaped[2] ?? shaped[3] ?? shaped[4] ?? id);
  return { id, label };
}

function stripMermaidQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function assignLevels(nodes: Map<string, string>, edges: ParsedMermaidEdge[]): string[][] {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of nodes.keys()) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const roots = [...nodes.keys()].filter((id) => (incoming.get(id) ?? 0) === 0);
  const queue: Array<[string, number]> = roots.length > 0
    ? roots.map((id) => [id, 0])
    : [...nodes.keys()].slice(0, 1).map((id) => [id, 0]);
  const seen = new Set<string>();
  const levels: string[][] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const [id, level] = queue[index];
    if (seen.has(id)) continue;
    seen.add(id);
    levels[level] ??= [];
    levels[level].push(id);
    for (const child of outgoing.get(id) ?? []) {
      queue.push([child, level + 1]);
    }
  }
  for (const id of nodes.keys()) {
    if (!seen.has(id)) {
      levels[0] ??= [];
      levels[0].push(id);
    }
  }
  return levels;
}

function mermaidConnectionDirection(direction: ParsedMermaid["direction"]): ConnectionDirection {
  if (direction === "LR") return "left-to-right";
  if (direction === "RL") return "right-to-left";
  if (direction === "BT") return "bottom-up";
  return "top-down";
}

function isHorizontal(direction: ParsedMermaid["direction"]): boolean {
  return direction === "LR" || direction === "RL";
}

function nodeBreadth(direction: ParsedMermaid["direction"], nodeWidth: number, nodeHeight: number): number {
  return isHorizontal(direction) ? nodeHeight : nodeWidth;
}

function nodeDepth(direction: ParsedMermaid["direction"], nodeWidth: number, nodeHeight: number): number {
  return isHorizontal(direction) ? nodeWidth : nodeHeight;
}
