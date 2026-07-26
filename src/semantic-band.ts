// `flow.band` — banded process ribbon (lanes x stages, wrapped by the engine).
// Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.1).
// This module owns the closed schema and its diagnostics (contract S1-S12, D1-D16).
// Layout, routing and scene assembly live in the compiler and are added on top of
// the normalized spec this module returns.
import type { AssetRegistry } from "./assets.js";
import {
  DiagramDiagnostic,
  DiagramSpecOptions,
  error,
  hasOwn,
  isPlainObject,
  optionalSingleLineString,
  registerId,
  rejectUnknownFields,
  requiredId,
  requiredSingleLineString,
  validateSeed,
} from "./semantic-schema.js";
import {
  readSemanticPaletteName,
  readSemanticStatus,
} from "./semantic-palette.js";
import type { SemanticPaletteName, SemanticStatus } from "./semantic-palette.js";

/** Node archetypes (contract S6). Names follow package convention, not geometry. */
export const BAND_NODE_TYPES = ["actor", "agent", "artifact", "decision", "step"] as const;
export type BandNodeType = typeof BAND_NODE_TYPES[number];

/** Edge kinds (contract S7). `feedback` legalises back edges; `provenance` is evidence. */
export const BAND_EDGE_KINDS = ["primary", "provenance", "feedback"] as const;
export type BandEdgeKind = typeof BAND_EDGE_KINDS[number];

export type BandLegendMode = "auto" | "none";

export interface BandLaneSpec {
  id: string;
  label: string;
  sublabel?: string;
}

export interface BandStageSpec {
  id: string;
  label?: string;
}

export interface BandNodeSpec {
  id: string;
  lane: string;
  stage: string;
  type: BandNodeType;
  title: string;
  icon?: string;
  details?: string[];
  status?: SemanticStatus;
}

export interface BandEdgeSpec {
  id?: string;
  from: string;
  to: string;
  label?: string;
  kind?: BandEdgeKind;
}

export interface BandLayoutSpec {
  maxBandWidth?: number;
}

export interface BandFlowSpec {
  template: "flow.band";
  title: string;
  subtitle?: string;
  palette?: SemanticPaletteName;
  layout?: BandLayoutSpec;
  lanes: BandLaneSpec[];
  stages: BandStageSpec[];
  nodes: BandNodeSpec[];
  edges: BandEdgeSpec[];
  legend?: BandLegendMode;
}

/** Edge with defaults resolved: `kind` and `id` are always present downstream (S12a). */
export interface NormalizedBandEdgeSpec {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind: BandEdgeKind;
}

export interface NormalizedBandFlowSpec {
  template: "flow.band";
  title: string;
  subtitle?: string;
  palette?: SemanticPaletteName;
  layout: { maxBandWidth: number };
  lanes: BandLaneSpec[];
  stages: BandStageSpec[];
  nodes: BandNodeSpec[];
  edges: NormalizedBandEdgeSpec[];
  legend: BandLegendMode;
}

export type BandDiagramValidationResult =
  | { ok: true; value: NormalizedBandFlowSpec; diagnostics: DiagramDiagnostic[] }
  | { ok: false; diagnostics: DiagramDiagnostic[] };

// P14/A12: these lists are the model-facing vocabulary of the template. They are
// exported so the lexicon test can compare them against
// `docs/system-design/dsl-lexicon.md` — a field added here without a lexicon row fails CI.
export const BAND_ROOT_FIELDS = [
  "template",
  "title",
  "subtitle",
  "palette",
  "layout",
  "lanes",
  "stages",
  "nodes",
  "edges",
  "legend",
] as const;
export const BAND_LAYOUT_FIELDS = ["maxBandWidth"] as const;
export const BAND_LANE_FIELDS = ["id", "label", "sublabel"] as const;
export const BAND_STAGE_FIELDS = ["id", "label"] as const;
export const BAND_NODE_FIELDS = ["id", "lane", "stage", "type", "title", "icon", "details", "status"] as const;
export const BAND_EDGE_FIELDS = ["id", "from", "to", "label", "kind"] as const;

const ROOT_FIELDS = BAND_ROOT_FIELDS;
const LAYOUT_FIELDS = BAND_LAYOUT_FIELDS;
const LANE_FIELDS = BAND_LANE_FIELDS;
const STAGE_FIELDS = BAND_STAGE_FIELDS;
const NODE_FIELDS = BAND_NODE_FIELDS;
const EDGE_FIELDS = BAND_EDGE_FIELDS;

// Count budgets (contract S9): versioned complexity budget calibrated on the two
// migration fixtures, not permanent numbers. Raising one is a minor event backed by
// repeated evidence.
const MIN_LANES = 2;
const MAX_LANES = 6;
const MIN_STAGES = 1;
const MAX_STAGES = 12;
const MIN_NODES = 1;
const MAX_NODES = 28;
const MIN_EDGES = 0;
const MAX_EDGES = 40;
export const MAX_CELL_NODES = 3;
export const MAX_BANDS = 3;
const MAX_DETAILS = 4;

// String budgets (contract S2).
const TITLE_LIMIT = 80;
const SUBTITLE_LIMIT = 120;
const LANE_LABEL_LIMIT = 48;
const LANE_SUBLABEL_LIMIT = 48;
const STAGE_LABEL_LIMIT = 32;
const NODE_TITLE_LIMIT = 80;
const DETAIL_LIMIT = 60;
const EDGE_LABEL_LIMIT = 48;

// Band width control (contract S8, B6) — the author's single layout lever.
export const DEFAULT_MAX_BAND_WIDTH = 2400;
export const MIN_MAX_BAND_WIDTH = 800;
export const MAX_MAX_BAND_WIDTH = 2700;

export function validateBandFlowSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): BandDiagramValidationResult {
  const diagnostics: DiagramDiagnostic[] = [];
  if (!isPlainObject(value)) {
    diagnostics.push(error("INVALID_DOCUMENT", "$", "diagram spec must be a plain object"));
    validateSeed(options.seed, diagnostics);
    return { ok: false, diagnostics };
  }

  const template = requiredTemplate(value, diagnostics);
  const title = requiredSingleLineString(value, "title", "$.title", TITLE_LIMIT, diagnostics);
  const subtitle = optionalSingleLineString(
    value,
    "subtitle",
    "$.subtitle",
    SUBTITLE_LIMIT,
    diagnostics,
  );
  const palette = readSemanticPaletteName(value, "$.palette", diagnostics);
  const layout = validateLayout(value, diagnostics);
  const legend = validateLegend(value, diagnostics);

  const ids = new Map<string, string>();
  const lanes = validateLanes(value, ids, diagnostics);
  const stages = validateStages(value, ids, diagnostics);
  const nodes = validateNodes(
    value,
    lanes ?? [],
    stages ?? [],
    ids,
    options.assetRegistry,
    diagnostics,
  );
  const edges = validateEdges(value, nodes ?? [], ids, diagnostics);
  rejectUnknownFields(value, ROOT_FIELDS, "$", diagnostics);
  validateSeed(options.seed, diagnostics);

  if (lanes && stages && nodes) {
    validateLaneOccupancy(lanes, nodes, diagnostics);
    validateCellCapacity(nodes, diagnostics);
  }
  if (nodes && edges) {
    validatePrimaryAcyclic(nodes, edges, diagnostics);
  }

  if (
    diagnostics.some((diagnostic) => diagnostic.severity === "error")
    || !template
    || !title
    || !lanes
    || !stages
    || !nodes
    || !edges
    || !layout
    || !legend
  ) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    value: {
      template,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(palette ? { palette } : {}),
      layout,
      lanes,
      stages,
      nodes,
      edges,
      legend,
    },
    diagnostics,
  };
}

function requiredTemplate(
  value: Record<string, unknown>,
  diagnostics: DiagramDiagnostic[],
): "flow.band" | null {
  if (!hasOwn(value, "template")) {
    diagnostics.push(error("MISSING_FIELD", "$.template", "required field 'template' is missing"));
    return null;
  }
  if (typeof value.template !== "string" || value.template.trim().length === 0) {
    diagnostics.push(error("INVALID_STRING", "$.template", "template must be a non-empty string"));
    return null;
  }
  const template = value.template.trim();
  if (template !== "flow.band") {
    diagnostics.push(error(
      "UNSUPPORTED_TEMPLATE",
      "$.template",
      `unsupported template '${template}'`,
      "Use 'flow.band'.",
    ));
    return null;
  }
  return template;
}

function validateLayout(
  root: Record<string, unknown>,
  diagnostics: DiagramDiagnostic[],
): { maxBandWidth: number } | null {
  const path = "$.layout";
  if (!hasOwn(root, "layout")) {
    return { maxBandWidth: DEFAULT_MAX_BAND_WIDTH };
  }
  if (!isPlainObject(root.layout)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "layout must be a plain object"));
    return null;
  }
  rejectUnknownFields(root.layout, LAYOUT_FIELDS, path, diagnostics);
  if (!hasOwn(root.layout, "maxBandWidth")) {
    return { maxBandWidth: DEFAULT_MAX_BAND_WIDTH };
  }
  const raw = root.layout.maxBandWidth;
  const widthPath = `${path}.maxBandWidth`;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    diagnostics.push(error("INVALID_BAND_WIDTH", widthPath, "maxBandWidth must be an integer"));
    return null;
  }
  if (raw < MIN_MAX_BAND_WIDTH || raw > MAX_MAX_BAND_WIDTH) {
    diagnostics.push(error(
      "INVALID_BAND_WIDTH",
      widthPath,
      `maxBandWidth must be between ${MIN_MAX_BAND_WIDTH} and ${MAX_MAX_BAND_WIDTH}`,
      "The full scene is capped at 2700px, so a band cannot be wider.",
    ));
    return null;
  }
  return { maxBandWidth: raw };
}

function validateLegend(
  root: Record<string, unknown>,
  diagnostics: DiagramDiagnostic[],
): BandLegendMode | null {
  if (!hasOwn(root, "legend")) {
    return "auto";
  }
  const legend = root.legend;
  if (legend === "auto" || legend === "none") {
    return legend;
  }
  diagnostics.push(error(
    "INVALID_STRING",
    "$.legend",
    "legend must be 'auto' or 'none'",
    "Use the string 'none' to switch the legend off; booleans are not accepted.",
  ));
  return null;
}

function validateLanes(
  root: Record<string, unknown>,
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): BandLaneSpec[] | null {
  const path = "$.lanes";
  if (!hasOwn(root, "lanes")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'lanes' is missing"));
    return null;
  }
  if (!Array.isArray(root.lanes)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "lanes must be an array"));
    return null;
  }
  if (root.lanes.length < MIN_LANES || root.lanes.length > MAX_LANES) {
    diagnostics.push(error(
      "INVALID_LANE_COUNT",
      path,
      `lanes must contain between ${MIN_LANES} and ${MAX_LANES} entries`,
      "Split the diagram into views when more owners are involved.",
    ));
  }

  const lanes: BandLaneSpec[] = [];
  let complete = true;
  for (const [index, rawLane] of root.lanes.entries()) {
    const lanePath = `${path}[${index}]`;
    if (!isPlainObject(rawLane)) {
      diagnostics.push(error("INVALID_DOCUMENT", lanePath, "lane must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawLane, "id", `${lanePath}.id`, diagnostics);
    if (id) {
      registerId(id, `${lanePath}.id`, ids, diagnostics);
    }
    const label = requiredSingleLineString(
      rawLane,
      "label",
      `${lanePath}.label`,
      LANE_LABEL_LIMIT,
      diagnostics,
    );
    const sublabel = optionalSingleLineString(
      rawLane,
      "sublabel",
      `${lanePath}.sublabel`,
      LANE_SUBLABEL_LIMIT,
      diagnostics,
    );
    rejectUnknownFields(rawLane, LANE_FIELDS, lanePath, diagnostics);
    if (!id || !label) {
      complete = false;
      continue;
    }
    lanes.push({ id, label, ...(sublabel ? { sublabel } : {}) });
  }
  return complete ? lanes : null;
}

function validateStages(
  root: Record<string, unknown>,
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): BandStageSpec[] | null {
  const path = "$.stages";
  if (!hasOwn(root, "stages")) {
    diagnostics.push(error(
      "MISSING_FIELD",
      path,
      "required field 'stages' is missing",
      "Stages are explicit in flow.band: name the columns left to right.",
    ));
    return null;
  }
  if (!Array.isArray(root.stages)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "stages must be an array"));
    return null;
  }
  if (root.stages.length < MIN_STAGES || root.stages.length > MAX_STAGES) {
    diagnostics.push(error(
      "INVALID_STAGE_COUNT",
      path,
      `stages must contain between ${MIN_STAGES} and ${MAX_STAGES} entries`,
      "Split the flow into views instead of growing one ribbon.",
    ));
  }

  const stages: BandStageSpec[] = [];
  let complete = true;
  for (const [index, rawStage] of root.stages.entries()) {
    const stagePath = `${path}[${index}]`;
    if (!isPlainObject(rawStage)) {
      diagnostics.push(error("INVALID_DOCUMENT", stagePath, "stage must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawStage, "id", `${stagePath}.id`, diagnostics);
    if (id) {
      registerId(id, `${stagePath}.id`, ids, diagnostics);
    }
    const label = optionalSingleLineString(
      rawStage,
      "label",
      `${stagePath}.label`,
      STAGE_LABEL_LIMIT,
      diagnostics,
    );
    rejectUnknownFields(rawStage, STAGE_FIELDS, stagePath, diagnostics);
    if (!id) {
      complete = false;
      continue;
    }
    stages.push({ id, ...(label ? { label } : {}) });
  }
  return complete ? stages : null;
}

function validateNodes(
  root: Record<string, unknown>,
  lanes: BandLaneSpec[],
  stages: BandStageSpec[],
  ids: Map<string, string>,
  assetRegistry: AssetRegistry | undefined,
  diagnostics: DiagramDiagnostic[],
): BandNodeSpec[] | null {
  const path = "$.nodes";
  if (!hasOwn(root, "nodes")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'nodes' is missing"));
    return null;
  }
  if (!Array.isArray(root.nodes)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "nodes must be an array"));
    return null;
  }
  if (root.nodes.length < MIN_NODES || root.nodes.length > MAX_NODES) {
    diagnostics.push(error(
      "INVALID_NODE_COUNT",
      path,
      `nodes must contain between ${MIN_NODES} and ${MAX_NODES} entries`,
      "Split the flow into views instead of growing one ribbon.",
    ));
  }

  const laneIds = new Set(lanes.map((lane) => lane.id));
  const stageIds = new Set(stages.map((stage) => stage.id));
  const nodes: BandNodeSpec[] = [];
  let complete = true;
  for (const [index, rawNode] of root.nodes.entries()) {
    const nodePath = `${path}[${index}]`;
    if (!isPlainObject(rawNode)) {
      diagnostics.push(error("INVALID_DOCUMENT", nodePath, "node must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawNode, "id", `${nodePath}.id`, diagnostics);
    if (id) {
      registerId(id, `${nodePath}.id`, ids, diagnostics);
    }
    const lane = requiredId(rawNode, "lane", `${nodePath}.lane`, diagnostics);
    if (lane && laneIds.size > 0 && !laneIds.has(lane)) {
      diagnostics.push(error(
        "UNKNOWN_NODE_LANE",
        `${nodePath}.lane`,
        `unknown lane '${lane}'`,
        `Declared lanes: ${[...laneIds].join(", ")}.`,
      ));
    }
    const stage = requiredId(rawNode, "stage", `${nodePath}.stage`, diagnostics);
    if (stage && stageIds.size > 0 && !stageIds.has(stage)) {
      diagnostics.push(error(
        "UNKNOWN_STAGE",
        `${nodePath}.stage`,
        `unknown stage '${stage}'`,
        `Declared stages: ${[...stageIds].join(", ")}.`,
      ));
    }
    const type = validateNodeType(rawNode, nodePath, diagnostics);
    const title = requiredSingleLineString(
      rawNode,
      "title",
      `${nodePath}.title`,
      NODE_TITLE_LIMIT,
      diagnostics,
    );
    const icon = validateIcon(rawNode, nodePath, assetRegistry, diagnostics);
    const details = validateDetails(rawNode, nodePath, diagnostics);
    const status = readSemanticStatus(rawNode, `${nodePath}.status`, diagnostics);
    rejectUnknownFields(rawNode, NODE_FIELDS, nodePath, diagnostics);
    if (!id || !lane || !stage || !type || !title || details === null) {
      complete = false;
      continue;
    }
    nodes.push({
      id,
      lane,
      stage,
      type,
      title,
      ...(icon ? { icon } : {}),
      ...(details.length > 0 ? { details } : {}),
      ...(status ? { status } : {}),
    });
  }
  return complete ? nodes : null;
}

function validateNodeType(
  rawNode: Record<string, unknown>,
  nodePath: string,
  diagnostics: DiagramDiagnostic[],
): BandNodeType | null {
  const path = `${nodePath}.type`;
  if (!hasOwn(rawNode, "type")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'type' is missing"));
    return null;
  }
  const type = rawNode.type;
  if (typeof type !== "string" || !(BAND_NODE_TYPES as readonly string[]).includes(type)) {
    diagnostics.push(error(
      "INVALID_NODE_TYPE",
      path,
      `type must be one of ${BAND_NODE_TYPES.join(", ")}`,
    ));
    return null;
  }
  return type as BandNodeType;
}

function validateIcon(
  rawNode: Record<string, unknown>,
  nodePath: string,
  assetRegistry: AssetRegistry | undefined,
  diagnostics: DiagramDiagnostic[],
): string | undefined {
  const path = `${nodePath}.icon`;
  const icon = optionalSingleLineString(rawNode, "icon", path, 64, diagnostics);
  if (!icon || !assetRegistry) {
    return icon;
  }
  try {
    assetRegistry.resolve(icon);
  } catch {
    diagnostics.push(error(
      "UNKNOWN_ICON_ID",
      path,
      `unknown asset id '${icon}'`,
      "Search the bundled catalog for a valid id.",
    ));
    return undefined;
  }
  return icon;
}

/** `null` marks a structural failure; an empty array means "no details supplied". */
function validateDetails(
  rawNode: Record<string, unknown>,
  nodePath: string,
  diagnostics: DiagramDiagnostic[],
): string[] | null {
  const path = `${nodePath}.details`;
  if (!hasOwn(rawNode, "details")) {
    return [];
  }
  if (!Array.isArray(rawNode.details)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "details must be an array of strings"));
    return null;
  }
  if (rawNode.details.length > MAX_DETAILS) {
    diagnostics.push(error(
      "STRING_TOO_LONG",
      path,
      `details must contain at most ${MAX_DETAILS} entries`,
      "Move the rest into a neighbouring node.",
    ));
    return null;
  }
  const details: string[] = [];
  let complete = true;
  for (const [index, rawDetail] of rawNode.details.entries()) {
    const detailPath = `${path}[${index}]`;
    if (typeof rawDetail !== "string" || rawDetail.trim().length === 0) {
      diagnostics.push(error("INVALID_STRING", detailPath, "detail must be a non-empty string"));
      complete = false;
      continue;
    }
    const detail = rawDetail.trim();
    if (detail.length > DETAIL_LIMIT) {
      diagnostics.push(error(
        "STRING_TOO_LONG",
        detailPath,
        `detail must contain at most ${DETAIL_LIMIT} characters`,
      ));
      complete = false;
      continue;
    }
    details.push(detail);
  }
  return complete ? details : null;
}

function validateEdges(
  root: Record<string, unknown>,
  nodes: BandNodeSpec[],
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): NormalizedBandEdgeSpec[] | null {
  const path = "$.edges";
  if (!hasOwn(root, "edges")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'edges' is missing"));
    return null;
  }
  if (!Array.isArray(root.edges)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "edges must be an array"));
    return null;
  }
  if (root.edges.length < MIN_EDGES || root.edges.length > MAX_EDGES) {
    diagnostics.push(error(
      "INVALID_EDGE_COUNT",
      path,
      `edges must contain between ${MIN_EDGES} and ${MAX_EDGES} entries`,
      "Split the flow into views instead of growing one ribbon.",
    ));
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const pairKinds = new Map<string, Set<BandEdgeKind>>();
  const seenPairs = new Set<string>();
  const parsed: Array<{ from: string; to: string; label?: string; kind: BandEdgeKind; id?: string }> = [];
  let complete = true;

  for (const [index, rawEdge] of root.edges.entries()) {
    const edgePath = `${path}[${index}]`;
    if (!isPlainObject(rawEdge)) {
      diagnostics.push(error("INVALID_DOCUMENT", edgePath, "edge must be a plain object"));
      complete = false;
      continue;
    }
    const authoredId = hasOwn(rawEdge, "id")
      ? requiredId(rawEdge, "id", `${edgePath}.id`, diagnostics)
      : undefined;
    if (authoredId) {
      registerId(authoredId, `${edgePath}.id`, ids, diagnostics);
    }
    const from = requiredId(rawEdge, "from", `${edgePath}.from`, diagnostics);
    const to = requiredId(rawEdge, "to", `${edgePath}.to`, diagnostics);
    const label = optionalSingleLineString(
      rawEdge,
      "label",
      `${edgePath}.label`,
      EDGE_LABEL_LIMIT,
      diagnostics,
    );
    const kind = validateEdgeKind(rawEdge, edgePath, diagnostics);
    rejectUnknownFields(rawEdge, EDGE_FIELDS, edgePath, diagnostics);

    for (const [side, endpoint] of [["from", from], ["to", to]] as const) {
      if (endpoint && nodeIds.size > 0 && !nodeIds.has(endpoint)) {
        diagnostics.push(error(
          "UNKNOWN_EDGE_ENDPOINT",
          `${edgePath}.${side}`,
          `unknown node '${endpoint}' on '${side}'`,
          "Endpoints reference nodes[].id.",
        ));
      }
    }
    if (from && to && from === to) {
      diagnostics.push(error(
        "SELF_EDGE",
        edgePath,
        `edge starts and ends at '${from}'`,
        "Remove the edge or split the node in two.",
      ));
    }
    if (!from || !to || !kind) {
      complete = false;
      continue;
    }

    const pairKey = `${from}->${to}:${kind}`;
    if (seenPairs.has(pairKey)) {
      diagnostics.push(error(
        "DUPLICATE_EDGE_PAIR",
        edgePath,
        `duplicate edge ${from} -> ${to} of kind '${kind}'`,
        "Merge the labels into a single edge.",
      ));
      complete = false;
      continue;
    }
    seenPairs.add(pairKey);

    const pair = `${from}->${to}`;
    const kinds = pairKinds.get(pair) ?? new Set<BandEdgeKind>();
    kinds.add(kind);
    pairKinds.set(pair, kinds);

    parsed.push({ from, to, kind, ...(label ? { label } : {}), ...(authoredId ? { id: authoredId } : {}) });
  }

  if (!complete) {
    return null;
  }

  // S12a: an authored id wins; otherwise derive one from the pair, disambiguated by
  // kind only when the same pair carries more than one kind.
  return parsed.map((edge) => {
    const pair = `${edge.from}->${edge.to}`;
    const derived = (pairKinds.get(pair)?.size ?? 1) > 1 ? `${pair}:${edge.kind}` : pair;
    return {
      id: edge.id ?? derived,
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: edge.label } : {}),
      kind: edge.kind,
    };
  });
}

function validateEdgeKind(
  rawEdge: Record<string, unknown>,
  edgePath: string,
  diagnostics: DiagramDiagnostic[],
): BandEdgeKind | null {
  const path = `${edgePath}.kind`;
  if (!hasOwn(rawEdge, "kind")) {
    return "primary";
  }
  const kind = rawEdge.kind;
  if (typeof kind !== "string" || !(BAND_EDGE_KINDS as readonly string[]).includes(kind)) {
    diagnostics.push(error(
      "INVALID_EDGE_KIND",
      path,
      `kind must be one of ${BAND_EDGE_KINDS.join(", ")}`,
    ));
    return null;
  }
  return kind as BandEdgeKind;
}

/** S10: a lane with no nodes anywhere carries no meaning and is rejected. */
function validateLaneOccupancy(
  lanes: BandLaneSpec[],
  nodes: BandNodeSpec[],
  diagnostics: DiagramDiagnostic[],
): void {
  const occupied = new Set(nodes.map((node) => node.lane));
  for (const [index, lane] of lanes.entries()) {
    if (!occupied.has(lane.id)) {
      diagnostics.push(error(
        "EMPTY_LANE",
        `$.lanes[${index}]`,
        `lane '${lane.id}' has no nodes`,
        "Remove the lane or move a node into it.",
      ));
    }
  }
}

/** S3: a (lane, stage) cell stacks at most three nodes before it stops being readable. */
function validateCellCapacity(
  nodes: BandNodeSpec[],
  diagnostics: DiagramDiagnostic[],
): void {
  const cells = new Map<string, number[]>();
  for (const [index, node] of nodes.entries()) {
    const key = `${node.lane}\u0000${node.stage}`;
    const indices = cells.get(key) ?? [];
    indices.push(index);
    cells.set(key, indices);
  }
  for (const [key, indices] of cells) {
    if (indices.length <= MAX_CELL_NODES) {
      continue;
    }
    const [lane, stage] = key.split("\u0000");
    diagnostics.push(error(
      "FLOW_CELL_CAPACITY_EXCEEDED",
      `$.nodes[${indices[MAX_CELL_NODES]}]`,
      `cell (lane '${lane}', stage '${stage}') holds ${indices.length} nodes, at most ${MAX_CELL_NODES} fit`,
      "Move a node to a neighbouring stage or split the stage.",
    ));
  }
}

/**
 * S7: only the primary sub-graph must be acyclic. `feedback` and `provenance` edges are
 * excluded by design — legalising back edges is the reason this template exists.
 */
function validatePrimaryAcyclic(
  nodes: BandNodeSpec[],
  edges: NormalizedBandEdgeSpec[],
  diagnostics: DiagramDiagnostic[],
): void {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (edge.kind !== "primary") {
      continue;
    }
    adjacency.get(edge.from)?.push(edge.to);
  }

  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  let cycleAt: string | null = null;

  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === DONE) {
      return false;
    }
    if (current === VISITING) {
      cycleAt = id;
      return true;
    }
    state.set(id, VISITING);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) {
        return true;
      }
    }
    state.set(id, DONE);
    return false;
  };

  for (const node of nodes) {
    if (visit(node.id)) {
      break;
    }
  }
  if (cycleAt === null) {
    return;
  }
  const edgeIndex = edges.findIndex((edge) => edge.kind === "primary" && edge.to === cycleAt);
  diagnostics.push(error(
    "CYCLIC_FLOW",
    edgeIndex >= 0 ? `$.edges[${edgeIndex}]` : "$.edges",
    `primary edges form a cycle through node '${cycleAt}'`,
    'Mark the back edge kind: "feedback".',
  ));
}
