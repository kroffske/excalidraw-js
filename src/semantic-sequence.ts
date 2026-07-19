import { Scene, measureText } from "./core.js";
import {
  Bounds,
  ElementLike,
  PointTuple,
  elementBounds,
} from "./geometry.js";
import { PlacedNodeCard, nodeCard } from "./node.js";
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
import { FittedText, fitText } from "./text.js";
import {
  DiagramBlock,
  DiagramEdge,
  ValidationIssue,
  ValidationResult,
  validateDiagram,
} from "./validate.js";

export type SequenceMessageKind = "call" | "return";

interface SequenceLegendEntry {
  readonly label: "Call" | "Return";
  readonly dashed: boolean;
  readonly color: "primary" | "neutral";
}

export interface SequenceParticipantSpec {
  id: string;
  name: string;
  status?: SemanticStatus;
}

export interface SequenceMessageSpec {
  id: string;
  from: string;
  to: string;
  label: string;
  kind?: SequenceMessageKind;
  status?: SemanticStatus;
}

export interface SequenceNoteSpec {
  id: string;
  message: string;
  text: string;
}

export interface SequenceInteractionSpec {
  template: "sequence.interaction";
  title: string;
  palette?: SemanticPaletteName;
  participants: SequenceParticipantSpec[];
  messages: SequenceMessageSpec[];
  notes?: SequenceNoteSpec[];
}

export interface NormalizedSequenceMessageSpec {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: SequenceMessageKind;
  status?: SemanticStatus;
}

export interface NormalizedSequenceInteractionSpec {
  template: "sequence.interaction";
  title: string;
  palette?: SemanticPaletteName;
  participants: SequenceParticipantSpec[];
  messages: NormalizedSequenceMessageSpec[];
  notes: SequenceNoteSpec[];
}

export type SequenceDiagramValidationResult =
  | {
      ok: true;
      value: NormalizedSequenceInteractionSpec;
      diagnostics: DiagramDiagnostic[];
    }
  | { ok: false; diagnostics: DiagramDiagnostic[] };

export interface SequenceDiagramBuildMetadata {
  template: "sequence.interaction";
  palette?: SemanticPaletteName;
  participants: Array<{
    id: string;
    name: string;
    status?: SemanticStatus;
    path: string;
    elementIds: string[];
    bounds: Bounds;
    lifeline: {
      elementId: string;
      points: PointTuple[];
    };
  }>;
  messages: Array<{
    id: string;
    from: string;
    to: string;
    label: string;
    kind: SequenceMessageKind;
    status?: SemanticStatus;
    path: string;
    elementIds: string[];
    points: PointTuple[];
    labelBounds: Bounds;
  }>;
  notes: Array<{
    id: string;
    message: string;
    text: string;
    path: string;
    elementIds: string[];
    bounds: Bounds;
    leaderPoints: PointTuple[];
  }>;
}

export type SequenceDiagramBuildResult =
  | {
      ok: true;
      scene: Scene;
      metadata: SequenceDiagramBuildMetadata;
      geometry: ValidationResult;
      diagnostics: DiagramDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: DiagramDiagnostic[];
      geometry?: ValidationResult;
    };

interface MessagePlan {
  label: FittedText;
  labelX: number;
  labelY: number;
  labelWidth: number;
  arrowY: number;
  points: PointTuple[];
  note?: NotePlan;
  rowBottom: number;
}

interface NotePlan {
  fitted: FittedText;
  x: number;
  y: number;
  width: number;
  height: number;
  leaderPoints: PointTuple[];
}

interface TitlePlan {
  fitted: FittedText;
  width: number;
}

interface RenderedSequence {
  participantBlocks: DiagramBlock[];
  noteBlocks: DiagramBlock[];
  edges: DiagramEdge[];
  metadata: SequenceDiagramBuildMetadata;
}

type SemanticPalette = ReturnType<typeof resolveSemanticPalette>;

const ROOT_FIELDS = ["template", "title", "palette", "participants", "messages", "notes"] as const;
const PARTICIPANT_FIELDS = ["id", "name", "status"] as const;
const MESSAGE_FIELDS = ["id", "from", "to", "label", "kind", "status"] as const;
const NOTE_FIELDS = ["id", "message", "text"] as const;

const STRING_LIMITS = {
  title: 80,
  participantName: 60,
  messageLabel: 100,
  noteText: 160,
} as const;

const TITLE_X = 64;
const TITLE_Y = 40;
const TITLE_SIZE = 26;
const TITLE_MIN_SIZE = 18;
const TITLE_WIDTH_STEP = 20;
const HEADER_TOP = 112;
const MIN_HEADER_WIDTH = 280;
const HEADER_WIDTH_STEP = 20;
const HEADER_PADDING = 16;
const HEADER_TITLE_SIZE = 17;
const HEADER_TITLE_MIN_SIZE = 13;
const HEADER_GAP = 80;
const LIFELINE_START_GAP = 24;
const LIFELINE_INTERVAL_STEP = 20;
const LABEL_SIDE_INSET = 24;
const LABEL_SIZE = 13;
const LABEL_MIN_SIZE = 11;
const LABEL_ARROW_GAP = 10;
const EVENT_GAP = 44;
const NOTE_WIDTH = 320;
const NOTE_PADDING = 14;
const NOTE_RAIL_GAP = 96;
const NOTE_ALIGN_OFFSET = 18;
const LIFELINE_END_GAP = 32;
const LEGEND_LINE_WIDTH = 28;
const LEGEND_LABEL_GAP = 8;
const LEGEND_ITEM_GAP = 28;
const LEGEND_PADDING_Y = 8;
const LEGEND_TEXT_SIZE = 12;
const SEQUENCE_LEGEND_ENTRIES: readonly SequenceLegendEntry[] = Object.freeze([
  Object.freeze({ label: "Call", dashed: false, color: "primary" }),
  Object.freeze({ label: "Return", dashed: true, color: "neutral" }),
]);

export function validateSequenceDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SequenceDiagramValidationResult {
  const diagnostics: DiagramDiagnostic[] = [];
  if (!isPlainObject(value)) {
    diagnostics.push(error("INVALID_DOCUMENT", "$", "diagram spec must be a plain object"));
    validateSeed(options.seed, diagnostics);
    return { ok: false, diagnostics };
  }

  const title = requiredSingleLineString(
    value,
    "title",
    "$.title",
    STRING_LIMITS.title,
    diagnostics,
  );
  const palette = readSemanticPaletteName(value, "$.palette", diagnostics);
  const ids = new Map<string, string>();
  const participants = validateParticipants(value, ids, diagnostics);
  const messages = validateMessages(value, participants ?? [], ids, diagnostics);
  const notes = validateNotes(value, messages ?? [], ids, diagnostics);
  rejectUnknownFields(value, ROOT_FIELDS, "$", diagnostics);
  validateSeed(options.seed, diagnostics);

  if (
    diagnostics.some((diagnostic) => diagnostic.severity === "error")
    || !title
    || !participants
    || !messages
    || !notes
  ) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    value: {
      template: "sequence.interaction",
      title,
      ...(palette ? { palette } : {}),
      participants,
      messages,
      notes,
    },
    diagnostics,
  };
}

export function buildSequenceDiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): SequenceDiagramBuildResult {
  const validation = validateSequenceDiagramSpec(value, options);
  if (!validation.ok) {
    return validation;
  }

  const scene = new Scene({
    seed: options.seed ?? 42,
    assetRegistry: null,
  });
  const palette = resolveSemanticPalette(validation.value.palette);
  const rendered = renderSequence(scene, validation.value, palette);
  const geometry = validateDiagram({
    blocks: [...rendered.participantBlocks, ...rendered.noteBlocks],
    edges: rendered.edges,
    gap: 20,
    tolerateEdgeLabelOverlap: true,
  });
  const geometryDiagnostics = geometry.issues.map((issue) =>
    geometryDiagnostic(issue, validation.value)
  );
  const diagnostics = [...validation.diagnostics, ...geometryDiagnostics];
  if (!geometry.ok) {
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

function validateParticipants(
  root: Record<string, unknown>,
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): SequenceParticipantSpec[] | null {
  const path = "$.participants";
  if (!hasOwn(root, "participants")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'participants' is missing"));
    return null;
  }
  if (!Array.isArray(root.participants)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "participants must be an array"));
    return null;
  }
  if (root.participants.length < 2 || root.participants.length > 6) {
    diagnostics.push(error(
      "INVALID_PARTICIPANT_COUNT",
      path,
      "participants must contain between 2 and 6 entries",
    ));
  }

  const participants: SequenceParticipantSpec[] = [];
  let complete = true;
  for (const [index, rawParticipant] of root.participants.entries()) {
    const participantPath = `${path}[${index}]`;
    if (!isPlainObject(rawParticipant)) {
      diagnostics.push(error(
        "INVALID_DOCUMENT",
        participantPath,
        "participant must be a plain object",
      ));
      complete = false;
      continue;
    }
    const id = requiredId(
      rawParticipant,
      "id",
      `${participantPath}.id`,
      diagnostics,
    );
    if (id) {
      registerId(id, `${participantPath}.id`, ids, diagnostics);
    }
    const name = requiredSingleLineString(
      rawParticipant,
      "name",
      `${participantPath}.name`,
      STRING_LIMITS.participantName,
      diagnostics,
    );
    const status = readSemanticStatus(
      rawParticipant,
      `${participantPath}.status`,
      diagnostics,
    );
    rejectUnknownFields(rawParticipant, PARTICIPANT_FIELDS, participantPath, diagnostics);
    if (!id || !name || (hasOwn(rawParticipant, "status") && !status)) {
      complete = false;
      continue;
    }
    participants.push({ id, name, ...(status ? { status } : {}) });
  }
  return complete ? participants : null;
}

function validateMessages(
  root: Record<string, unknown>,
  participants: SequenceParticipantSpec[],
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): NormalizedSequenceMessageSpec[] | null {
  const path = "$.messages";
  if (!hasOwn(root, "messages")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'messages' is missing"));
    return null;
  }
  if (!Array.isArray(root.messages)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "messages must be an array"));
    return null;
  }
  if (root.messages.length < 1 || root.messages.length > 12) {
    diagnostics.push(error(
      "INVALID_MESSAGE_COUNT",
      path,
      "messages must contain between 1 and 12 entries",
    ));
  }

  const participantIds = new Set(participants.map((participant) => participant.id));
  const messages: NormalizedSequenceMessageSpec[] = [];
  let complete = true;
  for (const [index, rawMessage] of root.messages.entries()) {
    const messagePath = `${path}[${index}]`;
    if (!isPlainObject(rawMessage)) {
      diagnostics.push(error("INVALID_DOCUMENT", messagePath, "message must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawMessage, "id", `${messagePath}.id`, diagnostics);
    if (id) {
      registerId(id, `${messagePath}.id`, ids, diagnostics);
    }
    const from = requiredId(rawMessage, "from", `${messagePath}.from`, diagnostics);
    const to = requiredId(rawMessage, "to", `${messagePath}.to`, diagnostics);
    const label = requiredSingleLineString(
      rawMessage,
      "label",
      `${messagePath}.label`,
      STRING_LIMITS.messageLabel,
      diagnostics,
    );
    const kind = validateMessageKind(rawMessage, messagePath, diagnostics);
    const status = readSemanticStatus(
      rawMessage,
      `${messagePath}.status`,
      diagnostics,
    );

    if (from && !participantIds.has(from)) {
      diagnostics.push(error(
        "UNKNOWN_PARTICIPANT_ENDPOINT",
        `${messagePath}.from`,
        `message endpoint '${from}' is not a participant id`,
      ));
    }
    if (to && !participantIds.has(to)) {
      diagnostics.push(error(
        "UNKNOWN_PARTICIPANT_ENDPOINT",
        `${messagePath}.to`,
        `message endpoint '${to}' is not a participant id`,
      ));
    }
    if (from && to && from === to) {
      diagnostics.push(error("SELF_MESSAGE", `${messagePath}.to`, "message cannot target itself"));
    }
    rejectUnknownFields(rawMessage, MESSAGE_FIELDS, messagePath, diagnostics);

    if (
      !id
      || !from
      || !to
      || !label
      || !kind
      || (hasOwn(rawMessage, "status") && !status)
    ) {
      complete = false;
      continue;
    }
    messages.push({ id, from, to, label, kind, ...(status ? { status } : {}) });
  }
  return complete ? messages : null;
}

function validateMessageKind(
  value: Record<string, unknown>,
  path: string,
  diagnostics: DiagramDiagnostic[],
): SequenceMessageKind | null {
  if (!hasOwn(value, "kind")) {
    return "call";
  }
  if (value.kind !== "call" && value.kind !== "return") {
    diagnostics.push(error(
      "INVALID_MESSAGE_KIND",
      `${path}.kind`,
      "message kind must be 'call' or 'return'",
    ));
    return null;
  }
  return value.kind;
}

function requiredSingleLineString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  maxLength: number,
  diagnostics: DiagramDiagnostic[],
): string | null {
  const normalized = requiredString(
    value,
    field,
    path,
    maxLength,
    diagnostics,
  );
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

function validateNotes(
  root: Record<string, unknown>,
  messages: NormalizedSequenceMessageSpec[],
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): SequenceNoteSpec[] | null {
  if (!hasOwn(root, "notes")) {
    return [];
  }
  const path = "$.notes";
  if (!Array.isArray(root.notes)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "notes must be an array"));
    return null;
  }
  if (root.notes.length > 8) {
    diagnostics.push(error(
      "INVALID_NOTE_COUNT",
      path,
      "notes must contain at most 8 entries",
    ));
  }

  const messageIds = new Set(messages.map((message) => message.id));
  const targetedMessages = new Set<string>();
  const notes: SequenceNoteSpec[] = [];
  let complete = true;
  for (const [index, rawNote] of root.notes.entries()) {
    const notePath = `${path}[${index}]`;
    if (!isPlainObject(rawNote)) {
      diagnostics.push(error("INVALID_DOCUMENT", notePath, "note must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawNote, "id", `${notePath}.id`, diagnostics);
    if (id) {
      registerId(id, `${notePath}.id`, ids, diagnostics);
    }
    const message = requiredId(rawNote, "message", `${notePath}.message`, diagnostics);
    const text = requiredSingleLineString(
      rawNote,
      "text",
      `${notePath}.text`,
      STRING_LIMITS.noteText,
      diagnostics,
    );
    if (message && !messageIds.has(message)) {
      diagnostics.push(error(
        "UNKNOWN_NOTE_MESSAGE",
        `${notePath}.message`,
        `note message '${message}' is not a message id`,
      ));
    }
    if (message) {
      if (targetedMessages.has(message)) {
        diagnostics.push(error(
          "DUPLICATE_NOTE_MESSAGE",
          `${notePath}.message`,
          `message '${message}' already has a note`,
        ));
      } else {
        targetedMessages.add(message);
      }
    }
    rejectUnknownFields(rawNote, NOTE_FIELDS, notePath, diagnostics);
    if (!id || !message || !text) {
      complete = false;
      continue;
    }
    notes.push({ id, message, text });
  }
  return complete ? notes : null;
}

function renderSequence(
  scene: Scene,
  spec: NormalizedSequenceInteractionSpec,
  palette: SemanticPalette,
): RenderedSequence {
  const headerWidth = measureParticipantHeaderWidth(spec);
  const interval = measureLifelineInterval(spec, headerWidth);
  const participantCenters = spec.participants.map(
    (_participant, index) => TITLE_X + headerWidth / 2 + index * interval,
  );
  const noteRailX = participantCenters[participantCenters.length - 1]
    + headerWidth / 2
    + NOTE_RAIL_GAP;
  const sceneRight = spec.notes.length > 0
    ? noteRailX + NOTE_WIDTH
    : participantCenters[participantCenters.length - 1] + headerWidth / 2;
  const title = planTitle(spec.title, sceneRight - TITLE_X);
  scene.text(TITLE_X, TITLE_Y, title.fitted.text, {
    size: title.fitted.size,
    color: palette.sequence.primary,
    width: title.width,
    lineHeight: title.fitted.lineHeight,
  });

  const legendEntries = sequenceLegendEntries(
    spec.palette,
    spec.messages.map((message) => message.kind),
  );
  const legendBandHeight = renderSequenceLegend(scene, legendEntries, palette);
  const headerTop = HEADER_TOP + legendBandHeight;
  const participantCards = spec.participants.map((participant, index) =>
    nodeCard(scene, {
      id: participant.id,
      title: participant.name,
      badge: withSemanticStatus(undefined, participant.status),
      x: participantCenters[index] - headerWidth / 2,
      y: headerTop,
      width: headerWidth,
      titleSize: HEADER_TITLE_SIZE,
      titleMinSize: HEADER_TITLE_MIN_SIZE,
      titleMaxLines: 2,
      strict: true,
      color: semanticStatusColor(
        palette,
        participant.status,
        palette.sequence.primary,
      ),
    })
  );
  const headerBottom = Math.max(...participantCards.map((card) => card.bounds.bottom));
  bottomAlignCards(participantCards, headerBottom);

  const lifelineStart = headerBottom + LIFELINE_START_GAP;
  const messagePlans = planMessages(
    spec,
    participantCenters,
    noteRailX,
    lifelineStart + 28,
  );
  const lifelineEnd = messagePlans[messagePlans.length - 1].rowBottom
    + LIFELINE_END_GAP;
  const lifelines = participantCenters.map((centerX) =>
    scene.line([[centerX, lifelineStart], [centerX, lifelineEnd]], {
      color: palette.sequence.neutral,
      strokeWidth: 1,
      dashed: true,
    })
  );

  const participantBlocks = participantCards.map((card) => ({
    id: card.id,
    bounds: card.bounds,
    kind: "node" as const,
    overflowed: card.overflowed,
    texts: card.texts,
    padding: 0,
  }));
  const noteBlocks: DiagramBlock[] = [];
  const edges: DiagramEdge[] = [];
  const messagesMetadata: SequenceDiagramBuildMetadata["messages"] = [];
  const notesMetadata: SequenceDiagramBuildMetadata["notes"] = [];
  const noteByMessage = new Map(spec.notes.map((note, index) => [
    note.message,
    { note, index },
  ]));

  for (const [index, message] of spec.messages.entries()) {
    const plan = messagePlans[index];
    const messageColor = semanticStatusColor(
      palette,
      message.status,
      message.kind === "return"
        ? palette.sequence.neutral
        : palette.sequence.primary,
    );
    const arrow = scene.arrow(plan.points, {
      color: messageColor,
      strokeWidth: 2,
      dashed: message.kind === "return",
    });
    const label = scene.text(
      plan.labelX,
      plan.labelY,
      plan.label.text,
      {
        size: plan.label.size,
        color: message.status ? messageColor : palette.sequence.text,
        width: plan.labelWidth,
        lineHeight: plan.label.lineHeight,
        align: "center",
      },
    );
    edges.push({
      id: message.id,
      from: message.from,
      to: message.to,
      points: plan.points,
      label: {
        id: `${message.id}.label`,
        bounds: elementBounds(label),
      },
    });
    messagesMetadata.push({
      ...message,
      path: `$.messages[${index}]`,
      elementIds: elementIds([arrow, label]),
      points: copyPoints(plan.points),
      labelBounds: elementBounds(label),
    });

    const noteEntry = noteByMessage.get(message.id);
    if (noteEntry && plan.note) {
      const noteFrame = scene.rect(
        plan.note.x,
        plan.note.y,
        plan.note.width,
        plan.note.height,
        { color: palette.sequence.neutral, strokeWidth: 1 },
      );
      const noteText = scene.text(
        plan.note.x + NOTE_PADDING,
        plan.note.y + NOTE_PADDING,
        plan.note.fitted.text,
        {
          size: plan.note.fitted.size,
          color: palette.sequence.text,
          width: plan.note.width - NOTE_PADDING * 2,
          lineHeight: plan.note.fitted.lineHeight,
        },
      );
      const leader = scene.line(plan.note.leaderPoints, {
        color: palette.sequence.neutral,
        strokeWidth: 1,
        dashed: true,
      });
      scene.group([noteFrame, noteText]);
      noteBlocks.push({
        id: noteEntry.note.id,
        bounds: elementBounds(noteFrame),
        kind: "note",
        overflowed: plan.note.fitted.overflowed,
        texts: [noteText],
        padding: NOTE_PADDING,
      });
      notesMetadata.push({
        ...noteEntry.note,
        path: `$.notes[${noteEntry.index}]`,
        elementIds: elementIds([noteFrame, noteText, leader]),
        bounds: elementBounds(noteFrame),
        leaderPoints: copyPoints(plan.note.leaderPoints),
      });
    }
  }

  return {
    participantBlocks,
    noteBlocks,
    edges,
    metadata: {
      template: "sequence.interaction",
      ...(spec.palette ? { palette: spec.palette } : {}),
      participants: spec.participants.map((participant, index) => ({
        ...participant,
        path: `$.participants[${index}]`,
        elementIds: elementIds([
          ...participantCards[index].block.elements,
          lifelines[index],
        ]),
        bounds: participantCards[index].bounds,
        lifeline: {
          elementId: String(lifelines[index].id),
          points: [
            [participantCenters[index], lifelineStart],
            [participantCenters[index], lifelineEnd],
          ],
        },
      })),
      messages: messagesMetadata,
      notes: spec.notes.map((note) =>
        notesMetadata.find((metadata) => metadata.id === note.id)!
      ),
    },
  };
}

function renderSequenceLegend(
  scene: Scene,
  entries: readonly SequenceLegendEntry[],
  palette: SemanticPalette,
): number {
  if (entries.length === 0) {
    return 0;
  }

  const textHeight = measureText("Return", { size: LEGEND_TEXT_SIZE }).height;
  const bandHeight = Math.ceil(textHeight + LEGEND_PADDING_Y * 2);
  const top = HEADER_TOP + LEGEND_PADDING_Y;
  const lineY = top + textHeight / 2;
  let x = TITLE_X;
  for (const entry of entries) {
    const color = palette.sequence[entry.color];
    scene.line([[x, lineY], [x + LEGEND_LINE_WIDTH, lineY]], {
      color,
      strokeWidth: 2,
      dashed: entry.dashed,
    });
    const labelWidth = measureText(entry.label, {
      size: LEGEND_TEXT_SIZE,
    }).width;
    scene.text(
      x + LEGEND_LINE_WIDTH + LEGEND_LABEL_GAP,
      top,
      entry.label,
      {
        size: LEGEND_TEXT_SIZE,
        color: palette.sequence.text,
        width: labelWidth,
      },
    );
    x += LEGEND_LINE_WIDTH
      + LEGEND_LABEL_GAP
      + labelWidth
      + LEGEND_ITEM_GAP;
  }
  return bandHeight;
}

function sequenceLegendEntries(
  palette: SemanticPaletteName | undefined,
  messageKinds: readonly SequenceMessageKind[],
): readonly SequenceLegendEntry[] {
  if (
    palette === undefined
    || !messageKinds.includes("call")
    || !messageKinds.includes("return")
  ) {
    return [];
  }
  return SEQUENCE_LEGEND_ENTRIES;
}

function measureParticipantHeaderWidth(
  spec: NormalizedSequenceInteractionSpec,
): number {
  let width = MIN_HEADER_WIDTH;
  while (
    spec.participants.some((participant, index) =>
      fitText(participant.name, {
        id: `participants[${index}].name`,
        width: width - HEADER_PADDING * 2,
        size: HEADER_TITLE_SIZE,
        minSize: HEADER_TITLE_MIN_SIZE,
        maxLines: 2,
        overflow: "shrink",
      }).overflowed
    )
  ) {
    width += HEADER_WIDTH_STEP;
  }
  return width;
}

function planTitle(
  title: string,
  minimumWidth: number,
): TitlePlan {
  let width = minimumWidth;
  while (true) {
    const fitted = fitText(title, {
      id: "title",
      width,
      size: TITLE_SIZE,
      minSize: TITLE_MIN_SIZE,
      maxLines: 2,
      overflow: "shrink",
    });
    if (!fitted.overflowed) {
      return { fitted, width };
    }
    width += TITLE_WIDTH_STEP;
  }
}

function measureLifelineInterval(
  spec: NormalizedSequenceInteractionSpec,
  headerWidth: number,
): number {
  const participantIndex = new Map(
    spec.participants.map((participant, index) => [participant.id, index]),
  );
  let interval = headerWidth + HEADER_GAP;
  while (true) {
    const allLabelsFit = spec.messages.every((message, index) => {
      const fromIndex = participantIndex.get(message.from)!;
      const toIndex = participantIndex.get(message.to)!;
      const distance = Math.abs(toIndex - fromIndex);
      const width = distance * interval - LABEL_SIDE_INSET * 2;
      return !fitMessageLabel(
        withSemanticStatus(message.label, message.status)!,
        index,
        width,
        "shrink",
      ).overflowed;
    });
    if (allLabelsFit) {
      return interval;
    }
    interval += LIFELINE_INTERVAL_STEP;
  }
}

function planMessages(
  spec: NormalizedSequenceInteractionSpec,
  participantCenters: number[],
  noteRailX: number,
  firstRowY: number,
): MessagePlan[] {
  const participantIndex = new Map(
    spec.participants.map((participant, index) => [participant.id, index]),
  );
  const noteByMessage = new Map(spec.notes.map((note) => [note.message, note]));
  const plans: MessagePlan[] = [];
  let rowY = firstRowY;

  for (const [index, message] of spec.messages.entries()) {
    const fromX = participantCenters[participantIndex.get(message.from)!];
    const toX = participantCenters[participantIndex.get(message.to)!];
    const labelX = Math.min(fromX, toX) + LABEL_SIDE_INSET;
    const labelWidth = Math.abs(toX - fromX) - LABEL_SIDE_INSET * 2;
    const label = fitMessageLabel(
      withSemanticStatus(message.label, message.status)!,
      index,
      labelWidth,
    );
    const arrowY = rowY + label.height + LABEL_ARROW_GAP;
    const noteSpec = noteByMessage.get(message.id);
    const note = noteSpec
      ? planNote(noteSpec, index, noteRailX, arrowY, participantCenters)
      : undefined;
    const rowBottom = Math.max(
      arrowY + 2,
      note ? note.y + note.height : arrowY + 2,
    );
    plans.push({
      label,
      labelX,
      labelY: rowY,
      labelWidth,
      arrowY,
      points: [[fromX, arrowY], [toX, arrowY]],
      note,
      rowBottom,
    });
    rowY = rowBottom + EVENT_GAP;
  }
  return plans;
}

function fitMessageLabel(
  label: string,
  index: number,
  width: number,
  overflow: "error" | "shrink" = "error",
): FittedText {
  return fitText(`${index + 1}. ${label}`, {
    id: `messages[${index}].label`,
    width,
    size: LABEL_SIZE,
    minSize: LABEL_MIN_SIZE,
    maxLines: 2,
    overflow,
  });
}

function planNote(
  note: SequenceNoteSpec,
  messageIndex: number,
  noteRailX: number,
  arrowY: number,
  participantCenters: number[],
): NotePlan {
  const fitted = fitText(`${messageIndex + 1}. Note\n${note.text}`, {
    id: note.id,
    width: NOTE_WIDTH - NOTE_PADDING * 2,
    size: 12,
    minSize: 11,
    maxLines: 8,
    overflow: "error",
  });
  const height = fitted.height + NOTE_PADDING * 2;
  return {
    fitted,
    x: noteRailX,
    y: arrowY - NOTE_ALIGN_OFFSET,
    width: NOTE_WIDTH,
    height,
    leaderPoints: [
      [participantCenters[participantCenters.length - 1] + 24, arrowY],
      [noteRailX, arrowY],
    ],
  };
}

function bottomAlignCards(cards: PlacedNodeCard[], bottom: number): void {
  for (const card of cards) {
    card.block.translated(0, bottom - card.bounds.bottom);
    card.bounds = card.block.bounds;
  }
}

function geometryDiagnostic(
  issue: ValidationIssue,
  spec: NormalizedSequenceInteractionSpec,
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
  spec: NormalizedSequenceInteractionSpec,
): string {
  for (const [index, message] of spec.messages.entries()) {
    if (issue.ids.includes(message.id) || issue.ids.includes(`${message.id}.label`)) {
      return `$.messages[${index}]`;
    }
  }
  for (const [index, note] of spec.notes.entries()) {
    if (issue.ids.includes(note.id) || issue.ids.includes(`${note.id}.leader`)) {
      return `$.notes[${index}]`;
    }
  }
  for (const [index, participant] of spec.participants.entries()) {
    if (issue.ids.includes(participant.id)) {
      return `$.participants[${index}]`;
    }
  }
  return "$";
}

function elementIds(elements: ElementLike[]): string[] {
  return elements.flatMap((element) =>
    typeof element.id === "string" ? [element.id] : []
  );
}

function copyPoints(points: PointTuple[]): PointTuple[] {
  return points.map(([x, y]) => [x, y]);
}
