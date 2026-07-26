// `flow.band` edge compiler: typed relationships, escalating routing and native
// bindings. Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.2)
// — B4, S7, E5, E6, E7, E8 (label pass), R2.
import { SCENE_EPOCH, Scene } from "./core.js";
import {
  Bounds,
  ElementLike,
  PlacedBlock,
  PointTuple,
  boundsFor,
  polylineIntersectsBounds,
  polylineLength,
} from "./geometry.js";
import { connectRouted, resolveLabelCollisions } from "./layout.js";
import type { ConnectOptions, LabelCardObstacle, LabelPlacement } from "./layout.js";
import { resolveSemanticPalette } from "./semantic-palette.js";
import { DiagramDiagnostic, error } from "./semantic-schema.js";
import type { BandEdgeKind, NormalizedBandFlowSpec } from "./semantic-band.js";
import type { RenderedBandLayout } from "./semantic-band-render.js";

type ResolvedPalette = ReturnType<typeof resolveSemanticPalette>;

/** Routing budget (P4): candidates are searched inside the bands the edge touches. */
const ROUTE_BOUNDS_PADDING = 48;
const OBSTACLE_CLEARANCE = 18;
/** Crossing test tolerance: a route legally grazes the shape it starts or ends on. */
const CROSSING_INSET = 2;
const EDGE_LABEL_WIDTH = 180;
const EDGE_LABEL_SIZE = 11;
const SCRATCH_SEED = 1;

/**
 * Routing ladder (P4 budget). Strategies are tried in this fixed order and the first
 * clean one wins; the order is the tie-break, so the same spec always picks the same
 * route. A dense band can make every strategy cross something — see `bestCandidate`.
 */
const ROUTE_LADDER: Array<{ name: string; options: ConnectOptions }> = [
  { name: "auto-in-band", options: { path: "auto" } },
  { name: "auto-scene", options: { path: "auto", routeBounds: undefined } },
  { name: "outer-top", options: { path: "outer", outerSide: "top", outerGap: 28, routeBounds: undefined } },
  { name: "outer-bottom", options: { path: "outer", outerSide: "bottom", outerGap: 28, routeBounds: undefined } },
  { name: "outer-left", options: { path: "outer", outerSide: "left", outerGap: 28, routeBounds: undefined } },
  { name: "orthogonal", options: { path: "orthogonal", routeBounds: undefined } },
  { name: "straight", options: { path: "straight", routeBounds: undefined } },
];

export interface BandEdgeMetadata {
  id: string;
  path: string;
  from: string;
  to: string;
  points: PointTuple[];
  elementIds: string[];
  labelBounds?: Bounds;
  /** Native start and end bindings are guaranteed before the build succeeds (P13/E7). */
  bound: true;
}

/**
 * A route that still crosses something after the whole ladder was tried. The diagram is
 * still produced — an unavoidable crossing is a readability defect, not a broken scene —
 * but the model is told which edge crosses which node, in spec terms.
 */
export interface BandEdgeWarning {
  code: "edge-through-node";
  path: string;
  message: string;
  hint: string;
  ids: string[];
}

export type BandEdgesResult =
  | { ok: true; edges: BandEdgeMetadata[]; warnings: BandEdgeWarning[] }
  | { ok: false; diagnostics: DiagramDiagnostic[] };

export function renderBandEdges(
  scene: Scene,
  spec: NormalizedBandFlowSpec,
  rendered: RenderedBandLayout,
): BandEdgesResult {
  const palette = resolveSemanticPalette(spec.palette);
  const diagnostics: DiagramDiagnostic[] = [];
  const edges: BandEdgeMetadata[] = [];
  const labels: LabelPlacement[] = [];
  const labelElements = new Map<string, ElementLike>();
  const warnings: BandEdgeWarning[] = [];

  const bandOf = new Map(rendered.metadata.nodes.map((node) => [node.id, node.band]));
  const bandBounds = new Map(rendered.metadata.bands.map((band) => [band.index, band.bounds]));

  for (const [index, edge] of spec.edges.entries()) {
    const path = `$.edges[${index}]`;
    const source = rendered.connectBlocks.get(edge.from);
    const target = rendered.connectBlocks.get(edge.to);
    if (!source || !target) {
      // Unreachable through the public entry point: validation already rejects unknown
      // endpoints. Kept explicit so a future caller cannot silently skip an edge.
      diagnostics.push(error(
        "UNKNOWN_EDGE_ENDPOINT",
        path,
        `edge ${edge.from} -> ${edge.to} has no placed endpoint`,
      ));
      continue;
    }

    const obstacles = [
      ...[...rendered.nodeBounds.entries()]
        .filter(([id]) => id !== edge.from && id !== edge.to)
        .map(([id, bounds]) => ({ id, bounds })),
      ...rendered.chromeBounds.map((bounds, chromeIndex) => ({
        id: `caption#${chromeIndex}`,
        bounds,
      })),
    ];
    const style = edgeStyle(edge.kind, palette);
    const baseOptions: ConnectOptions = {
      kind: edge.kind === "provenance" ? "provenance" : edge.kind,
      color: style.color,
      strokeWidth: style.strokeWidth,
      dashed: style.dashed,
      obstacles: obstacles.map((obstacle) => obstacle.bounds),
      clearance: OBSTACLE_CLEARANCE,
      routeBounds: routeBoundsFor(edge.from, edge.to, bandOf, bandBounds),
    };

    const winner = bestCandidate(source, target, baseOptions, obstacles);
    const routed = connectRouted(scene, source, target, {
      ...baseOptions,
      ...winner.options,
      bindings: true,
      ...(edge.label
        ? {
            label: edge.label,
            labelWidth: EDGE_LABEL_WIDTH,
            labelSize: EDGE_LABEL_SIZE,
            labelColor: palette.swimlane.neutral,
            labelOnLine: true,
          }
        : {}),
    });

    // E5 (revision 1.2): the ladder is exhausted, not the diagram. A crossing that no
    // strategy avoids is reported as a readability warning naming the blocked pair, and
    // the scene is still produced — refusing to draw would be worse than drawing this.
    if (winner.crossed.length > 0) {
      warnings.push({
        code: "edge-through-node",
        path,
        message: `edge ${edge.from} -> ${edge.to} crosses ${winner.crossed.join(", ")}`
          + ` — all ${ROUTE_LADDER.length} routing strategies were tried`,
        hint: "Move one endpoint to another stage or lane, or split the stage, to open a corridor.",
        ids: [edge.from, edge.to, ...winner.crossed],
      });
    }

    const elements: ElementLike[] = [routed.arrow];
    if (routed.label) {
      elements.push(routed.label);
      labels.push({ element: routed.label, points: routed.points, ownerIds: [edge.from, edge.to] });
      labelElements.set(edge.id, routed.label);
    }
    edges.push({
      id: edge.id,
      path,
      from: edge.from,
      to: edge.to,
      points: routed.points,
      elementIds: elements.map((element) => String(element.id)),
      bound: true,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  // E8: separating labels is the compiler's job, not the caller's. Cards carry their own
  // text bounds so a label never lands on a node's title.
  const cards: LabelCardObstacle[] = [...rendered.nodeBounds.entries()].map(([id, bounds]) => ({
    id,
    bounds,
    textBounds: rendered.nodeTextBounds.get(id) ?? [],
  }));
  resolveLabelCollisions(labels, { cards });
  for (const edge of edges) {
    const label = labelElements.get(edge.id);
    if (label) {
      edge.labelBounds = boundsFor([label]);
    }
  }

  return { ok: true, edges, warnings };
}

interface RouteObstacle {
  id: string;
  bounds: Bounds;
}

/**
 * Walks the whole ladder on a scratch scene (no elements are added to the real one) and
 * returns the **shortest clean** route rather than the first clean one: the first
 * strategy often succeeds by detouring around the entire drawing, which is technically
 * clean and visually terrible. If nothing is clean, the least-bad route wins: fewest
 * crossings, then shortest. Ladder order is the final tie-break, so the choice is
 * reproducible.
 */
function bestCandidate(
  source: PlacedBlock,
  target: PlacedBlock,
  baseOptions: ConnectOptions,
  obstacles: RouteObstacle[],
): { options: ConnectOptions; crossed: string[] } {
  let best: { options: ConnectOptions; crossed: string[]; length: number } | null = null;
  for (const step of ROUTE_LADDER) {
    // Geometry does not depend on the seed, and the scratch elements are thrown away —
    // the real scene never sees a losing candidate.
    const scratch = new Scene({ seed: SCRATCH_SEED, now: SCENE_EPOCH, assetRegistry: null });
    let points: PointTuple[];
    try {
      points = connectRouted(scratch, source, target, {
        ...baseOptions,
        ...step.options,
        bindings: false,
      }).points;
    } catch {
      continue;
    }
    const crossed = obstacles
      .filter((obstacle) => polylineIntersectsBounds(points, inset(obstacle.bounds, CROSSING_INSET)))
      .map((obstacle) => obstacle.id);
    const length = polylineLength(points);
    if (
      best === null
      || crossed.length < best.crossed.length
      || (crossed.length === best.crossed.length && length < best.length)
    ) {
      best = { options: step.options, crossed, length };
    }
  }
  return best ?? { options: ROUTE_LADDER[0].options, crossed: [] };
}

/** S7: kind is semantics; the stroke only makes the semantics visible. */
function edgeStyle(
  kind: BandEdgeKind,
  palette: ResolvedPalette,
): { color: string; strokeWidth: number; dashed: boolean } {
  switch (kind) {
    case "provenance":
      return { color: palette.swimlane.neutral, strokeWidth: 1, dashed: true };
    case "feedback":
      return { color: palette.swimlane.accent, strokeWidth: 2, dashed: true };
    default:
      return { color: palette.swimlane.primary, strokeWidth: 2, dashed: false };
  }
}

/**
 * E6: the compiler builds the bands, so it knows where the free corridors are. It cannot
 * hand named gutters to the router — the candidate list is internal — but it can confine
 * the search to the bands the edge actually touches, which is what turns a detour around
 * the whole scene into a detour through the nearest gutter.
 */
function routeBoundsFor(
  from: string,
  to: string,
  bandOf: Map<string, number>,
  bandBounds: Map<number, Bounds>,
): Bounds | undefined {
  const first = bandBounds.get(bandOf.get(from) ?? -1);
  const second = bandBounds.get(bandOf.get(to) ?? -1);
  if (!first || !second) {
    return undefined;
  }
  const union = boundsFor([boundsElement(first), boundsElement(second)]);
  return new Bounds(
    union.x - ROUTE_BOUNDS_PADDING,
    union.y - ROUTE_BOUNDS_PADDING,
    union.width + ROUTE_BOUNDS_PADDING * 2,
    union.height + ROUTE_BOUNDS_PADDING * 2,
  );
}

function boundsElement(bounds: Bounds): ElementLike {
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function inset(bounds: Bounds, padding: number): Bounds {
  return new Bounds(
    bounds.x + padding,
    bounds.y + padding,
    Math.max(1, bounds.width - padding * 2),
    Math.max(1, bounds.height - padding * 2),
  );
}
