import { validateNativeBindings } from "./bindings.js";
import type { NativeBindingIssue } from "./bindings.js";
import { Scene, measureText } from "./core.js";
import {
  Bounds,
  ElementLike,
  PointTuple,
  elementBounds,
} from "./geometry.js";
import { connectRouted } from "./layout.js";
import type { RoutedConnection } from "./layout.js";
import { nodeCard } from "./node.js";
import type { PlacedNodeCard } from "./node.js";
import {
  readSemanticPaletteName,
  readSemanticStatus,
  resolveSemanticPalette,
  semanticStatusColor,
  withSemanticStatus,
} from "./semantic-palette.js";
import type {
  SemanticPaletteName,
  SemanticStatus,
} from "./semantic-palette.js";
import {
  DiagramDiagnostic,
  DiagramSpecOptions,
  error,
  hasOwn,
  isPlainObject,
  registerId,
  rejectUnknownFields,
  requiredId,
  requiredString,
  validateSeed,
} from "./semantic-schema.js";
import { fitText } from "./text.js";
import {
  DiagramBlock,
  DiagramEdge,
  ValidationIssue,
  ValidationResult,
  validateDiagram,
} from "./validate.js";

export type SwimlaneActivityType = "step" | "decision" | "artifact";

export interface SwimlaneLaneSpec {
  id: string;
  label: string;
}

export interface SwimlaneActivitySpec {
  id: string;
  lane: string;
  type: SwimlaneActivityType;
  title: string;
  status?: SemanticStatus;
}

export interface SwimlaneTransitionSpec {
  id: string;
  from: string;
  to: string;
  label?: string;
  status?: SemanticStatus;
}

export interface SwimlaneFlowSpec {
  template: "flow.swimlane";
  title: string;
  palette?: SemanticPaletteName;
  lanes: SwimlaneLaneSpec[];
  activities: SwimlaneActivitySpec[];
  transitions: SwimlaneTransitionSpec[];
}

export interface NormalizedSwimlaneActivitySpec extends SwimlaneActivitySpec {
  depth: number;
}

export interface NormalizedSwimlaneFlowSpec {
  template: "flow.swimlane";
  title: string;
  palette?: SemanticPaletteName;
  lanes: SwimlaneLaneSpec[];
  activities: NormalizedSwimlaneActivitySpec[];
  transitions: SwimlaneTransitionSpec[];
}

export type SwimlaneDiagramValidationResult =
  | {
      ok: true;
      value: NormalizedSwimlaneFlowSpec;
      diagnostics: DiagramDiagnostic[];
    }
  | { ok: false; diagnostics: DiagramDiagnostic[] };

export interface SwimlaneDiagramBuildMetadata {
  template: "flow.swimlane";
  palette?: SemanticPaletteName;
  lanes: Array<SwimlaneLaneSpec & {
    path: string;
    elementIds: string[];
    bounds: Bounds;
  }>;
  activities: Array<NormalizedSwimlaneActivitySpec & {
    path: string;
    elementIds: string[];
    frameElementId: string;
    bounds: Bounds;
  }>;
  transitions: Array<SwimlaneTransitionSpec & {
    path: string;
    elementIds: string[];
    arrowElementId: string;
    labelElementId?: string;
    points: PointTuple[];
  }>;
}

export type SwimlaneDiagramBuildResult =
  | {
      ok: true;
      scene: Scene;
      metadata: SwimlaneDiagramBuildMetadata;
      geometry: ValidationResult;
      diagnostics: DiagramDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: DiagramDiagnostic[];
      geometry?: ValidationResult;
    };

interface GraphAnalysis {
  depths: Map<string, number>;
}

interface RenderedActivity {
  spec: NormalizedSwimlaneActivitySpec;
  index: number;
  card: PlacedNodeCard;
}

interface RenderedSwimlane {
  metadata: SwimlaneDiagramBuildMetadata;
  activityBlocks: DiagramBlock[];
  edges: DiagramEdge[];
  laneBounds: Map<string, Bounds>;
  activityCards: RenderedActivity[];
}

type SemanticPalette = ReturnType<typeof resolveSemanticPalette>;

const ROOT_FIELDS = ["template", "title", "palette", "lanes", "activities", "transitions"] as const;
const LANE_FIELDS = ["id", "label"] as const;
const ACTIVITY_FIELDS = ["id", "lane", "type", "title", "status"] as const;
const TRANSITION_FIELDS = ["id", "from", "to", "label", "status"] as const;

const MIN_LANES = 2;
const MAX_LANES = 5;
const MIN_ACTIVITIES = 2;
const MAX_ACTIVITIES = 16;
const MIN_TRANSITIONS = 1;
const MAX_TRANSITIONS = 24;
const MAX_DEPTH = 6;
const MAX_CELL_ACTIVITIES = 3;

const TITLE_LIMIT = 80;
const LANE_LABEL_LIMIT = 48;
const ACTIVITY_TITLE_LIMIT = 80;
const TRANSITION_LABEL_LIMIT = 48;

const BOARD_X = 64;
const TITLE_Y = 40;
const LANE_TOP = 112;
const LANE_HEADER_WIDTH = 176;
const LANE_PADDING = 24;
const ACTIVITY_WIDTH = 260;
const COLUMN_GAP = 88;
const STACK_GAP = 24;
const LANE_GAP = 16;
const MAX_SCENE_WIDTH = 2700;

export function validateSwimlaneDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SwimlaneDiagramValidationResult {
  const diagnostics: DiagramDiagnostic[] = [];
  if (!isPlainObject(value)) {
    diagnostics.push(error("INVALID_DOCUMENT", "$", "diagram spec must be a plain object"));
    validateSeed(options.seed, diagnostics);
    return { ok: false, diagnostics };
  }

  const template = requiredTemplate(value, diagnostics);
  const title = requiredSingleLineString(
    value,
    "title",
    "$.title",
    TITLE_LIMIT,
    diagnostics,
  );
  const palette = readSemanticPaletteName(value, "$.palette", diagnostics);
  const ids = new Map<string, string>();
  const lanes = validateLanes(value, ids, diagnostics);
  const activities = validateActivities(value, lanes ?? [], ids, diagnostics);
  const transitions = validateTransitions(value, activities ?? [], ids, diagnostics);
  rejectUnknownFields(value, ROOT_FIELDS, "$", diagnostics);
  validateSeed(options.seed, diagnostics);

  let analysis: GraphAnalysis | null = null;
  if (
    template
    && title
    && lanes
    && activities
    && transitions
    && !diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    analysis = analyzeGraph(activities, transitions, diagnostics);
  }

  if (
    diagnostics.some((diagnostic) => diagnostic.severity === "error")
    || !template
    || !title
    || !lanes
    || !activities
    || !transitions
    || !analysis
  ) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    value: {
      template,
      title,
      ...(palette ? { palette } : {}),
      lanes,
      activities: activities.map((activity) => ({
        ...activity,
        depth: analysis.depths.get(activity.id)!,
      })),
      transitions,
    },
    diagnostics,
  };
}

export function buildSwimlaneDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SwimlaneDiagramBuildResult {
  const validation = validateSwimlaneDiagramSpec(value, options);
  if (!validation.ok) {
    return validation;
  }

  const scene = new Scene({ seed: options.seed ?? 42, assetRegistry: null });
  const palette = resolveSemanticPalette(validation.value.palette);
  let rendered: RenderedSwimlane;
  try {
    rendered = renderSwimlane(scene, validation.value, palette);
  } catch (caught) {
    if (caught instanceof TransitionRenderError) {
      return {
        ok: false,
        diagnostics: [
          ...validation.diagnostics,
          error(
            "NATIVE_BINDING_ERROR",
            `$.transitions[${caught.transitionIndex}]`,
            "transition could not emit native Excalidraw bindings",
          ),
        ],
      };
    }
    throw caught;
  }

  const baseGeometry = validateDiagram({
    blocks: rendered.activityBlocks,
    edges: rendered.edges,
    gap: 16,
    tolerateEdgeLabelOverlap: true,
  });
  const geometry = appendGeometryIssues(
    baseGeometry,
    localGeometryIssues(scene, rendered, validation.value),
  );
  const geometryDiagnostics = geometry.issues.map((issue) =>
    geometryDiagnostic(issue, validation.value)
  );

  const nativeBindings = validateNativeBindings(scene.elements);
  const bindingDiagnostics = nativeBindings.issues.map((issue) =>
    bindingDiagnostic(issue, rendered.metadata)
  );
  const diagnostics = [
    ...validation.diagnostics,
    ...geometryDiagnostics,
    ...bindingDiagnostics,
  ];
  if (!geometry.ok || !nativeBindings.valid) {
    return { ok: false, diagnostics, geometry };
  }

  return {
    ok: true,
    scene,
    metadata: rendered.metadata,
    geometry,
    diagnostics,
  };
}

function requiredTemplate(
  value: Record<string, unknown>,
  diagnostics: DiagramDiagnostic[],
): "flow.swimlane" | null {
  if (!hasOwn(value, "template")) {
    diagnostics.push(error("MISSING_FIELD", "$.template", "required field 'template' is missing"));
    return null;
  }
  if (typeof value.template !== "string" || value.template.trim().length === 0) {
    diagnostics.push(error("INVALID_STRING", "$.template", "template must be a non-empty string"));
    return null;
  }
  const template = value.template.trim();
  if (template !== "flow.swimlane") {
    diagnostics.push(error(
      "UNSUPPORTED_TEMPLATE",
      "$.template",
      `unsupported template '${template}'`,
      "Use 'flow.swimlane'.",
    ));
    return null;
  }
  return template;
}

function validateLanes(
  root: Record<string, unknown>,
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): SwimlaneLaneSpec[] | null {
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
    ));
  }

  const lanes: SwimlaneLaneSpec[] = [];
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
    rejectUnknownFields(rawLane, LANE_FIELDS, lanePath, diagnostics);
    if (!id || !label) {
      complete = false;
      continue;
    }
    lanes.push({ id, label });
  }
  return complete ? lanes : null;
}

function validateActivities(
  root: Record<string, unknown>,
  lanes: SwimlaneLaneSpec[],
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): SwimlaneActivitySpec[] | null {
  const path = "$.activities";
  if (!hasOwn(root, "activities")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'activities' is missing"));
    return null;
  }
  if (!Array.isArray(root.activities)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "activities must be an array"));
    return null;
  }
  if (
    root.activities.length < MIN_ACTIVITIES
    || root.activities.length > MAX_ACTIVITIES
  ) {
    diagnostics.push(error(
      "INVALID_ACTIVITY_COUNT",
      path,
      `activities must contain between ${MIN_ACTIVITIES} and ${MAX_ACTIVITIES} entries`,
    ));
  }

  const laneIds = new Set(lanes.map((lane) => lane.id));
  const activities: SwimlaneActivitySpec[] = [];
  let complete = true;
  for (const [index, rawActivity] of root.activities.entries()) {
    const activityPath = `${path}[${index}]`;
    if (!isPlainObject(rawActivity)) {
      diagnostics.push(error("INVALID_DOCUMENT", activityPath, "activity must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawActivity, "id", `${activityPath}.id`, diagnostics);
    if (id) {
      registerId(id, `${activityPath}.id`, ids, diagnostics);
    }
    const lane = requiredId(rawActivity, "lane", `${activityPath}.lane`, diagnostics);
    const type = validateActivityType(rawActivity, activityPath, diagnostics);
    const title = requiredSingleLineString(
      rawActivity,
      "title",
      `${activityPath}.title`,
      ACTIVITY_TITLE_LIMIT,
      diagnostics,
    );
    const status = readSemanticStatus(
      rawActivity,
      `${activityPath}.status`,
      diagnostics,
    );
    if (lane && !laneIds.has(lane)) {
      diagnostics.push(error(
        "UNKNOWN_ACTIVITY_LANE",
        `${activityPath}.lane`,
        `activity lane '${lane}' is not a lane id`,
      ));
    }
    rejectUnknownFields(rawActivity, ACTIVITY_FIELDS, activityPath, diagnostics);
    if (
      !id
      || !lane
      || !type
      || !title
      || (hasOwn(rawActivity, "status") && !status)
    ) {
      complete = false;
      continue;
    }
    activities.push({ id, lane, type, title, ...(status ? { status } : {}) });
  }

  if (complete) {
    const occupiedLanes = new Set(activities.map((activity) => activity.lane));
    const emptyIndex = lanes.findIndex((lane) => !occupiedLanes.has(lane.id));
    if (emptyIndex >= 0) {
      diagnostics.push(error(
        "EMPTY_LANE",
        `$.lanes[${emptyIndex}]`,
        `lane '${lanes[emptyIndex].id}' must contain at least one activity`,
      ));
    }
  }
  return complete ? activities : null;
}

function validateActivityType(
  value: Record<string, unknown>,
  path: string,
  diagnostics: DiagramDiagnostic[],
): SwimlaneActivityType | null {
  if (!hasOwn(value, "type")) {
    diagnostics.push(error("MISSING_FIELD", `${path}.type`, "required field 'type' is missing"));
    return null;
  }
  if (
    value.type !== "step"
    && value.type !== "decision"
    && value.type !== "artifact"
  ) {
    diagnostics.push(error(
      "INVALID_ACTIVITY_TYPE",
      `${path}.type`,
      "activity type must be 'step', 'decision', or 'artifact'",
    ));
    return null;
  }
  return value.type;
}

function validateTransitions(
  root: Record<string, unknown>,
  activities: SwimlaneActivitySpec[],
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): SwimlaneTransitionSpec[] | null {
  const path = "$.transitions";
  if (!hasOwn(root, "transitions")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'transitions' is missing"));
    return null;
  }
  if (!Array.isArray(root.transitions)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "transitions must be an array"));
    return null;
  }
  if (
    root.transitions.length < MIN_TRANSITIONS
    || root.transitions.length > MAX_TRANSITIONS
  ) {
    diagnostics.push(error(
      "INVALID_TRANSITION_COUNT",
      path,
      `transitions must contain between ${MIN_TRANSITIONS} and ${MAX_TRANSITIONS} entries`,
    ));
  }

  const activityIds = new Set(activities.map((activity) => activity.id));
  const pairs = new Set<string>();
  const transitions: SwimlaneTransitionSpec[] = [];
  let complete = true;
  for (const [index, rawTransition] of root.transitions.entries()) {
    const transitionPath = `${path}[${index}]`;
    if (!isPlainObject(rawTransition)) {
      diagnostics.push(error("INVALID_DOCUMENT", transitionPath, "transition must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawTransition, "id", `${transitionPath}.id`, diagnostics);
    if (id) {
      registerId(id, `${transitionPath}.id`, ids, diagnostics);
    }
    const from = requiredId(rawTransition, "from", `${transitionPath}.from`, diagnostics);
    const to = requiredId(rawTransition, "to", `${transitionPath}.to`, diagnostics);
    const label = optionalSingleLineString(
      rawTransition,
      "label",
      `${transitionPath}.label`,
      TRANSITION_LABEL_LIMIT,
      diagnostics,
    );
    const status = readSemanticStatus(
      rawTransition,
      `${transitionPath}.status`,
      diagnostics,
    );
    if (from && !activityIds.has(from)) {
      diagnostics.push(error(
        "UNKNOWN_TRANSITION_ENDPOINT",
        `${transitionPath}.from`,
        `transition endpoint '${from}' is not an activity id`,
      ));
    }
    if (to && !activityIds.has(to)) {
      diagnostics.push(error(
        "UNKNOWN_TRANSITION_ENDPOINT",
        `${transitionPath}.to`,
        `transition endpoint '${to}' is not an activity id`,
      ));
    }
    if (from && to) {
      if (from === to) {
        diagnostics.push(error(
          "SELF_TRANSITION",
          `${transitionPath}.to`,
          "transition cannot target itself",
        ));
      } else {
        const key = `${from}\u0000${to}`;
        if (pairs.has(key)) {
          diagnostics.push(error(
            "DUPLICATE_TRANSITION_PAIR",
            `${transitionPath}.to`,
            "directed transition endpoint pair is duplicated",
          ));
        } else {
          pairs.add(key);
        }
      }
    }
    rejectUnknownFields(rawTransition, TRANSITION_FIELDS, transitionPath, diagnostics);
    if (
      !id
      || !from
      || !to
      || (hasOwn(rawTransition, "label") && !label)
      || (hasOwn(rawTransition, "status") && !status)
    ) {
      complete = false;
      continue;
    }
    transitions.push({
      id,
      from,
      to,
      ...(label ? { label } : {}),
      ...(status ? { status } : {}),
    });
  }
  return complete ? transitions : null;
}

function analyzeGraph(
  activities: SwimlaneActivitySpec[],
  transitions: SwimlaneTransitionSpec[],
  diagnostics: DiagramDiagnostic[],
): GraphAnalysis | null {
  const activityIndex = new Map(
    activities.map((activity, index) => [activity.id, index]),
  );
  const indegree = new Map(activities.map((activity) => [activity.id, 0]));
  const outgoing = new Map(
    activities.map((activity) => [activity.id, [] as SwimlaneTransitionSpec[]]),
  );
  for (const transition of transitions) {
    indegree.set(transition.to, (indegree.get(transition.to) ?? 0) + 1);
    outgoing.get(transition.from)!.push(transition);
  }

  const depths = new Map(activities.map((activity) => [activity.id, 0]));
  const queue = activities
    .filter((activity) => indegree.get(activity.id) === 0)
    .map((activity) => activity.id);
  const processed = new Set<string>();
  while (queue.length > 0) {
    queue.sort((left, right) => activityIndex.get(left)! - activityIndex.get(right)!);
    const id = queue.shift()!;
    processed.add(id);
    for (const transition of outgoing.get(id)!) {
      depths.set(
        transition.to,
        Math.max(depths.get(transition.to)!, depths.get(id)! + 1),
      );
      const remaining = indegree.get(transition.to)! - 1;
      indegree.set(transition.to, remaining);
      if (remaining === 0) {
        queue.push(transition.to);
      }
    }
  }

  if (processed.size !== activities.length) {
    const residual = new Set(
      activities
        .filter((activity) => !processed.has(activity.id))
        .map((activity) => activity.id),
    );
    const transitionIndex = transitions.findIndex((transition) =>
      residual.has(transition.from) && residual.has(transition.to)
    );
    diagnostics.push(error(
      "CYCLIC_FLOW",
      transitionIndex >= 0 ? `$.transitions[${transitionIndex}]` : "$.transitions",
      "activity flow must be acyclic",
      "Remove retry/back edges or describe them in a separate acyclic view.",
    ));
    return null;
  }

  const depthIndex = activities.findIndex((activity) =>
    depths.get(activity.id)! > MAX_DEPTH
  );
  if (depthIndex >= 0) {
    diagnostics.push(error(
      "FLOW_DEPTH_EXCEEDED",
      `$.activities[${depthIndex}]`,
      `activity depth must not exceed ${MAX_DEPTH}`,
      "Shorten the longest chain or split the flow into multiple diagrams.",
    ));
    return null;
  }

  const cellCounts = new Map<string, number>();
  for (const [index, activity] of activities.entries()) {
    const key = `${activity.lane}\u0000${depths.get(activity.id)!}`;
    const count = (cellCounts.get(key) ?? 0) + 1;
    cellCounts.set(key, count);
    if (count > MAX_CELL_ACTIVITIES) {
      diagnostics.push(error(
        "FLOW_CELL_CAPACITY_EXCEEDED",
        `$.activities[${index}]`,
        `a lane-depth cell may contain at most ${MAX_CELL_ACTIVITIES} activities`,
        "Move an activity to another lane/depth or split the flow.",
      ));
      return null;
    }
  }
  return { depths };
}

function renderSwimlane(
  scene: Scene,
  spec: NormalizedSwimlaneFlowSpec,
  palette: SemanticPalette,
): RenderedSwimlane {
  const maxDepth = Math.max(...spec.activities.map((activity) => activity.depth));
  const boardWidth = laneBoardWidth(maxDepth);
  const title = fitText(spec.title, {
    id: "swimlane.title",
    width: boardWidth,
    size: 26,
    minSize: 18,
    maxLines: 2,
    overflow: "error",
  });
  scene.text(BOARD_X, TITLE_Y, title.text, {
    size: title.size,
    color: palette.swimlane.primary,
    width: boardWidth,
    lineHeight: title.lineHeight,
  });

  const activityCards = spec.activities.map((activity, index) => {
    const card = nodeCard(scene, {
      id: activity.id,
      title: activity.title,
      badge: withSemanticStatus(
        activity.type.toUpperCase(),
        activity.status,
      ),
      width: ACTIVITY_WIDTH,
      color: semanticStatusColor(
        palette,
        activity.status,
        activityColor(activity.type, palette),
      ),
      strict: true,
      titleMaxLines: 4,
      titleMinSize: 12,
    });
    if (activity.type === "artifact") {
      card.frame.strokeStyle = "dashed";
    }
    return { spec: activity, index, card };
  });

  const cells = groupActivityCells(activityCards);
  const laneHeights = new Map<string, number>();
  for (const lane of spec.lanes) {
    const cellHeights = Array.from(cells.entries())
      .filter(([key]) => key.startsWith(`${lane.id}\u0000`))
      .map(([, cards]) =>
        cards.reduce(
          (height, entry, index) =>
            height + entry.card.bounds.height + (index === 0 ? 0 : STACK_GAP),
          0,
        )
      );
    laneHeights.set(
      lane.id,
      Math.max(...cellHeights, 0) + LANE_PADDING * 2,
    );
  }

  const laneBounds = new Map<string, Bounds>();
  const laneMetadata: SwimlaneDiagramBuildMetadata["lanes"] = [];
  let laneY = LANE_TOP;
  for (const [laneIndex, lane] of spec.lanes.entries()) {
    const height = laneHeights.get(lane.id)!;
    const bounds = new Bounds(BOARD_X, laneY, boardWidth, height);
    laneBounds.set(lane.id, bounds);
    const frame = scene.rect(bounds.x, bounds.y, bounds.width, bounds.height, {
      color: palette.swimlane.neutral,
      strokeWidth: 1,
    });
    const fitted = fitText(lane.label, {
      id: `lanes[${laneIndex}].label`,
      width: LANE_HEADER_WIDTH - LANE_PADDING * 2,
      size: 15,
      minSize: 11,
      maxLines: 3,
      overflow: "error",
    });
    const label = scene.text(
      bounds.x + LANE_PADDING,
      bounds.centerY - fitted.height / 2,
      fitted.text,
      {
        size: fitted.size,
        color: palette.swimlane.text,
        width: LANE_HEADER_WIDTH - LANE_PADDING * 2,
        lineHeight: fitted.lineHeight,
      },
    );
    const divider = scene.line([
      [bounds.x + LANE_HEADER_WIDTH, bounds.top],
      [bounds.x + LANE_HEADER_WIDTH, bounds.bottom],
    ], { color: palette.swimlane.neutral, strokeWidth: 1 });
    laneMetadata.push({
      ...lane,
      path: `$.lanes[${laneIndex}]`,
      elementIds: elementIds([frame, label, divider]),
      bounds,
    });
    laneY += height + LANE_GAP;
  }

  for (const [key, entries] of cells) {
    const [laneId, rawDepth] = key.split("\u0000");
    const depth = Number(rawDepth);
    const lane = laneBounds.get(laneId)!;
    let y = lane.top + LANE_PADDING;
    for (const entry of entries) {
      const x = BOARD_X
        + LANE_HEADER_WIDTH
        + LANE_PADDING
        + depth * (ACTIVITY_WIDTH + COLUMN_GAP);
      entry.card.block.translated(
        x - entry.card.block.bounds.left,
        y - entry.card.block.bounds.top,
      );
      entry.card.bounds = entry.card.block.bounds;
      y += entry.card.bounds.height + STACK_GAP;
    }
  }

  const activityMetadata: SwimlaneDiagramBuildMetadata["activities"] =
    activityCards.map(({ spec: activity, index, card }) => ({
      ...activity,
      path: `$.activities[${index}]`,
      elementIds: elementIds(card.block.elements),
      frameElementId: String(card.frame.id),
      bounds: card.bounds,
    }));

  const transitions = renderTransitions(
    scene,
    spec,
    activityCards,
    new Bounds(
      BOARD_X,
      LANE_TOP,
      boardWidth,
      laneY - LANE_TOP - LANE_GAP,
    ),
    palette,
  );
  return {
    metadata: {
      template: "flow.swimlane",
      ...(spec.palette ? { palette: spec.palette } : {}),
      lanes: laneMetadata,
      activities: activityMetadata,
      transitions: transitions.metadata,
    },
    activityBlocks: activityCards.map(({ spec: activity, card }) => ({
      id: activity.id,
      bounds: card.bounds,
      kind: "node",
      overflowed: card.overflowed,
      texts: card.texts,
      padding: 0,
    })),
    edges: transitions.edges,
    laneBounds,
    activityCards,
  };
}

function groupActivityCells(
  activities: RenderedActivity[],
): Map<string, RenderedActivity[]> {
  const cells = new Map<string, RenderedActivity[]>();
  for (const activity of activities) {
    const key = `${activity.spec.lane}\u0000${activity.spec.depth}`;
    const cell = cells.get(key) ?? [];
    cell.push(activity);
    cells.set(key, cell);
  }
  return cells;
}

function renderTransitions(
  scene: Scene,
  spec: NormalizedSwimlaneFlowSpec,
  activities: RenderedActivity[],
  boardBounds: Bounds,
  palette: SemanticPalette,
): {
  edges: DiagramEdge[];
  metadata: SwimlaneDiagramBuildMetadata["transitions"];
} {
  const activitiesById = new Map(
    activities.map((activity) => [activity.spec.id, activity]),
  );
  const priorRoutes: PointTuple[][] = [];
  const priorLabels: ElementLike[] = [];
  const edges: DiagramEdge[] = [];
  const metadata: SwimlaneDiagramBuildMetadata["transitions"] = [];

  for (const [index, transition] of spec.transitions.entries()) {
    const source = activitiesById.get(transition.from)!;
    const target = activitiesById.get(transition.to)!;
    let connection: RoutedConnection;
    const label = withSemanticStatus(transition.label, transition.status);
    const color = semanticStatusColor(
      palette,
      transition.status,
      palette.swimlane.neutral,
    );
    try {
      connection = connectRouted(scene, source.card.block, target.card.block, {
        bindings: true,
        direction: "left-to-right",
        path: "auto",
        label,
        labelWidth: label
          ? measuredTransitionLabelWidth(label)
          : 160,
        labelSize: 11,
        labelColor: transition.status ? color : palette.swimlane.text,
        color,
        strokeWidth: 2,
        routeBounds: boardBounds,
        outerGap: 44,
        clearance: 16,
        obstacles: activities
          .filter((activity) => activity !== source && activity !== target)
          .map((activity) => activity.card.block),
        avoidRoutes: priorRoutes,
        avoidLabels: priorLabels,
      });
    } catch {
      throw new TransitionRenderError(index);
    }

    const labelId = connection.label ? `${transition.id}.label` : undefined;
    edges.push({
      id: transition.id,
      from: transition.from,
      to: transition.to,
      points: connection.points,
      label: connection.label && labelId
        ? { id: labelId, bounds: elementBounds(connection.label) }
        : undefined,
    });
    priorRoutes.push(connection.points);
    if (connection.label) {
      priorLabels.push(connection.label);
    }
    metadata.push({
      ...transition,
      path: `$.transitions[${index}]`,
      elementIds: elementIds([
        connection.arrow,
        ...(connection.label ? [connection.label] : []),
      ]),
      arrowElementId: String(connection.arrow.id),
      ...(connection.label
        ? { labelElementId: String(connection.label.id) }
        : {}),
      points: copyPoints(connection.points),
    });
  }
  return { edges, metadata };
}

function localGeometryIssues(
  scene: Scene,
  rendered: RenderedSwimlane,
  spec: NormalizedSwimlaneFlowSpec,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const activity of rendered.activityCards) {
    const lane = rendered.laneBounds.get(activity.spec.lane)!;
    if (
      activity.card.bounds.left < lane.left + LANE_HEADER_WIDTH + LANE_PADDING
      || activity.card.bounds.right > lane.right - LANE_PADDING
      || activity.card.bounds.top < lane.top + LANE_PADDING
      || activity.card.bounds.bottom > lane.bottom - LANE_PADDING
    ) {
      issues.push({
        code: "output-clipped",
        severity: "error",
        message: `activity '${activity.spec.id}' lies outside its lane content bounds`,
        ids: [activity.spec.id],
      });
    }
  }
  if (scene.bounds().width > MAX_SCENE_WIDTH) {
    issues.push({
      code: "output-clipped",
      severity: "error",
      message: `swimlane scene width exceeds ${MAX_SCENE_WIDTH}px`,
      ids: [spec.activities.at(-1)?.id ?? "$"],
    });
  }
  return issues;
}

function appendGeometryIssues(
  base: ValidationResult,
  extra: ValidationIssue[],
): ValidationResult {
  if (extra.length === 0) {
    return base;
  }
  const issues = [...base.issues, ...extra];
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warn"),
  };
}

function geometryDiagnostic(
  issue: ValidationIssue,
  spec: NormalizedSwimlaneFlowSpec,
): DiagramDiagnostic {
  return {
    severity: issue.severity === "error" ? "error" : "warning",
    code: "GEOMETRY_ERROR",
    path: geometryIssuePath(issue, spec),
    message: `[${issue.code}] ${issue.message}`,
  };
}

function geometryIssuePath(
  issue: ValidationIssue,
  spec: NormalizedSwimlaneFlowSpec,
): string {
  for (const [index, transition] of spec.transitions.entries()) {
    if (
      issue.ids.includes(transition.id)
      || issue.ids.includes(`${transition.id}.label`)
    ) {
      return `$.transitions[${index}]`;
    }
  }
  for (const [index, activity] of spec.activities.entries()) {
    if (issue.ids.includes(activity.id)) {
      return `$.activities[${index}]`;
    }
  }
  return "$";
}

function bindingDiagnostic(
  issue: NativeBindingIssue,
  metadata: SwimlaneDiagramBuildMetadata,
): DiagramDiagnostic {
  return error(
    "NATIVE_BINDING_ERROR",
    bindingIssuePath(issue, metadata),
    `[${issue.code}] ${issue.message}`,
  );
}

function bindingIssuePath(
  issue: NativeBindingIssue,
  metadata: SwimlaneDiagramBuildMetadata,
): string {
  const arrowOwner = metadata.transitions.find((transition) =>
    transition.arrowElementId === issue.elementId
    || transition.arrowElementId === issue.targetId
  );
  if (arrowOwner) {
    return arrowOwner.path;
  }

  const activity = metadata.activities.find((entry) =>
    entry.frameElementId === issue.elementId
    || entry.frameElementId === issue.targetId
  );
  if (!activity) {
    return "$";
  }
  return metadata.transitions.find(
    (transition) =>
      transition.from === activity.id || transition.to === activity.id,
  )?.path ?? "$";
}

function requiredSingleLineString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  maxLength: number,
  diagnostics: DiagramDiagnostic[],
): string | null {
  const normalized = requiredString(value, field, path, maxLength, diagnostics);
  if (normalized && /[\r\n\u2028\u2029]/u.test(normalized)) {
    diagnostics.push(error(
      "INVALID_STRING",
      path,
      `'${field}' must not contain line breaks`,
    ));
    return null;
  }
  return normalized;
}

function optionalSingleLineString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  maxLength: number,
  diagnostics: DiagramDiagnostic[],
): string | undefined {
  if (!hasOwn(value, field)) {
    return undefined;
  }
  return requiredSingleLineString(value, field, path, maxLength, diagnostics)
    ?? undefined;
}

function laneBoardWidth(maxDepth: number): number {
  const columns = maxDepth + 1;
  return LANE_HEADER_WIDTH
    + LANE_PADDING * 2
    + columns * ACTIVITY_WIDTH
    + (columns - 1) * COLUMN_GAP;
}

function activityColor(
  type: SwimlaneActivityType,
  palette: SemanticPalette,
): string {
  switch (type) {
    case "step":
      return palette.swimlane.primary;
    case "decision":
      return palette.swimlane.accent;
    case "artifact":
      return palette.swimlane.neutral;
  }
}

function measuredTransitionLabelWidth(label: string): number {
  return Math.max(160, measureText(label, { size: 11 }).width + 16);
}

function elementIds(elements: ElementLike[]): string[] {
  return elements.flatMap((element) =>
    typeof element.id === "string" ? [element.id] : []
  );
}

function copyPoints(points: PointTuple[]): PointTuple[] {
  return points.map(([x, y]) => [x, y]);
}

class TransitionRenderError extends Error {
  constructor(readonly transitionIndex: number) {
    super(`transition ${transitionIndex} could not be rendered`);
    this.name = "TransitionRenderError";
  }
}
