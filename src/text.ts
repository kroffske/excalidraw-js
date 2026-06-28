import { Scene } from "./core.js";
import { Bounds, ElementLike, PlacedBlock, boundsFor } from "./geometry.js";

/**
 * Measured-text primitive. Unlike `Scene.text` / `measureText` (which only
 * break on explicit `\n`), `fitText` performs real word/token wrapping for a
 * given width, then applies the sizing policy from the MVP contract:
 *
 *   1. grow height by wrapping up to `maxLines`,
 *   2. shrink the font toward `minSize`,
 *   3. then `ellipsis` / `shrink` / `error` according to `overflow`.
 *
 * It is intentionally additive: `Scene.text` and `bulletList` semantics are
 * unchanged.
 */

export type TextOverflow = "ellipsis" | "shrink" | "error";

/** Matches the per-character width approximation used by `measureText`. */
export const CHAR_WIDTH_RATIO = 0.62;
const DEFAULT_LINE_HEIGHT = 1.22;
const DEFAULT_SIZE = 18;
const ELLIPSIS = "…";

/** Delimiters used to break long code identifiers before falling back to a
 * hard character break. The delimiter stays attached to the preceding chunk so
 * wraps read naturally (`approve_batch_…` → `approve_`, `batch_`, …). */
const SINGLE_CHAR_DELIMITERS = new Set(["_", ".", "/", "-", "→"]);

export interface FitTextOptions {
  /** Available width in px (hard max line width). Required. */
  width: number;
  /** Grow height up to this many lines before shrinking the font. */
  maxLines?: number;
  /** Preferred font size. */
  size?: number;
  /** Smallest font size the text may shrink to before overflow handling. */
  minSize?: number;
  lineHeight?: number;
  /** Behaviour when the text still does not fit at `minSize`/`maxLines`. */
  overflow?: TextOverflow;
  /** Domain id (node/text id) surfaced in warnings and thrown errors. */
  id?: string;
  family?: number;
}

export interface FittedText {
  /** Wrapped text with `\n` line breaks. */
  text: string;
  lines: string[];
  /** Final font size after any shrink. */
  size: number;
  /** Measured width of the longest line (≤ `options.width`). */
  width: number;
  height: number;
  lineHeight: number;
  /** True when the content could not fit within `maxLines` at `minSize`. */
  overflowed: boolean;
  warnings: string[];
}

export interface TextBoxOptions extends FitTextOptions {
  color?: string;
  align?: string;
  valign?: string;
}

export interface PlacedTextBox {
  element: ElementLike;
  block: PlacedBlock;
  bounds: Bounds;
  fitted: FittedText;
  overflowed: boolean;
  warnings: string[];
}

export function fitText(content: string, options: FitTextOptions): FittedText {
  const width = options.width;
  if (!(width > 0)) {
    throw new Error(`fitText requires a positive width${idSuffix(options.id)} (got ${String(width)})`);
  }
  const lineHeight = options.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const maxLines = options.maxLines !== undefined ? Math.max(1, Math.trunc(options.maxLines)) : Number.POSITIVE_INFINITY;
  const preferredSize = options.size ?? DEFAULT_SIZE;
  const minSize = Math.max(1, Math.min(options.minSize ?? preferredSize, preferredSize));
  const overflow = options.overflow ?? "shrink";

  let size = preferredSize;
  let lines = wrapText(content, width, size);
  while (lines.length > maxLines && size > minSize) {
    size -= 1;
    lines = wrapText(content, width, size);
  }

  const warnings: string[] = [];
  let overflowed = false;

  if (lines.length > maxLines) {
    overflowed = true;
    if (overflow === "error") {
      throw new Error(
        `fitText overflow${idSuffix(options.id)}: needs ${lines.length} line(s) at minSize ${minSize}px `
        + `but maxLines is ${maxLines} for width ${width}px`,
      );
    }
    if (overflow === "ellipsis") {
      lines = ellipsize(lines, maxLines, width, size);
      warnings.push(`text${idSuffix(options.id)} truncated to ${maxLines} line(s) with ellipsis`);
    } else {
      warnings.push(
        `text${idSuffix(options.id)} overflows maxLines ${maxLines} (needs ${lines.length}) at minSize ${minSize}px`,
      );
    }
  }

  const measuredWidth = lines.reduce((max, line) => Math.max(max, approxWidth(line, size)), 0);
  const height = lines.length * size * lineHeight;
  return {
    text: lines.join("\n"),
    lines,
    size,
    width: measuredWidth,
    height,
    lineHeight,
    overflowed,
    warnings,
  };
}

export function textBox(scene: Scene, x: number, y: number, content: string, options: TextBoxOptions): PlacedTextBox {
  const fitted = fitText(content, options);
  const element = scene.text(x, y, fitted.text, {
    size: fitted.size,
    color: options.color,
    width: options.width,
    align: options.align,
    valign: options.valign,
    family: options.family,
    lineHeight: fitted.lineHeight,
  });
  const block = new PlacedBlock([element], boundsFor([element]));
  return { element, block, bounds: block.bounds, fitted, overflowed: fitted.overflowed, warnings: fitted.warnings };
}

export const fit_text = fitText;
export const text_box = textBox;

function approxWidth(text: string, size: number): number {
  return text.length * size * CHAR_WIDTH_RATIO;
}

function maxCharsForWidth(width: number, size: number): number {
  return Math.max(1, Math.floor(width / (size * CHAR_WIDTH_RATIO)));
}

function wrapText(content: string, width: number, size: number): string[] {
  const paragraphs = content.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) {
      lines.push("");
      continue;
    }
    lines.push(...wrapParagraph(paragraph, width, size));
  }
  return lines.length > 0 ? lines : [""];
}

function wrapParagraph(paragraph: string, width: number, size: number): string[] {
  const maxChars = maxCharsForWidth(width, size);
  const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }
      const tokenLines = wrapLongToken(word, maxChars);
      lines.push(...tokenLines.slice(0, -1));
      current = tokenLines[tokenLines.length - 1] ?? "";
      continue;
    }
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function wrapLongToken(token: string, maxChars: number): string[] {
  const pieces = splitToken(token).flatMap((piece) => (piece.length <= maxChars ? [piece] : hardBreak(piece, maxChars)));
  const lines: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current.length === 0) {
      current = piece;
    } else if (current.length + piece.length <= maxChars) {
      current += piece;
    } else {
      lines.push(current);
      current = piece;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [token];
}

function splitToken(token: string): string[] {
  const pieces: string[] = [];
  let buffer = "";
  let index = 0;
  while (index < token.length) {
    if (token.startsWith("::", index)) {
      buffer += "::";
      pieces.push(buffer);
      buffer = "";
      index += 2;
      continue;
    }
    const char = token[index];
    buffer += char;
    if (SINGLE_CHAR_DELIMITERS.has(char)) {
      pieces.push(buffer);
      buffer = "";
    }
    index += 1;
  }
  if (buffer.length > 0) {
    pieces.push(buffer);
  }
  return pieces.filter((piece) => piece.length > 0);
}

function hardBreak(value: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let index = 0; index < value.length; index += maxChars) {
    out.push(value.slice(index, index + maxChars));
  }
  return out.length > 0 ? out : [value];
}

function ellipsize(lines: string[], maxLines: number, width: number, size: number): string[] {
  const maxChars = maxCharsForWidth(width, size);
  const kept = lines.slice(0, maxLines);
  let last = kept[kept.length - 1] ?? "";
  if (last.length + ELLIPSIS.length > maxChars) {
    last = last.slice(0, Math.max(0, maxChars - ELLIPSIS.length));
  }
  kept[kept.length - 1] = `${last.replace(/\s+$/, "")}${ELLIPSIS}`;
  return kept;
}

function idSuffix(id?: string): string {
  return id ? ` [${id}]` : "";
}
