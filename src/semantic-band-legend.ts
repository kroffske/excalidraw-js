// Auto legend for `flow.band`. Contract: docs/system-design/flow-band/flow-band-contract.md
// — B5, S11. The author says `"auto"` or `"none"`; what goes in and where it sits is the
// engine's call, because the composition is derivable from what the diagram actually uses.
import { Scene } from "./core.js";
import { Bounds, ElementLike, PointTuple, boundsFor } from "./geometry.js";
import { resolveSemanticPalette } from "./semantic-palette.js";
import type { SemanticStatus } from "./semantic-palette.js";
import {
  BAND_EDGE_KINDS,
  BAND_NODE_TYPES,
  BandEdgeKind,
  BandNodeType,
  NormalizedBandFlowSpec,
} from "./semantic-band.js";

type ResolvedPalette = ReturnType<typeof resolveSemanticPalette>;

const LEGEND_GAP = 56;
const LEGEND_PADDING = 20;
const LEGEND_ROW_HEIGHT = 30;
const LEGEND_SWATCH_WIDTH = 36;
const LEGEND_SWATCH_HEIGHT = 18;
const LEGEND_LABEL_GAP = 14;
const LEGEND_WIDTH = 300;
const LEGEND_TITLE_HEIGHT = 26;

/** Standard wording lives in the library so two diagrams never name the same thing twice. */
const NODE_TYPE_LABELS: Record<BandNodeType, string> = {
  actor: "External actor",
  agent: "Agent session",
  artifact: "Artifact",
  decision: "Decision",
  step: "Step",
};

const EDGE_KIND_LABELS: Record<BandEdgeKind, string> = {
  primary: "Primary flow",
  provenance: "Provenance",
  feedback: "Feedback",
};

const STATUS_LABELS: Record<SemanticStatus, string> = {
  added: "Added",
  changed: "Changed",
  removed: "Removed",
  risk: "Risk",
};

export interface RenderedLegend {
  bounds: Bounds;
  elementIds: string[];
  entries: string[];
}

/**
 * S11: entries are the archetypes actually used (in enum order), then the edge kinds used,
 * then the statuses used. Nothing that does not appear in the diagram is explained.
 */
export function legendEntries(spec: NormalizedBandFlowSpec): string[] {
  const usedTypes = new Set(spec.nodes.map((node) => node.type));
  const usedKinds = new Set(spec.edges.map((edge) => edge.kind));
  const usedStatuses = new Set(
    spec.nodes.map((node) => node.status).filter((status): status is SemanticStatus => Boolean(status)),
  );
  return [
    ...BAND_NODE_TYPES.filter((type) => usedTypes.has(type)).map((type) => NODE_TYPE_LABELS[type]),
    ...BAND_EDGE_KINDS.filter((kind) => usedKinds.has(kind)).map((kind) => EDGE_KIND_LABELS[kind]),
    ...(["added", "changed", "removed", "risk"] as const)
      .filter((status) => usedStatuses.has(status))
      .map((status) => STATUS_LABELS[status]),
  ];
}

/**
 * Drawn under the last band rather than beside it: a side legend competes with the ribbon
 * for the scene width gate (E4), and the ribbon is the content.
 */
export function renderBandLegend(
  scene: Scene,
  spec: NormalizedBandFlowSpec,
  bands: Array<{ bounds: Bounds }>,
): RenderedLegend | undefined {
  if (spec.legend === "none") {
    return undefined;
  }
  const entries = legendEntries(spec);
  if (entries.length === 0) {
    return undefined;
  }
  const palette = resolveSemanticPalette(spec.palette);
  const usedTypes = new Set(spec.nodes.map((node) => node.type));
  const usedKinds = new Set(spec.edges.map((edge) => edge.kind));

  const last = bands[bands.length - 1]?.bounds;
  const x = last ? last.x : 64;
  const y = last ? last.y + last.height + LEGEND_GAP : 132;
  const height = LEGEND_PADDING * 2 + LEGEND_TITLE_HEIGHT + entries.length * LEGEND_ROW_HEIGHT;

  const elements: ElementLike[] = [
    scene.rect(x, y, LEGEND_WIDTH, height, {
      color: palette.swimlane.neutral,
      strokeWidth: 1,
      dashed: true,
    }),
    scene.text(x + LEGEND_PADDING, y + LEGEND_PADDING, "Legend", {
      size: 15,
      color: palette.swimlane.primary,
      width: LEGEND_WIDTH - LEGEND_PADDING * 2,
    }),
  ];

  let rowY = y + LEGEND_PADDING + LEGEND_TITLE_HEIGHT;
  for (const type of BAND_NODE_TYPES.filter((candidate) => usedTypes.has(candidate))) {
    elements.push(...swatchForType(scene, type, x + LEGEND_PADDING, rowY, palette));
    elements.push(legendLabel(scene, NODE_TYPE_LABELS[type], x, rowY, palette));
    rowY += LEGEND_ROW_HEIGHT;
  }
  for (const kind of BAND_EDGE_KINDS.filter((candidate) => usedKinds.has(candidate))) {
    elements.push(swatchForKind(scene, kind, x + LEGEND_PADDING, rowY, palette));
    elements.push(legendLabel(scene, EDGE_KIND_LABELS[kind], x, rowY, palette));
    rowY += LEGEND_ROW_HEIGHT;
  }
  for (const status of ["added", "changed", "removed", "risk"] as const) {
    if (!spec.nodes.some((node) => node.status === status)) {
      continue;
    }
    elements.push(scene.rect(
      x + LEGEND_PADDING,
      rowY,
      LEGEND_SWATCH_WIDTH,
      LEGEND_SWATCH_HEIGHT,
      { color: palette.status[status], strokeWidth: 2 },
    ));
    elements.push(legendLabel(scene, STATUS_LABELS[status], x, rowY, palette));
    rowY += LEGEND_ROW_HEIGHT;
  }

  scene.group(elements);
  return {
    bounds: boundsFor(elements),
    elementIds: elements.map((element) => String(element.id)),
    entries,
  };
}

/** The swatch repeats the archetype's own shape — the grammar is what the legend explains. */
function swatchForType(
  scene: Scene,
  type: BandNodeType,
  x: number,
  y: number,
  palette: ResolvedPalette,
): ElementLike[] {
  const color = palette.swimlane.primary;
  switch (type) {
    case "actor":
      return [scene.ellipse(x, y, LEGEND_SWATCH_WIDTH, LEGEND_SWATCH_HEIGHT, { color, strokeWidth: 2 })];
    case "decision":
      return [scene.diamond(x, y, LEGEND_SWATCH_WIDTH, LEGEND_SWATCH_HEIGHT, { color, strokeWidth: 2 })];
    case "artifact":
      return [
        scene.rect(x, y, LEGEND_SWATCH_WIDTH, LEGEND_SWATCH_HEIGHT, { color, strokeWidth: 1 }),
        scene.rect(x - 3, y - 3, LEGEND_SWATCH_WIDTH + 6, LEGEND_SWATCH_HEIGHT + 6, {
          color,
          strokeWidth: 1,
          dashed: true,
        }),
      ];
    default:
      return [scene.rect(x, y, LEGEND_SWATCH_WIDTH, LEGEND_SWATCH_HEIGHT, { color, strokeWidth: 1 })];
  }
}

function swatchForKind(
  scene: Scene,
  kind: BandEdgeKind,
  x: number,
  y: number,
  palette: ResolvedPalette,
): ElementLike {
  const middle = y + LEGEND_SWATCH_HEIGHT / 2;
  const points: PointTuple[] = [[x, middle], [x + LEGEND_SWATCH_WIDTH, middle]];
  switch (kind) {
    case "provenance":
      return scene.line(points, { color: palette.swimlane.neutral, strokeWidth: 1, dashed: true });
    case "feedback":
      return scene.line(points, { color: palette.swimlane.accent, strokeWidth: 2, dashed: true });
    default:
      return scene.line(points, { color: palette.swimlane.primary, strokeWidth: 2 });
  }
}

function legendLabel(
  scene: Scene,
  text: string,
  x: number,
  y: number,
  palette: ResolvedPalette,
): ElementLike {
  return scene.text(
    x + LEGEND_PADDING + LEGEND_SWATCH_WIDTH + LEGEND_LABEL_GAP,
    y,
    text,
    {
      size: 13,
      color: palette.swimlane.text,
      width: LEGEND_WIDTH - LEGEND_PADDING * 2 - LEGEND_SWATCH_WIDTH - LEGEND_LABEL_GAP,
    },
  );
}
