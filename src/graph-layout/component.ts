import { estimateEdgeLabel, excalidrawLabelPath, placeRouteLabels, segmentEntersOpenBox } from './labels.js';
import { routeEdges, RoutingError } from './routing.js';
import { wrapText } from './text.js';
import type { AvoidRuntime } from './runtime-types.js';
import type { Bounds, Box, Diagnostic, EdgeRoute, LayoutEdge, Point, Size } from './types.js';

export { ComponentLayoutError } from './types.js';
export type { ComponentComposition, ComponentLayoutNode, ComponentLayoutRelation, ComponentLayoutRequest,
  ComponentEdgeGeometry, ComponentLayoutResult, ComponentLayoutOptions, ComponentMessageLabel,
  RoutedComponentLayoutResult, CompactComponentLayoutOptions, CompactComponentPaint, RoundStrokePaint, PointError } from './types.js';
import { ComponentLayoutError } from './types.js';
import type { ComponentComposition, ComponentLayoutNode, ComponentLayoutRequest, ComponentEdgeGeometry,
  ComponentLayoutResult, ComponentLayoutOptions, ComponentMessageLabel, RoutedComponentLayoutResult,
  CompactComponentLayoutOptions } from './types.js';
import { layoutCompactComponent } from './component-compact.js';

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
function layoutLegacyComponent(request: ComponentLayoutRequest): ComponentLayoutResult {
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

const COMPONENT_GAPS = { row: 160, column: 112 } as const;
const COMPONENT_INSET = 32;
const HEADER_GAP = 24;
// Excalidraw 0.18.1 getBoundTextMaxWidth guarantees this font-size floor for arrow labels.
const NATIVE_ARROW_LABEL_MIN_WIDTH_RATIO = 11;
const LABEL_CANDIDATE_LIMIT = 16384;
const LABEL_PADDING = 12;
const EPSILON = 1e-6;
interface CompositionGroup { axis: 'row' | 'column'; children: (string | CompositionGroup)[] }
interface MeasuredComposition extends Size { placements: { id: string; x: number; y: number }[] }
interface BoundarySegment { nodeId: string; points: [Point, Point] }
const boxBounds = (box: Box): Bounds => ({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height });
const boxCenter = (box: Box): Point => [box.x + box.width / 2, box.y + box.height / 2];
const overlap = (a: Box, b: Box, padding = 0) => a.x - padding < b.x + b.width && b.x < a.x + a.width + padding
  && a.y - padding < b.y + b.height && b.y < a.y + a.height + padding;

/** Validate the complete expression iteratively before invoking any caller measurement. */
function compileComposition(value: ComponentComposition | undefined, ids: readonly string[], path: string, direction: 'LR' | 'TB'): CompositionGroup {
  const root: CompositionGroup = { axis: direction === 'LR' ? 'row' : 'column', children: [] };
  if (value === undefined) return { ...root, children: [...ids] };
  const remaining = new Set(ids);
  const pending = [{ value: value as unknown, path, parent: root, depth: 0 }];
  let groups = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (typeof entry.value === 'string') {
      if (!remaining.delete(entry.value)) refuse(entry.path, 'Composition IDs must name each direct child or root exactly once.', { nodeId: entry.value });
      entry.parent.children.push(entry.value);
      continue;
    }
    if (!isRecord(entry.value) || ++groups > ids.length || entry.depth >= ids.length) {
      refuse(entry.path, 'Composition must be a bounded tree of direct IDs, rows and columns.');
    }
    const keys = Object.keys(entry.value);
    const axis = keys[0];
    if (keys.length !== 1 || (axis !== 'row' && axis !== 'column') || !Array.isArray(entry.value[axis]) || entry.value[axis].length < 2 || entry.value[axis].length > ids.length) {
      refuse(entry.path, 'A composition group needs exactly one row or column with at least two items; singleton wrappers and extra fields are not supported.');
    }
    const group: CompositionGroup = { axis, children: [] };
    entry.parent.children.push(group);
    const children = entry.value[axis] as unknown[];
    for (let index = children.length - 1; index >= 0; index--) {
      pending.push({ value: children[index], path: `${entry.path}/${axis}/${index}`, parent: group, depth: entry.depth + 1 });
    }
  }
  if (remaining.size) refuse(path, 'Composition must include every direct child or root.', { nodeId: remaining.values().next().value });
  return root;
}

function measureComposition(root: CompositionGroup, sizes: Map<string, Size>): MeasuredComposition {
  const order: CompositionGroup[] = [], pending = [root];
  while (pending.length) {
    const group = pending.pop()!;
    order.push(group);
    for (const child of group.children) if (typeof child !== 'string') pending.push(child);
  }
  const measured = new Map<CompositionGroup, Size>();
  for (const group of order.reverse()) {
    let main = 0, cross = 0;
    for (const child of group.children) {
      const size = typeof child === 'string' ? sizes.get(child)! : measured.get(child)!;
      main += size[group.axis === 'row' ? 'width' : 'height'];
      cross = Math.max(cross, size[group.axis === 'row' ? 'height' : 'width']);
    }
    main += Math.max(0, group.children.length - 1) * COMPONENT_GAPS[group.axis];
    measured.set(group, group.axis === 'row' ? { width: main, height: cross } : { width: cross, height: main });
  }
  const placements: MeasuredComposition['placements'] = [];
  const offsets = [{ group: root, x: 0, y: 0 }];
  while (offsets.length) {
    const { group, x, y } = offsets.pop()!;
    let cursor = 0;
    for (const child of group.children) {
      const position = { x: x + (group.axis === 'row' ? cursor : 0), y: y + (group.axis === 'column' ? cursor : 0) };
      if (typeof child === 'string') placements.push({ id: child, ...position });
      else offsets.push({ group: child, ...position });
      const size = typeof child === 'string' ? sizes.get(child)! : measured.get(child)!;
      cursor += size[group.axis === 'row' ? 'width' : 'height'] + COMPONENT_GAPS[group.axis];
    }
  }
  return { ...measured.get(root)!, placements };
}

function boundarySegments(boxes: Map<string, Box>, containers: Set<string>): BoundarySegment[] {
  return [...containers].flatMap(nodeId => {
    const b = boxes.get(nodeId)!, left = b.x, right = b.x + b.width, top = b.y, bottom = b.y + b.height;
    return ([[[left, top], [right, top]], [[right, top], [right, bottom]], [[right, bottom], [left, bottom]], [[left, bottom], [left, top]]] as [Point, Point][])
      .map(points => ({ nodeId, points }));
  });
}

function labelFailure(edgeId: string, message: string, code = 'LABEL_NO_SLOT'): never {
  throw new ComponentLayoutError(message, [{ code, path: `/layout/labels/${pathPart(edgeId)}`, edgeId, message }]);
}

function validatePublishedLabels(boxes: Map<string, Box>, routes: Map<string, EdgeRoute>, strokes: BoundarySegment[]) {
  const labels = [...routes].map(([edgeId, route]) => ({ edgeId, bounds: route.labelBox! }));
  for (const { edgeId, bounds } of labels) {
    const box = { x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
    if ([...boxes.values()].some(other => overlap(box, other))
      || labels.some(other => other.edgeId !== edgeId && overlap(box, { x: other.bounds.left, y: other.bounds.top, width: other.bounds.right - other.bounds.left, height: other.bounds.bottom - other.bounds.top }))
      || strokes.some(stroke => segmentEntersOpenBox(stroke.points, bounds))
      || [...routes].some(([otherId, route]) => otherId !== edgeId && route.points.slice(1).some((point, index) => segmentEntersOpenBox([route.points[index], point], bounds)))) {
      labelFailure(edgeId, `Published native label geometry collides for edge ${edgeId}.`);
    }
  }
}

/** One bounded allocation inside the existing composition; no canvas growth or route search loop. */
function reserveLabels(boxes: Map<string, Box>, edges: LayoutEdge[], sizes: Map<string, Size>, area: Box, strokes: BoundarySegment[]) {
  const slots = new Map<string, Box>();
  const ordered = [...edges].sort((a, b) => sizes.get(b.id)!.width * sizes.get(b.id)!.height - sizes.get(a.id)!.width * sizes.get(a.id)!.height || a.id.localeCompare(b.id));
  for (const edge of ordered) {
    const size = sizes.get(edge.id)!;
    const minX = area.x + 16, minY = area.y + 16;
    const maxX = area.x + area.width - size.width - 16, maxY = area.y + area.height - size.height - 16;
    // Choose grid counts before enumeration. Their product never exceeds the budget,
    // including extremely large finite coordinates where adding a small step stalls.
    const spanX = maxX - minX, spanY = maxY - minY;
    if (spanX < 0 || spanY < 0) labelFailure(edge.id, `No reserved label slot fits inside the component composition for edge ${edge.id}.`);
    let columns = Math.min(LABEL_CANDIDATE_LIMIT, Math.floor(spanX / 16) + 1);
    let rows = Math.min(LABEL_CANDIDATE_LIMIT, Math.floor(spanY / 16) + 1);
    const scale = Math.max(1, Math.sqrt(columns * rows / LABEL_CANDIDATE_LIMIT));
    columns = Math.max(1, Math.floor(columns / scale));
    rows = Math.max(1, Math.min(Math.floor(rows / scale), Math.floor(LABEL_CANDIDATE_LIMIT / columns)));
    const stepX = columns > 1 ? spanX / (columns - 1) : 0, stepY = rows > 1 ? spanY / (rows - 1) : 0;
    const source = boxCenter(boxes.get(edge.from)!), target = boxCenter(boxes.get(edge.to)!);
    let chosen: Box | undefined, bestCost = Infinity;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const box = { ...size, x: minX + column * stepX, y: minY + row * stepY };
      const expanded = boxBounds({ x: box.x - LABEL_PADDING, y: box.y - LABEL_PADDING,
        width: box.width + 2 * LABEL_PADDING, height: box.height + 2 * LABEL_PADDING });
      if ([...boxes.values()].some(other => overlap(box, other, LABEL_PADDING))
        || [...slots.values()].some(other => overlap(box, other, 2 * LABEL_PADDING))
        || strokes.some(stroke => segmentEntersOpenBox(stroke.points, expanded))) continue;
      const center = boxCenter(box);
      const from = Math.hypot(center[0] - source[0], center[1] - source[1]);
      const to = Math.hypot(center[0] - target[0], center[1] - target[1]);
      const cost = from + to + 2 * Math.abs(from - to);
      if (cost < bestCost) { chosen = box; bestCost = cost; }
    }
    if (!chosen) labelFailure(edge.id, `No reserved label slot for edge ${edge.id} after at most ${LABEL_CANDIDATE_LIMIT} candidates.`);
    slots.set(edge.id, chosen);
  }
  return slots;
}

function validateBoundaryRoutes(routes: Map<string, EdgeRoute>, strokes: BoundarySegment[]) {
  for (const [edgeId, route] of routes) for (let index = 1; index < route.points.length; index++) {
    const [a, b] = [route.points[index - 1], route.points[index]];
    for (const { nodeId, points: [c, d] } of strokes) {
      const horizontal = Math.abs(a[1] - b[1]) < EPSILON && Math.abs(c[1] - d[1]) < EPSILON && Math.abs(a[1] - c[1]) < EPSILON;
      const vertical = Math.abs(a[0] - b[0]) < EPSILON && Math.abs(c[0] - d[0]) < EPSILON && Math.abs(a[0] - c[0]) < EPSILON;
      if ((horizontal && Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) > Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) + EPSILON)
        || (vertical && Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) > Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) + EPSILON)) {
        throw new RoutingError('ROUTING_FAILED', `/layout/routes/${pathPart(edgeId)}`, `Edge ${edgeId} overlaps boundary stroke ${nodeId}.`, { edgeId, nodeId });
      }
    }
  }
}

function layoutRoutedComponent(request: ComponentLayoutRequest, options: ComponentLayoutOptions): RoutedComponentLayoutResult {
  const { byId, postorder } = validateRequest(request);
  if (!options || !options.Avoid || typeof options.Avoid.Router !== 'function' || typeof options.measureHeader !== 'function') refuse('/options', 'Routed component layout needs both initialized Avoid and measureHeader.');
  for (const edge of request.relations) if (edge.headerRail) refuse(`/relations/${pathPart(edge.id)}`, 'Routed component layout does not support headerRail.', { edgeId: edge.id });
  const compositions = new Map(request.nodes.map(node => [node.id, compileComposition(node.composition, node.children, `/nodes/${pathPart(node.id)}/composition`, request.direction)]));
  const roots = compileComposition(request.rootComposition, request.roots, '/rootComposition', request.direction);
  const sizes = new Map<string, Size>(), headers = new Map<string, number>(), contents = new Map<string, MeasuredComposition>();
  const containers = new Set(request.nodes.filter(node => node.children.length).map(node => node.id));
  for (const id of postorder) {
    const node = byId.get(id)!;
    let size: Size = { width: node.width, height: node.height };
    if (containers.has(id)) {
      const content = measureComposition(compositions.get(id)!, sizes);
      const width = Math.max(320, content.width + 2 * COMPONENT_INSET);
      if (!positive(width)) refuse(`/nodes/${pathPart(id)}`, 'Component composition exceeds finite dimensions.', { nodeId: id });
      const header = options.measureHeader(id, width);
      if (!positive(header)) refuse(`/nodes/${pathPart(id)}/header`, 'measureHeader must return a finite positive height.', { nodeId: id });
      headers.set(id, header);
      contents.set(id, content);
      size = { width, height: header + HEADER_GAP + content.height + COMPONENT_INSET };
    }
    if (!positive(size.width) || !positive(size.height)) refuse(`/nodes/${pathPart(id)}`, 'Component composition exceeds finite dimensions.', { nodeId: id });
    sizes.set(id, size);
  }
  const rootLayout = measureComposition(roots, sizes);
  const boxes = new Map<string, Box>(), headerBoxes = new Map<string, Box>();
  const pending = rootLayout.placements.map(placement => ({ ...placement, x: placement.x + MARGIN, y: placement.y + MARGIN }));
  while (pending.length) {
    const { id, x, y } = pending.pop()!;
    const box = { ...sizes.get(id)!, x, y };
    if (![x, y, x + box.width, y + box.height].every(Number.isFinite)) refuse(`/nodes/${pathPart(id)}`, 'Component placement exceeds finite coordinates.', { nodeId: id });
    boxes.set(id, box);
    if (containers.has(id)) {
      const header = headers.get(id)!;
      headerBoxes.set(id, { ...box, height: header });
      for (const child of contents.get(id)!.placements) pending.push({ id: child.id, x: x + COMPONENT_INSET + child.x, y: y + header + HEADER_GAP + child.y });
    }
  }
  const obstacles = new Map([...boxes].map(([id, box]) => [id, headerBoxes.get(id) ?? box]));
  const strokes = boundarySegments(boxes, containers);
  const nodes = [...obstacles.keys()].map(id => ({ id, shape: 'rectangle' as const }));
  const edges: LayoutEdge[] = request.relations.map(({ id, from, to, label }) => ({ id, from, to, label }));
  const typography = { fontSize: request.labelFontSize, lineHeight: 1.25, paddingX: 12, paddingY: 6 };
  const nativeMinimumWidth = NATIVE_ARROW_LABEL_MIN_WIDTH_RATIO * request.labelFontSize;
  const wrapWidth = Math.min(240, Math.max(nativeMinimumWidth - typography.paddingX, nativeMinimumWidth / 2));
  const texts = new Map(edges.map(edge => [edge.id, wrapText(edge.label, wrapWidth, request.labelFontSize)]));
  const labelSizes = new Map(edges.map(edge => [edge.id, estimateEdgeLabel(texts.get(edge.id)!, typography)]));
  for (const [edgeId, size] of labelSizes) if (!positive(size.width) || !positive(size.height)) labelFailure(edgeId, `Label ${edgeId} exceeds finite measured dimensions.`, 'INVALID_LAYOUT_REQUEST');
  let edgeRoutes = routeEdges(obstacles, edges, { Avoid: options.Avoid, nodes, buffer: 4 });
  let longestRoute = 0;
  for (const route of edgeRoutes.values()) longestRoute = Math.max(longestRoute, route.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - route.points[index][0], point[1] - route.points[index][1]), 0));
  // Keep route sampling bounded for very large compositions as well as the reservation grid.
  const placed = placeRouteLabels(obstacles, edgeRoutes, labelSizes, { step: Math.max(4, longestRoute / 8192), padding: LABEL_PADDING, preferContent: true, blockedSegments: strokes.map(stroke => stroke.points) });
  let centers = placed.centers;
  const diagnostics: Diagnostic[] = [];
  if (placed.diagnostics.length) {
    const slots = reserveLabels(obstacles, edges, labelSizes, { x: MARGIN, y: MARGIN, width: rootLayout.width, height: rootLayout.height }, strokes);
    edgeRoutes = routeEdges(obstacles, edges, { Avoid: options.Avoid, nodes, buffer: 4, labelSlots: slots });
    centers = new Map([...slots].map(([edgeId, box]) => [edgeId, { center: boxCenter(box), box: boxBounds(box) }]));
    diagnostics.push({ code: 'COMPONENT_LABEL_RESERVATION', path: '/layout/labels', severity: 'warning', message: 'Labels required the single bounded reservation routing pass.' });
  }
  validateBoundaryRoutes(edgeRoutes, strokes);
  const messageLabels = new Map<string, ComponentMessageLabel>(), edgeGeometry = new Map<string, ComponentEdgeGeometry>();
  for (const [edgeId, route] of edgeRoutes) {
    const selected = centers.get(edgeId);
    if (!selected) labelFailure(edgeId, `No final label center for edge ${edgeId}.`);
    const balanced = excalidrawLabelPath(route.points, selected.center, 2 * route.points.length + 1);
    if (!balanced.valid || balanced.offset > EPSILON) labelFailure(edgeId, `Exact native label anchor is unavailable for edge ${edgeId}.`, 'LABEL_ANCHOR_UNSUPPORTED');
    const center = balanced.labelCenter, size = labelSizes.get(edgeId)!;
    route.points = balanced.points;
    route.labelCenter = center;
    route.labelBox = { left: center[0] - size.width / 2, top: center[1] - size.height / 2, right: center[0] + size.width / 2, bottom: center[1] + size.height / 2 };
    const [x, y] = route.points[0];
    edgeGeometry.set(edgeId, { x, y, points: route.points.map(point => [point[0] - x, point[1] - y]) });
    messageLabels.set(edgeId, { text: texts.get(edgeId)!, ...size, center });
  }
  validatePublishedLabels(obstacles, edgeRoutes, strokes);
  return { boxes, headerBoxes, containers, direction: request.direction, edgeGeometry, edgeRoutes, messageLabels, diagnostics };
}

/** The one-argument API remains engine-free; the paired options explicitly select routed composition. */
export function layoutComponent(request: ComponentLayoutRequest): ComponentLayoutResult;
export function layoutComponent(request: ComponentLayoutRequest, options: ComponentLayoutOptions): RoutedComponentLayoutResult;
export function layoutComponent(request: ComponentLayoutRequest, options: CompactComponentLayoutOptions): RoutedComponentLayoutResult;
export function layoutComponent(request: ComponentLayoutRequest, options?: ComponentLayoutOptions | CompactComponentLayoutOptions): ComponentLayoutResult | RoutedComponentLayoutResult {
  if (options && 'headerMode' in options && options.headerMode !== undefined && options.headerMode !== 'title-only') throw new ComponentLayoutError('Unsupported component header mode.', [{ code: 'INVALID_LAYOUT_REQUEST', path: '/options/headerMode', message: 'Unknown component header mode.' }]);
  if (options && 'headerMode' in options && options.headerMode === 'title-only') return layoutCompactComponent(request, options);
  return arguments.length < 2 ? layoutLegacyComponent(request) : layoutRoutedComponent(request, options as ComponentLayoutOptions);
}
