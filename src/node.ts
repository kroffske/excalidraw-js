import * as assets from "./assets.js";
import { Scene } from "./core.js";
import { ColorRole, resolveColor } from "./colors.js";
import { Bounds, ElementLike, PlacedBlock, boundsFor } from "./geometry.js";
import { FittedText, fitText } from "./text.js";

/**
 * `nodeCard` — a real, grouped node primitive: `rect + title + icon + bullets`
 * with shared `groupIds` and named anchors. Replaces hand composition so each
 * generated text lies inside the frame (with padding) by construction. It emits
 * ordinary Excalidraw `rectangle` / `text` / `image` elements (never a
 * flattened SVG) so the card stays editable and moves as one group.
 */

export type NodeSide = "top" | "right" | "bottom" | "left";

export interface NodePortSpec {
  side: NodeSide;
  /** 0..1 position along the side; defaults to 0.5 (centered). */
  slot?: number;
}

export interface NodeCardSpec {
  id: string;
  title: string;
  iconId?: string;
  icon_id?: string;
  bullets?: string[];
  x?: number;
  y?: number;
  /** Preferred width (contract: 280–360, hard max ~420). Default 320. */
  width?: number;
  color?: ColorRole | string;
  /** Throw when any text overflows even after shrink to minSize. */
  strict?: boolean;
  padding?: number;
  titleSize?: number;
  titleMinSize?: number;
  titleMaxLines?: number;
  bulletSize?: number;
  bulletMaxLines?: number;
  bulletGap?: number;
  iconSize?: number;
  /** Named anchor ports in addition to the implicit side/center anchors. */
  ports?: Record<string, NodePortSpec>;
}

export interface PlacedNodeCard {
  id: string;
  block: PlacedBlock;
  bounds: Bounds;
  frame: ElementLike;
  texts: ElementLike[];
  icon: ElementLike | null;
  groupId: string;
  anchors: Record<string, [number, number]>;
  overflowed: boolean;
  warnings: string[];
}

export function nodeCard(scene: Scene, spec: NodeCardSpec): PlacedNodeCard {
  const x = spec.x ?? 0;
  const y = spec.y ?? 0;
  const width = spec.width ?? 320;
  const padding = spec.padding ?? 16;
  const color = resolveColor(spec.color, undefined);
  const iconId = spec.iconId ?? spec.icon_id;
  const iconSize = spec.iconSize ?? 36;
  const headerGap = 12;
  const bulletGap = spec.bulletGap ?? 8;
  const innerWidth = Math.max(40, width - padding * 2);

  const warnings: string[] = [];
  let overflowed = false;

  const titleWidth = iconId ? Math.max(40, innerWidth - iconSize - headerGap) : innerWidth;
  const titleFit = fitText(spec.title, {
    width: titleWidth,
    size: spec.titleSize ?? 17,
    minSize: spec.titleMinSize ?? 13,
    maxLines: spec.titleMaxLines ?? 2,
    overflow: "shrink",
    id: `${spec.id}.title`,
  });
  overflowed = overflowed || titleFit.overflowed;
  warnings.push(...titleFit.warnings);

  const elements: ElementLike[] = [];
  const texts: ElementLike[] = [];
  const frame = scene.rect(x, y, width, 10, { color, strokeWidth: 1 });
  elements.push(frame);

  let icon: ElementLike | null = null;
  const titleX = iconId ? x + padding + iconSize + headerGap : x + padding;
  if (iconId) {
    icon = assets.place(scene, iconId, x + padding, y + padding, iconSize);
    elements.push(icon);
  }
  const titleElement = scene.text(titleX, y + padding, titleFit.text, {
    size: titleFit.size,
    color: color ?? undefined,
    width: titleWidth,
    lineHeight: titleFit.lineHeight,
  });
  elements.push(titleElement);
  texts.push(titleElement);

  const headerHeight = Math.max(iconId ? iconSize : 0, titleFit.height);
  let cursorY = y + padding + headerHeight;

  const bullets = spec.bullets ?? [];
  for (const [index, bullet] of bullets.entries()) {
    cursorY += bulletGap;
    const bulletFit: FittedText = fitText(`- ${bullet}`, {
      width: innerWidth,
      size: spec.bulletSize ?? 13,
      minSize: Math.min(spec.bulletSize ?? 13, 11),
      maxLines: spec.bulletMaxLines ?? 2,
      overflow: "shrink",
      id: `${spec.id}.bullet[${index}]`,
    });
    overflowed = overflowed || bulletFit.overflowed;
    warnings.push(...bulletFit.warnings);
    const bulletElement = scene.text(x + padding, cursorY, bulletFit.text, {
      size: bulletFit.size,
      color: color ?? undefined,
      width: innerWidth,
      lineHeight: bulletFit.lineHeight,
    });
    elements.push(bulletElement);
    texts.push(bulletElement);
    cursorY += bulletFit.height;
  }

  const finalHeight = cursorY + padding - y;
  frame.height = finalHeight;

  const groupBlock = scene.group(elements);
  const bounds = boundsFor(elements);
  groupBlock.bounds = bounds;
  const groupIds = Array.isArray(frame.groupIds) ? (frame.groupIds as string[]) : [];
  const groupId = groupIds[groupIds.length - 1] ?? "";

  if (spec.strict && overflowed) {
    throw new Error(
      `nodeCard [${spec.id}] strict: text overflows the card at width ${width}px `
      + `(${warnings.join("; ") || "see fitted text"})`,
    );
  }

  const anchors = buildAnchors(bounds, spec.ports);

  return {
    id: spec.id,
    block: groupBlock,
    bounds,
    frame,
    texts,
    icon,
    groupId,
    anchors,
    overflowed,
    warnings,
  };
}

export const node_card = nodeCard;

function buildAnchors(bounds: Bounds, ports?: Record<string, NodePortSpec>): Record<string, [number, number]> {
  const anchors: Record<string, [number, number]> = {
    top: [bounds.centerX, bounds.top],
    right: [bounds.right, bounds.centerY],
    bottom: [bounds.centerX, bounds.bottom],
    left: [bounds.left, bounds.centerY],
    center: [bounds.centerX, bounds.centerY],
  };
  if (ports) {
    for (const [name, port] of Object.entries(ports)) {
      anchors[name] = anchorPoint(bounds, port);
    }
  }
  return anchors;
}

function anchorPoint(bounds: Bounds, port: NodePortSpec): [number, number] {
  const slot = Math.min(1, Math.max(0, port.slot ?? 0.5));
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
