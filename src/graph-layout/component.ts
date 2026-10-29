import type { Box, Diagnostic, Point, Size } from './types.js';

/** Measured content and caller-resolved child order, independent of domain semantics. */
export interface ComponentLayoutNode extends Size {
  id: string;
  children: readonly string[];
}

export interface ComponentLayoutRelation {
  id: string;
  from: string;
  to: string;
  label: string;
  /** The caller has selected the ownership-label rail below the source header. */
  headerRail: boolean;
}

export interface ComponentLayoutRequest {
  nodes: readonly ComponentLayoutNode[];
  roots: readonly string[];
  relations: readonly ComponentLayoutRelation[];
  direction: 'LR' | 'TB';
  labelFontSize: number;
}

/** Arrow origin and points relative to that origin, ready for native conversion. */
export interface ComponentEdgeGeometry {
  x: number;
  y: number;
  points: Point[];
}

export interface ComponentLayoutResult {
  boxes: Map<string, Box>;
  containers: Set<string>;
  direction: 'LR' | 'TB';
  edgeGeometry: Map<string, ComponentEdgeGeometry>;
}

export class ComponentLayoutError extends Error {
  readonly code = 'INVALID_LAYOUT_REQUEST';
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = 'ComponentLayoutError';
    this.diagnostics = diagnostics;
  }
}

const MARGIN = 80;
const ROOT_GAP = 96;
const INSET = 48;

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const pathPart = (id: string) => id.replace(/~/gu, '~0').replace(/\//gu, '~1');

function refuse(path: string, message: string, subject: Pick<Diagnostic, 'nodeId' | 'edgeId'> = {}): never {
  throw new ComponentLayoutError('Invalid component layout request.', [{ code: 'INVALID_LAYOUT_REQUEST', path, message, ...subject }]);
}

/** Validate the complete forest before any geometry is calculated. */
function validateRequest(request: ComponentLayoutRequest): { byId: Map<string, ComponentLayoutNode>; postorder: string[] } {
  const value: unknown = request;
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.roots) || !Array.isArray(value.relations)) {
    refuse('/', 'Component layout needs ordered node, root and relation arrays.');
  }
  if (request.direction !== 'LR' && request.direction !== 'TB') refuse('/direction', 'Direction must be LR or TB.');
  if (!positive(request.labelFontSize)) refuse('/labelFontSize', 'Label font size must be finite and positive.');

  const byId = new Map<string, ComponentLayoutNode>();
  for (const [index, node] of request.nodes.entries()) {
    const nodeId = isRecord(node) && typeof node.id === 'string' ? node.id : undefined;
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id || byId.has(node.id)
      || !positive(node.width) || !positive(node.height) || !Array.isArray(node.children)) {
      refuse(`/nodes/${index}`, 'Nodes need distinct nonempty IDs, finite positive dimensions and an ordered child array.', nodeId === undefined ? {} : { nodeId });
    }
    byId.set(node.id, node);
  }

  const roots = new Set<string>();
  for (const [index, id] of request.roots.entries()) {
    if (!byId.has(id) || roots.has(id)) refuse(`/roots/${index}`, 'Roots must be distinct known node IDs.');
    roots.add(id);
  }
  const parents = new Map<string, string>();
  for (const node of request.nodes) {
    for (const [index, id] of node.children.entries()) {
      if (!byId.has(id) || parents.has(id) || roots.has(id)) {
        refuse(`/nodes/${pathPart(node.id)}/children/${index}`, 'Every child must be a known node occurring exactly once in the forest, outside the root list.', { nodeId: node.id });
      }
      parents.set(id, node.id);
    }
  }
  for (const node of request.nodes) {
    if (!roots.has(node.id) && !parents.has(node.id)) {
      refuse(`/nodes/${pathPart(node.id)}`, 'Every node must occur in the root list or as a child.', { nodeId: node.id });
    }
  }

  const states = new Map<string, 'visiting' | 'visited'>();
  const postorder: string[] = [];
  for (const node of request.nodes) {
    if (states.has(node.id)) continue;
    const pending = [{ id: node.id, exit: false }];
    while (pending.length) {
      const { id, exit } = pending.pop()!;
      if (exit) {
        states.set(id, 'visited');
        postorder.push(id);
        continue;
      }
      if (states.get(id) === 'visiting') refuse(`/nodes/${pathPart(id)}`, 'Component children must form an acyclic forest.', { nodeId: id });
      if (states.has(id)) continue;
      states.set(id, 'visiting');
      pending.push({ id, exit: true });
      const children = byId.get(id)!.children;
      for (let index = children.length - 1; index >= 0; index--) pending.push({ id: children[index], exit: false });
    }
  }

  const edgeIds = new Set<string>();
  for (const [index, relation] of request.relations.entries()) {
    const edgeId = isRecord(relation) && typeof relation.id === 'string' ? relation.id : undefined;
    if (!isRecord(relation) || typeof relation.id !== 'string' || !relation.id || edgeIds.has(relation.id)
      || !byId.has(relation.from) || !byId.has(relation.to) || typeof relation.label !== 'string' || typeof relation.headerRail !== 'boolean') {
      refuse(`/relations/${index}`, 'Relations need distinct nonempty IDs, known endpoints, exact label text and a boolean header-rail selection.', edgeId === undefined ? {} : { edgeId });
    }
    edgeIds.add(relation.id);
  }
  return { byId, postorder };
}

function relationGeometry(from: Box, to: Box, direction: 'LR' | 'TB', headerRail: boolean): ComponentEdgeGeometry {
  if (from === to) {
    return { x: from.x + from.width, y: from.y + from.height * 0.35, points: [[0, 0], [56, 0], [56, 46], [0, 46]] };
  }
  if (headerRail) {
    const x = to.x + to.width;
    const y = from.y + 48;
    return { x, y, points: [[0, 0], [0, to.y - y]] };
  }
  // Same-rank neighbours use the perpendicular ports of the retained layout.
  if ((direction === 'LR' && from.x === to.x) || (direction === 'TB' && from.y === to.y)) direction = direction === 'LR' ? 'TB' : 'LR';
  const forward = direction === 'TB' ? to.y >= from.y : to.x >= from.x;
  const x = direction === 'TB' ? from.x + from.width / 2 : from.x + (forward ? from.width : 0);
  const y = direction === 'TB' ? from.y + (forward ? from.height : 0) : from.y + from.height / 2;
  const endX = direction === 'TB' ? to.x + to.width / 2 : to.x + (forward ? 0 : to.width);
  const endY = direction === 'TB' ? to.y + (forward ? 0 : to.height) : to.y + to.height / 2;
  return { x, y, points: [[0, 0], [endX - x, endY - y]] };
}

/** Pure measured component geometry; roots, hierarchy and relation order are caller-owned. */
export function layoutComponent(request: ComponentLayoutRequest): ComponentLayoutResult {
  const { byId, postorder } = validateRequest(request);
  const horizontal = request.direction === 'LR';
  let longest = 0;
  for (const relation of request.relations) {
    for (const line of relation.label.split('\n')) longest = Math.max(longest, [...line].length);
  }
  const corridor = Math.max(220, longest * 8 * request.labelFontSize / 16 + 60);
  if (!Number.isFinite(corridor)) refuse('/labelFontSize', 'The resolved labels and font size exceed finite corridor geometry.');

  const sizes = new Map<string, Size>();
  const headers = new Map<string, number>();
  for (const id of postorder) {
    const node = byId.get(id)!;
    const own = { width: node.width, height: node.height };
    const header = Math.max(180, own.height + 12);
    headers.set(id, header);
    const nested = node.children.map(child => sizes.get(child)!);
    const size = nested.length ? {
      width: Math.max(own.width, 2 * INSET + (horizontal ? nested.reduce((sum, child) => sum + child.width, 0) + (nested.length - 1) * corridor : Math.max(...nested.map(child => child.width)))),
      height: header + INSET + (horizontal ? Math.max(...nested.map(child => child.height)) : nested.reduce((sum, child) => sum + child.height, 0) + (nested.length - 1) * corridor),
    } : own;
    if (!positive(size.width) || !positive(size.height)) refuse(`/nodes/${pathPart(id)}`, 'Measured nesting exceeds finite component dimensions.', { nodeId: id });
    sizes.set(id, size);
  }

  const boxes = new Map<string, Box>();
  let rootCursor = MARGIN;
  for (const root of request.roots) {
    const pending = [{ id: root, x: MARGIN, y: rootCursor }];
    while (pending.length) {
      const { id, x, y } = pending.pop()!;
      const size = sizes.get(id)!;
      if (![x, y, x + size.width, y + size.height].every(Number.isFinite)) refuse(`/nodes/${pathPart(id)}`, 'Measured placement exceeds finite component coordinates.', { nodeId: id });
      boxes.set(id, { ...size, x, y });
      let cursor = horizontal ? x + INSET : y + headers.get(id)!;
      const children = byId.get(id)!.children.map(child => {
        const placement = { id: child, x: horizontal ? cursor : x + INSET, y: horizontal ? y + headers.get(id)! : cursor };
        cursor += sizes.get(child)![horizontal ? 'width' : 'height'] + corridor;
        return placement;
      });
      for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
    }
    rootCursor += sizes.get(root)!.height + ROOT_GAP;
  }

  const edgeGeometry = new Map<string, ComponentEdgeGeometry>();
  for (const relation of request.relations) {
    const geometry = relationGeometry(boxes.get(relation.from)!, boxes.get(relation.to)!, request.direction, relation.headerRail);
    if (relation.from !== relation.to && request.relations.some(other => other.from === relation.to && other.to === relation.from)) {
      const offset = relation.from < relation.to ? 36 : -36;
      const [endX, endY] = geometry.points.at(-1)!;
      const vertical = Math.abs(endY) > Math.abs(endX);
      geometry[vertical ? 'x' : 'y'] += offset;
    }
    if (!Number.isFinite(geometry.x) || !Number.isFinite(geometry.y) || geometry.points.some(point => point.some(value => !Number.isFinite(value)))) {
      refuse(`/relations/${pathPart(relation.id)}`, 'Measured relations exceed finite component coordinates.', { edgeId: relation.id });
    }
    edgeGeometry.set(relation.id, geometry);
  }
  const containers = new Set(request.nodes.filter(node => node.children.length).map(node => node.id));
  return { boxes, containers, direction: request.direction, edgeGeometry };
}
