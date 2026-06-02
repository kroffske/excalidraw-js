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

export function connect(scene: Scene, source: PlacedBlock, target: PlacedBlock, options: { color?: string } = {}): ElementLike {
  return scene.arrow([[source.bounds.right, source.bounds.centerY], [target.bounds.left, target.bounds.centerY]], { color: options.color ?? BLUE });
}
