import { measureText } from "./core.js";
import { ColorRole } from "./colors.js";
import { FittedText, TextOverflow, fitText } from "./text.js";

export interface ContentCardRow {
  text: string;
  id?: string;
  role?: ColorRole;
  color?: ColorRole | string;
  size?: number;
  minSize?: number;
  maxLines?: number;
  overflow?: TextOverflow;
}

export interface FitCardOptions {
  id: string;
  title?: string;
  rows?: ContentCardRow[];
  width?: number;
  preferredWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  padding?: number;
  titleSize?: number;
  titleMinSize?: number;
  titleMaxLines?: number;
  rowSize?: number;
  rowMinSize?: number;
  rowMaxLines?: number;
  titleGap?: number;
  rowGap?: number;
  strict?: boolean;
  iconId?: string | null;
  iconSize?: number;
  iconGap?: number;
  overflow?: TextOverflow;
}

export interface FittedCardLine {
  kind: "title" | "row";
  source: ContentCardRow;
  fitted: FittedText;
  x: number;
  y: number;
  availableWidth: number;
}

export interface FittedCard {
  id: string;
  width: number;
  height: number;
  padding: number;
  innerWidth: number;
  title: FittedCardLine | null;
  rows: FittedCardLine[];
  overflowed: boolean;
  warnings: string[];
}

const DEFAULT_MIN_WIDTH = 120;
const DEFAULT_MAX_WIDTH = 420;
const EPS = 0.5;

export function fitCard(options: FitCardOptions): FittedCard {
  const padding = options.padding ?? 16;
  const rows = options.rows ?? [];
  const titleText = options.title?.trim().length ? options.title : null;
  const titleSize = options.titleSize ?? 17;
  const rowSize = options.rowSize ?? 13;
  const iconId = options.iconId ?? null;
  const iconSize = options.iconSize ?? 0;
  const iconGap = iconId ? (options.iconGap ?? 12) : 0;
  const iconSpace = iconId ? iconSize + iconGap : 0;
  const naturalContentWidth = Math.max(
    titleText ? measureText(titleText, { size: titleSize }).width + iconSpace : 0,
    ...rows.map((row) => measureText(row.text, { size: row.size ?? rowSize }).width),
    1,
  );
  const width = chooseCardWidth(naturalContentWidth + padding * 2, options);
  const innerWidth = Math.max(1, width - padding * 2);
  const titleWidth = Math.max(1, innerWidth - iconSpace);
  const warnings: string[] = [];
  let overflowed = false;
  let cursorY = padding;

  let title: FittedCardLine | null = null;
  if (titleText) {
    const fitted = fitText(titleText, {
      id: `${options.id}.title`,
      width: titleWidth,
      size: titleSize,
      minSize: options.titleMinSize ?? Math.min(titleSize, 13),
      maxLines: options.titleMaxLines ?? 2,
      overflow: options.overflow ?? "shrink",
    });
    overflowed = overflowed || fitted.overflowed || fitted.width > titleWidth + EPS;
    warnings.push(...fitted.warnings);
    title = {
      kind: "title",
      source: { text: titleText },
      fitted,
      x: padding + iconSpace,
      y: cursorY,
      availableWidth: titleWidth,
    };
    cursorY += Math.max(iconId ? iconSize : 0, fitted.height);
    if (rows.length > 0) {
      cursorY += options.titleGap ?? options.rowGap ?? 8;
    }
  }

  const fittedRows: FittedCardLine[] = [];
  for (const [index, row] of rows.entries()) {
    const size = row.size ?? rowSize;
    const fitted = fitText(row.text, {
      id: row.id ?? `${options.id}.row[${index}]`,
      width: innerWidth,
      size,
      minSize: row.minSize ?? options.rowMinSize ?? Math.min(size, 11),
      maxLines: row.maxLines ?? options.rowMaxLines,
      overflow: row.overflow ?? options.overflow ?? "shrink",
    });
    overflowed = overflowed || fitted.overflowed || fitted.width > innerWidth + EPS;
    warnings.push(...fitted.warnings);
    fittedRows.push({
      kind: "row",
      source: row,
      fitted,
      x: padding,
      y: cursorY,
      availableWidth: innerWidth,
    });
    cursorY += fitted.height;
    if (index < rows.length - 1) {
      cursorY += options.rowGap ?? 8;
    }
  }

  let height = cursorY + padding;
  if (title && rows.length === 0) {
    height = Math.max(height, padding * 2 + Math.max(iconId ? iconSize : 0, title.fitted.height));
  }
  height = Math.max(height, options.minHeight ?? 1);
  if (options.maxHeight !== undefined && height > options.maxHeight + EPS) {
    overflowed = true;
    warnings.push(
      `card [${options.id}] content needs ${Math.ceil(height)}px height but maxHeight is ${options.maxHeight}px`,
    );
  }
  if (options.strict && overflowed) {
    throw new Error(
      `fitCard [${options.id}] strict: content does not fit inside ${width}px card`
      + (options.maxHeight ? ` / ${options.maxHeight}px max height` : "")
      + ` (${warnings.join("; ") || "see fitted rows"})`,
    );
  }

  return {
    id: options.id,
    width,
    height,
    padding,
    innerWidth,
    title,
    rows: fittedRows,
    overflowed,
    warnings,
  };
}

export const fit_card = fitCard;

function chooseCardWidth(naturalWidth: number, options: FitCardOptions): number {
  const fixedWidth = options.width;
  if (fixedWidth !== undefined) {
    return positiveWidth(fixedWidth, options.id);
  }
  const maxWidth = positiveWidth(options.maxWidth ?? DEFAULT_MAX_WIDTH, options.id);
  const minWidth = Math.min(maxWidth, positiveWidth(options.minWidth ?? DEFAULT_MIN_WIDTH, options.id));
  const target = options.preferredWidth !== undefined
    ? Math.min(positiveWidth(options.preferredWidth, options.id), naturalWidth)
    : naturalWidth;
  return Math.ceil(Math.max(minWidth, Math.min(maxWidth, target)));
}

function positiveWidth(value: number, id: string): number {
  if (!(value > 0)) {
    throw new Error(`fitCard [${id}] requires positive widths (got ${String(value)})`);
  }
  return value;
}
