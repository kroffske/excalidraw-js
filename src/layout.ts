import * as assets from "./assets.js";
import { BLUE, GRAY, Scene, measureText } from "./core.js";
import {
  Bounds,
  ElementLike,
  PlacedBlock,
  alignBottom,
  alignCenter,
  alignLeft,
  alignMiddle,
  alignRight,
  alignTop,
  boundsFor,
  centerIn,
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
export type EdgeKind = "primary" | "secondary" | "feedback" | "annotation";
export type ConnectionDirection =
  | "left-to-right"
  | "right-to-left"
  | "top-down"
  | "bottom-up"
  | "lr"
  | "rl"
  | "td"
  | "bt";
export type ConnectionPath = "straight" | "orthogonal";
export type ConnectionEndpoint = ConnectionSide | ConnectionPort;

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
}

export function connect(scene: Scene, source: PlacedBlock, target: PlacedBlock, options: ConnectOptions = {}): ElementLike {
  const ports = connectionPorts(options);
  const points = connectionPoints(source.bounds, target.bounds, ports.from, ports.to, options.path ?? "straight");
  return scene.arrow(points, {
    color: options.color ?? BLUE,
    strokeWidth: options.strokeWidth ?? options.stroke_width ?? 2,
    dashed: options.dashed ?? options.kind === "feedback",
  });
}

export function connectSmart(scene: Scene, source: PlacedBlock, target: PlacedBlock, options: ConnectOptions = {}): ElementLike {
  const direction = options.direction ?? inferDirection(source.bounds, target.bounds);
  return connect(scene, source, target, { path: "orthogonal", ...options, direction });
}

export const connect_smart = connectSmart;

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
}

export interface TreeDiagram {
  nodes: Record<string, PlacedBlock>;
  primaryEdges: TreePrimaryEdge[];
  primary_edges: TreePrimaryEdge[];
  primaryConnectors: ElementLike[];
  primary_connectors: ElementLike[];
  secondaryEdges: RoutedEdge[];
  secondary_edges: RoutedEdge[];
  bounds: Bounds;
}

interface MeasuredTreeNode {
  spec: TreeNodeSpec;
  block: PlacedBlock;
  depth: number;
  children: MeasuredTreeNode[];
  subtreeWidth: number;
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
  const secondaryEdges = routeEdges(scene, { nodes, bounds: boundsFor(primaryElements) }, spec.secondaryEdges ?? spec.secondary_edges ?? []);
  const elements = [
    ...primaryElements,
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
    bounds: boundsFor(elements),
  };
}

export const layout_tree = tree;

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
  const lanesSeen = { leftOuter: 0, rightOuter: 0 };
  return edges.map((edge) => {
    const source = diagram.nodes[edge.from];
    const target = diagram.nodes[edge.to];
    if (!source) {
      throw new Error("Secondary edge source '" + edge.from + "' was not found in tree nodes");
    }
    if (!target) {
      throw new Error("Secondary edge target '" + edge.to + "' was not found in tree nodes");
    }

    const lane = resolveSecondaryLane(edge, source, treeBounds);
    const laneIndex = lanesSeen[lane]++;
    const gutter = options.gutter ?? 48;
    const gutterStep = options.gutterStep ?? options.gutter_step ?? 16;
    const gutterX = lane === "leftOuter"
      ? treeBounds.left - gutter - laneIndex * gutterStep
      : treeBounds.right + gutter + laneIndex * gutterStep;
    const side: ConnectionSide = lane === "leftOuter" ? "left" : "right";
    const start = anchor(source.bounds, { side, slot: 0.65 });
    const targetAboveSource = target.bounds.centerY <= source.bounds.centerY;
    const bandY = targetAboveSource ? treeBounds.top - gutter : treeBounds.bottom + gutter;
    const end = anchor(target.bounds, { side: targetAboveSource ? "top" : "bottom" });
    const kind = edge.kind ?? "secondary";
    const arrow = scene.arrow([start, [gutterX, start[1]], [gutterX, bandY], [end[0], bandY], end], {
      color: options.color ?? GRAY,
      strokeWidth: options.strokeWidth ?? options.stroke_width ?? 1.5,
      dashed: kind !== "primary",
    });
    const label = edge.label ? secondaryEdgeLabel(scene, edge.label, gutterX, bandY, lane, options.color ?? GRAY) : undefined;
    return { from: edge.from, to: edge.to, kind, arrow, label, lane };
  });
}

export const route_edges = routeEdges;

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
  }
}

function resolveSecondaryLane(edge: SecondaryEdgeSpec, source: PlacedBlock, treeBounds: Bounds): Exclude<SecondaryEdgeLane, "auto"> {
  if (edge.lane === "leftOuter" || edge.lane === "rightOuter") {
    return edge.lane;
  }
  return source.bounds.centerX <= treeBounds.centerX ? "leftOuter" : "rightOuter";
}

function secondaryEdgeLabel(
  scene: Scene,
  text: string,
  gutterX: number,
  centerY: number,
  lane: Exclude<SecondaryEdgeLane, "auto">,
  color: string,
): ElementLike {
  const width = 96;
  const x = lane === "leftOuter" ? gutterX - width - 8 : gutterX + 8;
  return scene.text(x, centerY - 8, text, {
    size: 12,
    color,
    width,
    align: lane === "leftOuter" ? "right" : "left",
  });
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

function connectionPoints(source: Bounds, target: Bounds, from: ConnectionPort, to: ConnectionPort, path: ConnectionPath): Array<[number, number]> {
  const start = anchor(source, from);
  const end = anchor(target, to);
  if (path === "straight") {
    return [start, end];
  }
  if (from.side === "left" || from.side === "right" || to.side === "left" || to.side === "right") {
    const midX = (start[0] + end[0]) / 2;
    return [start, [midX, start[1]], [midX, end[1]], end];
  }
  const midY = (start[1] + end[1]) / 2;
  return [start, [start[0], midY], [end[0], midY], end];
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
