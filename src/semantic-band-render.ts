// `flow.band` layout compiler: measures cards, wraps the ribbon into bands and places
// every node by (lane, stage). Contract: docs/system-design/flow-band/flow-band-contract.md
// (revision 1.1) — B1-B3, B6, S3, S6, S8, S10, E1, E4, R2, R3.
// Edges, legend and geometry post-validation are added by the later slices.
import { Scene } from "./core.js";
import { Bounds, ElementLike, PlacedBlock, PointTuple, boundsFor, elementBounds } from "./geometry.js";
import { fitCard } from "./card.js";
import { nodeCard } from "./node.js";
import { resolveSemanticPalette, semanticStatusColor } from "./semantic-palette.js";
import { DiagramDiagnostic, error } from "./semantic-schema.js";
import {
  BandLaneSpec,
  BandNodeSpec,
  BandNodeType,
  BandStageSpec,
  MAX_BANDS,
  NormalizedBandFlowSpec,
} from "./semantic-band.js";

type ResolvedPalette = ReturnType<typeof resolveSemanticPalette>;

/**
 * Geometry constants own readability (P6); the author never sees them. They are frozen
 * inside a major version exactly like `CHAR_WIDTH_RATIO`, so the same spec keeps
 * producing the same bytes.
 */
const BOARD_X = 64;
const TITLE_Y = 40;
const BAND_TOP = 132;
/** Every node is one column wide, which is what makes stage width uniform (S8 wrap). */
const NODE_WIDTH = 260;
const LANE_HEADER_WIDTH = 176;
const LANE_PADDING = 24;
const STAGE_GAP = 72;
const STAGE_LABEL_HEIGHT = 28;
const CELL_GAP = 20;
const LANE_GAP = 16;
const BAND_GAP = 64;
const LANE_MIN_HEIGHT = 96;
/** An ellipse must be √2 larger than the box it contains; a diamond twice as large. */
const TITLE_SIZE = 17;
const TITLE_MIN_SIZE = 13;
const DETAIL_SIZE = 13;
const DETAIL_MIN_SIZE = 11;
const ELLIPSE_FACTOR = Math.SQRT2;
const DIAMOND_FACTOR = 2;

export interface BandInfo {
  index: number;
  bounds: Bounds;
  stageIds: string[];
}

export interface BandLaneInstance {
  band: number;
  bounds: Bounds;
  elementIds: string[];
}

export interface BandDiagramBuildMetadata {
  template: "flow.band";
  bands: BandInfo[];
  lanes: Array<{ id: string; path: string; instances: BandLaneInstance[] }>;
  stages: Array<{ id: string; path: string; band: number; bounds: Bounds }>;
  nodes: Array<{
    id: string;
    path: string;
    band: number;
    bounds: Bounds;
    elementIds: string[];
    frameElementId: string;
  }>;
  title: { bounds: Bounds; elementIds: string[] };
}

export interface RenderedBandLayout {
  metadata: BandDiagramBuildMetadata;
  /** Node frames in spec order — obstacle set and binding targets for the edge slice. */
  nodeFrames: Map<string, ElementLike>;
  nodeBounds: Map<string, Bounds>;
  /**
   * One block per node holding only its frame, so a routed edge binds to the visible
   * shape and its endpoints land on that shape's own bounds.
   */
  connectBlocks: Map<string, PlacedBlock>;
  /** Bounds of each node's own text, so the label post-pass can keep labels off them. */
  nodeTextBounds: Map<string, Bounds[]>;
  /**
   * Lane headers and stage labels. E5 treats them as obstacles: an arrow crossing a lane
   * caption reads as belonging to that lane. Lane and band background lines are NOT here —
   * cross-lane edges must be able to cross them.
   */
  chromeBounds: Bounds[];
  /** Text warnings surfaced by `fitCard`, keyed by node id (consumed by the warning registry). */
  textWarnings: Map<string, string[]>;
  /**
   * Nodes whose text only fits because it was shrunk to the smallest allowed size. The
   * text is inside its shape, so this is not an error — but a model that cannot look at
   * the picture would never learn the card became unreadably small.
   */
  shrunkNodes: Set<string>;
}

export type BandLayoutResult =
  | { ok: true; rendered: RenderedBandLayout }
  | { ok: false; diagnostics: DiagramDiagnostic[] };

interface MeasuredNode {
  spec: BandNodeSpec;
  index: number;
  width: number;
  height: number;
  /** Content box the shape must contain; equals the whole node for card archetypes. */
  contentWidth: number;
  contentHeight: number;
  warnings: string[];
  shrunkToMin: boolean;
}

/**
 * Greedy first-fit over stage boundaries (S8): a stage joins the current band while the
 * band still fits `maxBandWidth`, otherwise it opens the next one.
 */
export function planBands(
  stages: BandStageSpec[],
  maxBandWidth: number,
): { ok: true; bands: string[][] } | { ok: false; tooWideStageIndex: number } | { ok: false; bandCount: number } {
  const fixed = LANE_HEADER_WIDTH + LANE_PADDING * 2;
  if (fixed + NODE_WIDTH > maxBandWidth) {
    return { ok: false, tooWideStageIndex: 0 };
  }
  const bands: string[][] = [];
  let current: string[] = [];
  for (const stage of stages) {
    const candidate = current.length + 1;
    const width = fixed + candidate * NODE_WIDTH + (candidate - 1) * STAGE_GAP;
    if (width > maxBandWidth && current.length > 0) {
      bands.push(current);
      current = [stage.id];
      continue;
    }
    current.push(stage.id);
  }
  if (current.length > 0) {
    bands.push(current);
  }
  if (bands.length > MAX_BANDS) {
    return { ok: false, bandCount: bands.length };
  }
  return { ok: true, bands };
}

export function renderBandLayout(
  scene: Scene,
  spec: NormalizedBandFlowSpec,
): BandLayoutResult {
  const palette = resolveSemanticPalette(spec.palette);
  const plan = planBands(spec.stages, spec.layout.maxBandWidth);
  if (!plan.ok) {
    return { ok: false, diagnostics: [bandPlanDiagnostic(plan, spec)] };
  }

  const measured = spec.nodes.map((node, index) => measureNode(node, index));
  const byCell = groupByCell(measured);
  const stageBand = new Map<string, number>();
  for (const [bandIndex, stageIds] of plan.bands.entries()) {
    for (const stageId of stageIds) {
      stageBand.set(stageId, bandIndex);
    }
  }

  const titleElements = [
    scene.text(BOARD_X, TITLE_Y, spec.title, {
      size: 28,
      color: palette.swimlane.primary,
      width: spec.layout.maxBandWidth - BOARD_X,
    }),
  ];
  if (spec.subtitle) {
    titleElements.push(scene.text(BOARD_X, TITLE_Y + 40, spec.subtitle, {
      size: 15,
      color: palette.swimlane.neutral,
      width: spec.layout.maxBandWidth - BOARD_X,
    }));
  }

  const metadata: BandDiagramBuildMetadata = {
    template: "flow.band",
    bands: [],
    lanes: spec.lanes.map((lane, index) => ({
      id: lane.id,
      path: `$.lanes[${index}]`,
      instances: [],
    })),
    stages: [],
    nodes: [],
    title: { bounds: boundsFor(titleElements), elementIds: titleElements.map(elementId) },
  };
  const nodeFrames = new Map<string, ElementLike>();
  const nodeBounds = new Map<string, Bounds>();
  const connectBlocks = new Map<string, PlacedBlock>();
  const nodeTextBounds = new Map<string, Bounds[]>();
  const chromeBounds: Bounds[] = [];
  const textWarnings = new Map<string, string[]>();
  const shrunkNodes = new Set<string>();

  let bandTop = BAND_TOP;
  for (const [bandIndex, stageIds] of plan.bands.entries()) {
    const stageX = new Map<string, number>();
    for (const [localIndex, stageId] of stageIds.entries()) {
      stageX.set(
        stageId,
        BOARD_X + LANE_HEADER_WIDTH + LANE_PADDING + localIndex * (NODE_WIDTH + STAGE_GAP),
      );
    }

    // S10: a lane with no nodes in this band is not drawn in this band.
    const bandLanes = spec.lanes.filter((lane) =>
      stageIds.some((stageId) => (byCell.get(cellKey(lane.id, stageId)) ?? []).length > 0)
    );

    const labelsTop = bandTop;
    for (const stageId of stageIds) {
      const stage = spec.stages.find((candidate) => candidate.id === stageId)!;
      const label = stage.label ?? stage.id;
      const stageLabel = scene.text(stageX.get(stageId)!, labelsTop, label, {
        size: 14,
        color: palette.swimlane.neutral,
        width: NODE_WIDTH,
        align: "center",
      });
      chromeBounds.push(elementBounds(stageLabel));
    }

    let laneTop = labelsTop + STAGE_LABEL_HEIGHT;
    for (const lane of bandLanes) {
      const cellHeights = stageIds.map((stageId) =>
        stackHeight(byCell.get(cellKey(lane.id, stageId)) ?? [])
      );
      const laneHeight = Math.max(LANE_MIN_HEIGHT, ...cellHeights) + LANE_PADDING;
      const laneCaption = scene.text(BOARD_X, laneTop + LANE_PADDING / 2, lane.label, {
        size: 14,
        color: palette.swimlane.neutral,
        width: LANE_HEADER_WIDTH,
      });
      chromeBounds.push(elementBounds(laneCaption));
      const laneElements: ElementLike[] = [laneCaption];
      if (lane.sublabel) {
        const laneSubcaption = scene.text(BOARD_X, laneTop + LANE_PADDING / 2 + 22, lane.sublabel, {
          size: 12,
          color: palette.swimlane.neutral,
          width: LANE_HEADER_WIDTH,
        });
        chromeBounds.push(elementBounds(laneSubcaption));
        laneElements.push(laneSubcaption);
      }
      laneElements.push(scene.line(
        [
          [BOARD_X, laneTop],
          [BOARD_X + LANE_HEADER_WIDTH + LANE_PADDING * 2 + stageIds.length * NODE_WIDTH
            + (stageIds.length - 1) * STAGE_GAP, laneTop],
        ] as PointTuple[],
        { color: palette.swimlane.neutral, strokeWidth: 1, dashed: true },
      ));

      for (const stageId of stageIds) {
        const cell = byCell.get(cellKey(lane.id, stageId)) ?? [];
        let nodeTop = laneTop + LANE_PADDING / 2;
        for (const node of cell) {
          const placed = placeNode(scene, node, stageX.get(stageId)!, nodeTop, palette);
          nodeFrames.set(node.spec.id, placed.frame);
          nodeBounds.set(node.spec.id, placed.bounds);
          connectBlocks.set(
            node.spec.id,
            new PlacedBlock([placed.frame], elementBounds(placed.frame))
              .withBindingTarget(placed.frame),
          );
          nodeTextBounds.set(node.spec.id, placed.texts.map(elementBounds));
          if (node.warnings.length > 0) {
            textWarnings.set(node.spec.id, node.warnings);
          }
          if (node.shrunkToMin) {
            shrunkNodes.add(node.spec.id);
          }
          metadata.nodes.push({
            id: node.spec.id,
            path: `$.nodes[${node.index}]`,
            band: bandIndex,
            bounds: placed.bounds,
            elementIds: placed.elements.map(elementId),
            frameElementId: elementId(placed.frame),
          });
          nodeTop += node.height + CELL_GAP;
        }
      }

      metadata.lanes.find((entry) => entry.id === lane.id)!.instances.push({
        band: bandIndex,
        bounds: new Bounds(
          BOARD_X,
          laneTop,
          LANE_HEADER_WIDTH + LANE_PADDING * 2 + stageIds.length * NODE_WIDTH
            + (stageIds.length - 1) * STAGE_GAP,
          laneHeight,
        ),
        elementIds: laneElements.map(elementId),
      });
      laneTop += laneHeight + LANE_GAP;
    }

    const bandBottom = laneTop - LANE_GAP;
    const bandBounds = new Bounds(
      BOARD_X,
      labelsTop,
      LANE_HEADER_WIDTH + LANE_PADDING * 2 + stageIds.length * NODE_WIDTH
        + (stageIds.length - 1) * STAGE_GAP,
      bandBottom - labelsTop,
    );
    metadata.bands.push({ index: bandIndex, bounds: bandBounds, stageIds: [...stageIds] });
    for (const stageId of stageIds) {
      const index = spec.stages.findIndex((stage) => stage.id === stageId);
      metadata.stages.push({
        id: stageId,
        path: `$.stages[${index}]`,
        band: bandIndex,
        bounds: new Bounds(stageX.get(stageId)!, labelsTop, NODE_WIDTH, bandBottom - labelsTop),
      });
    }
    bandTop = bandBottom + BAND_GAP;
  }

  // Placement walks bands and lanes; metadata is re-sorted into spec order so a reader
  // can scan it line by line against the spec they wrote (R2).
  metadata.stages.sort((left, right) => specIndex(left.path) - specIndex(right.path));
  metadata.nodes.sort((left, right) => specIndex(left.path) - specIndex(right.path));
  return {
    ok: true,
    rendered: {
      metadata,
      nodeFrames,
      nodeBounds,
      connectBlocks,
      nodeTextBounds,
      chromeBounds,
      textWarnings,
      shrunkNodes,
    },
  };
}

function bandPlanDiagnostic(
  plan: { ok: false; tooWideStageIndex: number } | { ok: false; bandCount: number },
  spec: NormalizedBandFlowSpec,
): DiagramDiagnostic {
  if ("tooWideStageIndex" in plan) {
    return error(
      "STAGE_TOO_WIDE",
      `$.stages[${plan.tooWideStageIndex}]`,
      `a single stage column needs ${LANE_HEADER_WIDTH + LANE_PADDING * 2 + NODE_WIDTH}px but maxBandWidth is ${spec.layout.maxBandWidth}`,
      "Raise layout.maxBandWidth — one stage cannot be wrapped.",
    );
  }
  return error(
    "BAND_COUNT_EXCEEDED",
    "$.stages",
    `the ribbon wraps into ${plan.bandCount} bands, at most ${MAX_BANDS} stay readable`,
    "Split the flow into views or raise layout.maxBandWidth.",
  );
}

function measureNode(spec: BandNodeSpec, index: number): MeasuredNode {
  const contentWidth = shapeContentWidth(spec.type);
  const fitted = fitCard({
    id: spec.id,
    title: spec.title,
    width: contentWidth,
    rows: (spec.details ?? []).map((detail, detailIndex) => ({
      id: `${spec.id}.details[${detailIndex}]`,
      text: detail,
      size: DETAIL_SIZE,
      minSize: DETAIL_MIN_SIZE,
      maxLines: 2,
    })),
    iconId: spec.icon ?? null,
    iconSize: 36,
  });
  const shrunkToMin = (fitted.title?.fitted.size ?? TITLE_SIZE) <= TITLE_MIN_SIZE
    || fitted.rows.some((row) => row.fitted.size <= DETAIL_MIN_SIZE);
  const contentHeight = fitted.height;
  const factor = shapeFactor(spec.type);
  return {
    spec,
    index,
    contentWidth,
    contentHeight,
    width: NODE_WIDTH,
    height: Math.ceil(contentHeight * factor),
    warnings: fitted.warnings,
    shrunkToMin,
  };
}

/** S6: the shape must contain its text box, so non-rectangular archetypes get less width. */
function shapeContentWidth(type: BandNodeType): number {
  return Math.floor(NODE_WIDTH / shapeFactor(type));
}

function shapeFactor(type: BandNodeType): number {
  switch (type) {
    case "actor":
      return ELLIPSE_FACTOR;
    case "decision":
      return DIAMOND_FACTOR;
    default:
      return 1;
  }
}

function groupByCell(measured: MeasuredNode[]): Map<string, MeasuredNode[]> {
  const cells = new Map<string, MeasuredNode[]>();
  for (const node of measured) {
    const key = cellKey(node.spec.lane, node.spec.stage);
    const bucket = cells.get(key) ?? [];
    bucket.push(node);
    cells.set(key, bucket);
  }
  return cells;
}

function cellKey(lane: string, stage: string): string {
  return `${lane} ${stage}`;
}

function stackHeight(cell: MeasuredNode[]): number {
  if (cell.length === 0) {
    return 0;
  }
  return cell.reduce((total, node) => total + node.height, 0) + (cell.length - 1) * CELL_GAP;
}

interface PlacedBandNode {
  frame: ElementLike;
  elements: ElementLike[];
  texts: ElementLike[];
  bounds: Bounds;
}

function placeNode(
  scene: Scene,
  node: MeasuredNode,
  x: number,
  y: number,
  palette: ResolvedPalette,
): PlacedBandNode {
  const color = semanticStatusColor(palette, node.spec.status, archetypeColor(node.spec.type, palette));
  if (node.spec.type === "actor" || node.spec.type === "decision") {
    // The card is measured at content size and centred inside the outer shape, so the
    // text never leaves the ellipse/diamond it belongs to.
    const insetX = x + (node.width - node.contentWidth) / 2;
    const insetY = y + (node.height - node.contentHeight) / 2;
    const shape = node.spec.type === "actor"
      ? scene.ellipse(x, y, node.width, node.height, { color, strokeWidth: 2 })
      : scene.diamond(x, y, node.width, node.height, { color, strokeWidth: 2 });
    const card = nodeCard(scene, {
      id: node.spec.id,
      title: node.spec.title,
      bullets: node.spec.details ?? [],
      iconId: node.spec.icon,
      x: insetX,
      y: insetY,
      width: node.contentWidth,
      color,
    });
    // The measured card frame would double the outline inside the shape.
    scene.elements = scene.elements.filter((element) => element !== card.frame);
    const elements = [shape, ...card.block.elements.filter((element) => element !== card.frame)];
    scene.group(elements);
    return {
      frame: shape,
      elements,
      texts: card.texts,
      bounds: new Bounds(x, y, node.width, node.height),
    };
  }

  const card = nodeCard(scene, {
    id: node.spec.id,
    title: node.spec.title,
    bullets: node.spec.details ?? [],
    iconId: node.spec.icon,
    x,
    y,
    width: node.width,
    color,
  });
  // Measured card heights are fractional; a routed endpoint lands on the rounded edge
  // and would sit a floating-point hair outside its own binding target. Snapping the
  // frame outward to whole pixels keeps every endpoint inside the shape it binds to.
  card.frame.width = Math.ceil(Number(card.frame.width));
  card.frame.height = Math.ceil(Number(card.frame.height));
  const elements = [...card.block.elements];
  if (node.spec.type === "artifact") {
    // Same dashed outer frame swimlane uses for artifacts.
    elements.push(scene.rect(x - 6, y - 6, card.bounds.width + 12, card.bounds.height + 12, {
      color,
      strokeWidth: 1,
      dashed: true,
    }));
  }
  scene.group(elements);
  return { frame: card.frame, elements, texts: card.texts, bounds: card.bounds };
}

function archetypeColor(type: BandNodeType, palette: ResolvedPalette): string {
  switch (type) {
    case "actor":
      return palette.swimlane.neutral;
    case "decision":
      return palette.swimlane.accent;
    case "artifact":
      return palette.swimlane.text;
    default:
      return palette.swimlane.primary;
  }
}

function elementId(element: ElementLike): string {
  return String(element.id);
}

function specIndex(path: string): number {
  const match = /\[(\d+)\]/u.exec(path);
  return match ? Number(match[1]) : 0;
}
