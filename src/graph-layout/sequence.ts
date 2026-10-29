import { wrapText } from './text.js';
import type { Box, Diagnostic, Point, Size } from './types.js';

export interface SequenceParticipant extends Size { id: string }
export interface SequenceMessage { id: string; from: string; to: string; label: string }
export interface SequenceLayoutRequest {
  /** Participant and message order is resolved by the caller and retained verbatim. */
  participants: readonly SequenceParticipant[];
  messages: readonly SequenceMessage[];
  wrapLabels: boolean;
  labelFontSize: number;
}
export interface SequenceMessageLabel { text: string; centerX: number }
export interface SequenceEdgeGeometry { x: number; y: number; points: Point[] }
export interface SequenceLayoutResult {
  boxes: Map<string, Box>;
  direction: 'LR';
  messageTop: number;
  messageGap: number;
  /** Unwrapped labels remain with the caller; this map is empty when wrapping is disabled. */
  messageLabels: Map<string, SequenceMessageLabel>;
  lifelines: Map<string, Box>;
  edgeGeometry: Map<string, SequenceEdgeGeometry>;
}

export class SequenceLayoutError extends Error {
  readonly code = 'INVALID_SEQUENCE_LAYOUT_REQUEST';
  readonly path: string;
  readonly diagnostics: Diagnostic[];

  constructor(path: string, message: string, subject: Pick<Diagnostic, 'nodeId' | 'edgeId'> = {}) {
    super(message);
    this.name = 'SequenceLayoutError';
    this.path = path;
    this.diagnostics = [{ code: this.code, path, message, ...subject }];
  }
}

const MARGIN = 80;
const PARTICIPANT_GAP = 48;
const MIN_MESSAGE_GAP = 87;
const MIN_PARTICIPANT_HEIGHT = 84;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

function validateRequest(request: SequenceLayoutRequest): void {
  if (!isRecord(request) || !Array.isArray(request.participants) || !Array.isArray(request.messages)) {
    throw new SequenceLayoutError('/', 'A sequence layout request needs participant and message arrays.');
  }
  if (typeof request.wrapLabels !== 'boolean') {
    throw new SequenceLayoutError('/wrapLabels', 'The caller must explicitly select whether labels wrap.');
  }
  if (!positive(request.labelFontSize)) {
    throw new SequenceLayoutError('/labelFontSize', 'Label font size must be finite and positive.');
  }
  const participantIds = new Set<string>();
  for (const [index, participant] of request.participants.entries()) {
    const participantId = isRecord(participant) && typeof participant.id === 'string' ? participant.id : undefined;
    if (!isRecord(participant) || typeof participant.id !== 'string' || !participant.id || participantIds.has(participant.id)
      || !positive(participant.width) || !positive(participant.height)) {
      throw new SequenceLayoutError(`/participants/${index}`, 'Participants need distinct nonempty IDs and finite positive dimensions.', { nodeId: participantId });
    }
    participantIds.add(participant.id);
  }
  const messageIds = new Set<string>();
  for (const [index, message] of request.messages.entries()) {
    const messageId = isRecord(message) && typeof message.id === 'string' ? message.id : undefined;
    if (!isRecord(message) || typeof message.id !== 'string' || !message.id || messageIds.has(message.id)
      || typeof message.from !== 'string' || !participantIds.has(message.from)
      || typeof message.to !== 'string' || !participantIds.has(message.to) || typeof message.label !== 'string') {
      throw new SequenceLayoutError(`/messages/${index}`, 'Messages need distinct nonempty IDs, existing endpoints and exact label text.', { edgeId: messageId });
    }
    messageIds.add(message.id);
  }
}

function validateGeometry(result: SequenceLayoutResult): void {
  if (!Number.isFinite(result.messageTop) || !Number.isFinite(result.messageGap)) {
    throw new SequenceLayoutError('/', 'Sequence spacing exceeds the finite coordinate range.');
  }
  for (const collection of [result.boxes, result.lifelines]) {
    for (const [nodeId, box] of collection) {
      if (!Object.values(box).every(Number.isFinite)
        || !Number.isFinite(box.x + box.width) || !Number.isFinite(box.y + box.height)) {
        throw new SequenceLayoutError('/participants', 'Participant geometry exceeds the finite coordinate range.', { nodeId });
      }
    }
  }
  for (const [edgeId, label] of result.messageLabels) {
    if (!Number.isFinite(label.centerX)) {
      throw new SequenceLayoutError('/messages', 'Message label geometry exceeds the finite coordinate range.', { edgeId });
    }
  }
  for (const [edgeId, edge] of result.edgeGeometry) {
    if (!Number.isFinite(edge.x) || !Number.isFinite(edge.y) || !edge.points.every(point => point.every(Number.isFinite))) {
      throw new SequenceLayoutError('/messages', 'Message geometry exceeds the finite coordinate range.', { edgeId });
    }
  }
}

/** Pure measured sequence geometry; the caller owns identities, text and ordering. */
export function layoutSequence(request: SequenceLayoutRequest): SequenceLayoutResult {
  validateRequest(request);
  const boxes = new Map<string, Box>();
  let cursor = MARGIN;
  for (const participant of request.participants) {
    boxes.set(participant.id, { width: participant.width, height: participant.height, x: cursor, y: MARGIN });
    cursor += participant.width + PARTICIPANT_GAP;
  }

  let messageGap = MIN_MESSAGE_GAP;
  const messageLabels = new Map<string, SequenceMessageLabel>();
  if (request.wrapLabels) {
    const centers = [...boxes.values()].map(box => box.x + box.width / 2);
    for (const message of request.messages) {
      const from = boxes.get(message.from)!, to = boxes.get(message.to)!;
      const start = from.x + from.width / 2, end = to.x + to.width / 2, mid = (start + end) / 2;
      const gaps = centers.slice(1).map((right, index) => ({ left: centers[index], right }))
        .filter(gap => gap.left >= Math.min(start, end) && gap.right <= Math.max(start, end));
      // Stable sorting preserves the leftmost corridor when distances tie.
      const gap = gaps.sort((a, b) => Math.abs((a.left + a.right) / 2 - mid) - Math.abs((b.left + b.right) / 2 - mid))[0];
      const centerX = gap ? (gap.left + gap.right) / 2 : start + 56;
      const text = wrapText(message.label, gap ? gap.right - gap.left - 32 : 80, request.labelFontSize);
      messageLabels.set(message.id, { text, centerX });
      messageGap = Math.max(messageGap, text.split('\n').length * request.labelFontSize * 1.25 + 36);
    }
  }
  const messageTop = MARGIN + Math.max(...[...boxes.values()].map(box => box.height), MIN_PARTICIPANT_HEIGHT) + messageGap;
  const lifelines = new Map<string, Box>();
  for (const [id, box] of boxes) {
    const y = box.y + box.height;
    lifelines.set(id, { x: box.x + box.width / 2 - 1, y, width: 2,
      height: messageTop - y + Math.max(1, request.messages.length) * messageGap });
  }
  const edgeGeometry = new Map<string, SequenceEdgeGeometry>();
  for (const [index, message] of request.messages.entries()) {
    const from = boxes.get(message.from)!, to = boxes.get(message.to)!;
    const x = from.x + from.width / 2;
    const delta = to.x + to.width / 2 - x;
    const labelCenter = messageLabels.get(message.id)?.centerX;
    const points: Point[] = message.from === message.to ? [[0, 0], [56, 0], [56, 36], [0, 36]]
      : labelCenter === undefined ? [[0, 0], [delta, 0]] : [[0, 0], [labelCenter - x, 0], [delta, 0]];
    edgeGeometry.set(message.id, { x, y: messageTop + index * messageGap, points });
  }
  const result: SequenceLayoutResult = { boxes, direction: 'LR', messageTop, messageGap, messageLabels, lifelines, edgeGeometry };
  validateGeometry(result);
  return result;
}
