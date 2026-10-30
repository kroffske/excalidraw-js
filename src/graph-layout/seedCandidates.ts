import { compileConstraints } from './constraints.js';
import { checkPlacementHints } from './placement.js';
import type { Box, Diagnostic, GraphLayoutRequest, Position } from './types.js';

export interface SeedLayoutOptions { movableIds: string[]; maxCandidates?: number }
export interface SeedLayoutMove { nodeId: string; from: Position; to: Position; anchorCenterX: number }
export interface SeedLayoutCandidate { id: string; request: GraphLayoutRequest; move: SeedLayoutMove | null }
export interface SeedLayoutEnumeration {
  candidates: SeedLayoutCandidate[];
  rejections: { id: string; move: SeedLayoutMove; diagnostics: Diagnostic[] }[];
  attempted: number;
  maxCandidates: number;
  truncated: boolean;
}

function fail(code: string, message: string, diagnostics: Diagnostic[] = []): never {
  throw Object.assign(new Error(message), { code, diagnostics: diagnostics.length ? diagnostics : [{ code, path: '/layout', message }] });
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Enumerate local horizontal refinements of a caller-owned generated seed.
 * This helper does not certify provenance or unlock imported/manual positions.
 * Only the caller's explicit movable IDs may change; routing and scoring remain
 * the existing engine/consumer's responsibility. No candidate changes direction.
 */
export function enumerateSeedLayouts(request: GraphLayoutRequest, options: SeedLayoutOptions): SeedLayoutEnumeration {
  const maxCandidates = options?.maxCandidates ?? 8;
  if (!record(options) || Object.keys(options).some(key => !['movableIds', 'maxCandidates'].includes(key))
    || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 8) {
    fail('SEED_CANDIDATE_OPTIONS', 'Use explicit movableIds and an integer maxCandidates from 1 to 8.');
  }
  if (!record(request) || !Array.isArray(request.nodes) || !request.nodes.length
    || request.nodes.some(node => !record(node) || typeof node.id !== 'string' || !node.id
      || !finite(node.width) || node.width <= 0 || !finite(node.height) || node.height <= 0)) {
    fail('SEED_CANDIDATE_NODES', 'Seed nodes require distinct IDs and finite positive sizes.');
  }
  const ids = request.nodes.map(node => node.id), known = new Set(ids);
  if (known.size !== ids.length) fail('SEED_CANDIDATE_NODES', 'Seed node IDs must be distinct.');
  if (Object.hasOwn(request, 'routes')) fail('SEED_CANDIDATE_ROUTES', 'Local seed refinement does not move manual-route endpoints; requests with routes are unsupported.');
  const positions = request.positions;
  if (!record(positions) || Object.keys(positions).length !== ids.length
    || Object.keys(positions).some(id => !known.has(id))
    || ids.some(id => !record(positions[id]) || Object.keys(positions[id]).some(key => !['x', 'y'].includes(key))
      || !finite(positions[id].x) || !finite(positions[id].y))) {
    fail('SEED_CANDIDATE_POSITIONS', 'Supply exact complete finite seed positions with no unknown entries.');
  }
  const movable = options.movableIds;
  if (!Array.isArray(movable) || !movable.length || new Set(movable).size !== movable.length
    || movable.some(id => typeof id !== 'string' || !known.has(id))) {
    fail('SEED_CANDIDATE_MOVABLE', 'movableIds must be a nonempty unique subset of seed node IDs.');
  }
  const constraints = compileConstraints(ids, request.constraints);
  if (!constraints.valid) fail('SEED_CANDIDATE_CONSTRAINTS', 'Original seed constraints are invalid.', constraints.diagnostics);
  const boxes = new Map<string, Box>(request.nodes.map(node => [node.id, { width: node.width, height: node.height, ...positions[node.id] }]));
  const baselineProblems = checkPlacementHints(boxes, constraints, 'error');
  if (baselineProblems.length) fail('SEED_CANDIDATE_BASELINE', 'Seed positions do not satisfy original constraints.', baselineProblems);

  const columns = [...new Set([...boxes.values()].map(box => box.x + box.width / 2))].sort((a, b) => a - b);
  const proposals: SeedLayoutMove[] = [];
  for (const nodeId of [...movable].sort()) {
    const box = boxes.get(nodeId)!, center = box.x + box.width / 2;
    const column = columns.indexOf(center);
    for (const index of [column - 1, column + 1]) {
      if (index < 0 || index >= columns.length) continue;
      const anchorCenterX = columns[index];
      proposals.push({ nodeId, from: { ...positions[nodeId] }, to: { x: anchorCenterX - box.width / 2, y: box.y }, anchorCenterX });
    }
  }
  const result: SeedLayoutEnumeration = {
    candidates: [{ id: 'seed', request: structuredClone(request), move: null }], rejections: [],
    attempted: 1, maxCandidates, truncated: proposals.length + 1 > maxCandidates,
  };
  for (const [index, move] of proposals.slice(0, maxCandidates - 1).entries()) {
    result.attempted++;
    const id = `column-${index + 1}`;
    const movedBoxes = new Map(boxes);
    movedBoxes.set(move.nodeId, { ...boxes.get(move.nodeId)!, ...move.to });
    const diagnostics = checkPlacementHints(movedBoxes, constraints, 'error');
    if (diagnostics.length) { result.rejections.push({ id, move, diagnostics }); continue; }
    const candidate = structuredClone(request);
    candidate.positions![move.nodeId] = { ...move.to };
    result.candidates.push({ id, request: candidate, move });
  }
  return result;
}
