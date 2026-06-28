import { PlacedNodeCard } from "./node.js";
import {
  Bounds,
  ElementLike,
  PlacedBlock,
  PointTuple,
  boundsFor,
  elementBounds,
  inflateBounds,
  polylineIntersectsBounds,
  translate,
} from "./geometry.js";

/**
 * Scene-level validation gate to run before `scene.write(...)`. It reuses the
 * existing geometry primitives (`inflateBounds`, `polylineIntersectsBounds`) to
 * catch the bug class the MVP targets: text outside frames, overlapping
 * blocks/notes, and arrows passing through unrelated blocks. `avoidOverlap` is a
 * small opt-in resolver — never a silent global mutation.
 */

export type Severity = "warn" | "error";

export type ValidationCode =
  | "text-overflow"
  | "text-outside-frame"
  | "block-overlap"
  | "arrow-through-block"
  | "output-clipped";

export interface ValidationIssue {
  code: ValidationCode;
  severity: Severity;
  message: string;
  ids: string[];
}

export interface DiagramBlock {
  id: string;
  bounds: Bounds;
  kind?: "node" | "note";
  overflowed?: boolean;
  /** Text elements expected to live inside the frame (with padding). */
  texts?: ElementLike[];
  /** Inner padding the texts must respect. */
  padding?: number;
}

export interface DiagramEdge {
  id: string;
  points: PointTuple[];
  /** Source/target block ids — these are "related" and never flagged. */
  from?: string;
  to?: string;
  label?: { id: string; bounds: Bounds };
}

export interface ValidateDiagramInput {
  blocks?: DiagramBlock[];
  cards?: PlacedNodeCard[];
  edges?: DiagramEdge[];
  /** Minimum clear space required between blocks. Default 8. */
  gap?: number;
  /** Requested export/render bounds; scene content must fit inside. */
  renderBounds?: Bounds;
  /** Actual content bounds (computed from blocks/edges when omitted). */
  sceneBounds?: Bounds;
  /** Severity for `overflowed` text. Default "warn". */
  overflowSeverity?: Severity;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const EPS = 0.5;

export function validateDiagram(input: ValidateDiagramInput): ValidationResult {
  const gap = input.gap ?? 8;
  const overflowSeverity = input.overflowSeverity ?? "warn";
  const issues: ValidationIssue[] = [];

  const blocks: DiagramBlock[] = [...(input.blocks ?? [])];
  for (const card of input.cards ?? []) {
    blocks.push({
      id: card.id,
      bounds: card.bounds,
      kind: "node",
      overflowed: card.overflowed,
      texts: card.texts,
      padding: 0,
    });
  }

  const edges = input.edges ?? [];
  const labelBlocks: DiagramBlock[] = edges
    .filter((edge) => edge.label)
    .map((edge) => ({ id: edge.label!.id, bounds: edge.label!.bounds, kind: "note" as const }));
  const overlapBlocks = [...blocks, ...labelBlocks];

  // 1. text-overflow
  for (const block of blocks) {
    if (block.overflowed) {
      issues.push({
        code: "text-overflow",
        severity: overflowSeverity,
        message: `block '${block.id}' reports overflowed text`,
        ids: [block.id],
      });
    }
  }

  // 2. text-outside-frame
  for (const block of blocks) {
    if (!block.texts || block.texts.length === 0) {
      continue;
    }
    const inner = inflateBounds(block.bounds, -(block.padding ?? 0));
    for (const text of block.texts) {
      const tb = elementBounds(text);
      if (
        tb.left < inner.left - EPS
        || tb.right > inner.right + EPS
        || tb.top < inner.top - EPS
        || tb.bottom > inner.bottom + EPS
      ) {
        issues.push({
          code: "text-outside-frame",
          severity: "error",
          message: `text in block '${block.id}' extends outside its frame padding`,
          ids: [block.id],
        });
        break;
      }
    }
  }

  // 3. block-overlap (pairwise, after inflating each by gap/2)
  for (let i = 0; i < overlapBlocks.length; i += 1) {
    for (let j = i + 1; j < overlapBlocks.length; j += 1) {
      const a = inflateBounds(overlapBlocks[i].bounds, gap / 2);
      const b = inflateBounds(overlapBlocks[j].bounds, gap / 2);
      if (boundsIntersect(a, b)) {
        issues.push({
          code: "block-overlap",
          severity: "error",
          message: `blocks '${overlapBlocks[i].id}' and '${overlapBlocks[j].id}' overlap (gap ${gap}px not satisfied)`,
          ids: [overlapBlocks[i].id, overlapBlocks[j].id],
        });
      }
    }
  }

  // 4. arrow-through-block (ignore source/target)
  for (const edge of edges) {
    for (const block of blocks) {
      if (block.id === edge.from || block.id === edge.to) {
        continue;
      }
      if (polylineIntersectsBounds(edge.points, block.bounds)) {
        issues.push({
          code: "arrow-through-block",
          severity: "error",
          message: `arrow '${edge.id}' passes through unrelated block '${block.id}'`,
          ids: [edge.id, block.id],
        });
      }
    }
  }

  // 5. output-clipped
  if (input.renderBounds) {
    const sceneBounds = input.sceneBounds ?? contentBounds(overlapBlocks, edges);
    if (sceneBounds && !contains(input.renderBounds, sceneBounds)) {
      issues.push({
        code: "output-clipped",
        severity: "error",
        message: "scene content extends beyond the requested render bounds (output would be clipped)",
        ids: ["scene"],
      });
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warn");
  return { ok: errors.length === 0, issues, errors, warnings };
}

export function assertDiagramHealthy(input: ValidateDiagramInput): ValidationResult {
  const result = validateDiagram(input);
  if (!result.ok) {
    const summary = result.errors.map((issue) => `[${issue.code}] ${issue.message}`).join("\n  ");
    throw new Error(`Diagram validation failed with ${result.errors.length} error(s):\n  ${summary}`);
  }
  return result;
}

export const validate_diagram = validateDiagram;
export const assert_diagram_healthy = assertDiagramHealthy;

export type OverlapKind = "row" | "column" | "note";

export interface OverlapItem {
  id: string;
  block: PlacedBlock;
  /** "row" pushes right, "column"/"note" push down. Default "note". */
  kind?: OverlapKind;
}

export interface AvoidOverlapOptions {
  gap?: number;
  maxPasses?: number;
}

export interface AvoidOverlapResult {
  moved: Array<{ id: string; dx: number; dy: number }>;
}

/**
 * Opt-in overlap resolver for a small set of named blocks/notes. Pushes the
 * later item of an overlapping pair (preserving reading order): rows move right,
 * columns/notes move down. Not a global physics solver.
 */
export function avoidOverlap(items: OverlapItem[], options: AvoidOverlapOptions = {}): AvoidOverlapResult {
  const gap = options.gap ?? 16;
  const maxPasses = options.maxPasses ?? items.length + 2;
  const totals = new Map<string, { dx: number; dy: number }>();

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let movedThisPass = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = inflateBounds(items[i].block.bounds, gap / 2);
        const b = inflateBounds(items[j].block.bounds, gap / 2);
        if (!boundsIntersect(a, b)) {
          continue;
        }
        const kind = items[j].kind ?? "note";
        if (kind === "row") {
          const dx = items[i].block.bounds.right + gap - items[j].block.bounds.left;
          if (dx > EPS) {
            translate(items[j].block, dx, 0);
            accumulate(totals, items[j].id, dx, 0);
            movedThisPass = true;
          }
        } else {
          const dy = items[i].block.bounds.bottom + gap - items[j].block.bounds.top;
          if (dy > EPS) {
            translate(items[j].block, 0, dy);
            accumulate(totals, items[j].id, 0, dy);
            movedThisPass = true;
          }
        }
      }
    }
    if (!movedThisPass) {
      break;
    }
  }

  return {
    moved: [...totals.entries()].map(([id, delta]) => ({ id, dx: delta.dx, dy: delta.dy })),
  };
}

export const avoid_overlap = avoidOverlap;

function accumulate(totals: Map<string, { dx: number; dy: number }>, id: string, dx: number, dy: number): void {
  const current = totals.get(id) ?? { dx: 0, dy: 0 };
  current.dx += dx;
  current.dy += dy;
  totals.set(id, current);
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.left < b.right - EPS && b.left < a.right - EPS && a.top < b.bottom - EPS && b.top < a.bottom - EPS;
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.left >= outer.left - EPS
    && inner.right <= outer.right + EPS
    && inner.top >= outer.top - EPS
    && inner.bottom <= outer.bottom + EPS
  );
}

function contentBounds(blocks: DiagramBlock[], edges: DiagramEdge[]): Bounds | null {
  const boxes: Bounds[] = blocks.map((block) => block.bounds);
  for (const edge of edges) {
    for (const [x, y] of edge.points) {
      boxes.push(new Bounds(x, y, 0, 0));
    }
  }
  if (boxes.length === 0) {
    return null;
  }
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return new Bounds(left, top, right - left, bottom - top);
}
