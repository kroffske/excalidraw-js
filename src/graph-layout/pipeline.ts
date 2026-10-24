import { compileConstraints } from './constraints.js';
import type { GraphLayoutRequest, GraphLayoutResult, LayoutOptions, Box, Size, Point, Side, LayoutEdge, AuthoredRoute, CompiledConstraints, Diagnostic, EdgeRoute } from './types.js';
import type { LayoutRuntime, GraphvizRuntime } from './runtime-types.js';
const compareIds = (a: {id: string}, b: {id: string}) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
import { routeEdges, RoutingError } from './routing.js';
import { estimateEdgeLabel, excalidrawLabelPath, placeRouteLabels } from './labels.js';
import { checkPlacementHints, layoutFit, placeSideColumns } from './placement.js';
import { areaGeometries } from './areas.js';

const MARGIN = 80;
const q = (value: string) => JSON.stringify(value);

export class AutoLayoutError extends Error {
  code: string;
  diagnostics: Diagnostic[];
  constructor(message: string, diagnostics: Diagnostic[], options?: ErrorOptions) {
    super(message, options);
    this.name = 'AutoLayoutError';
    this.code = diagnostics[0]?.code || 'AUTO_LAYOUT_FAILED';
    this.diagnostics = diagnostics;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const finitePosition = (value: unknown) => isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
const sides: string[] = ['top', 'right', 'bottom', 'left'];
const pathPart = (id: string) => id.replace(/~/gu, '~0').replace(/\//gu, '~1');

/** Reject malformed caller geometry before requesting engines or allocating resources. */
function validateRequest(request: GraphLayoutRequest): void {
  const refuse = (path: string, message: string, subject: Pick<Diagnostic, 'nodeId' | 'edgeId' | 'constraintIndex'> = {}): never => {
    throw new AutoLayoutError('Invalid graph layout request.', [{ code: 'INVALID_LAYOUT_REQUEST', path, message, ...subject }]);
  };
  if (!isRecord(request) || !Array.isArray(request.nodes) || !Array.isArray(request.edges)) {
    refuse('/', 'A graph layout request needs node and edge arrays.');
  }
  const nodeIds = new Set<string>(), edgeIds = new Set<string>();
  for (const [index, node] of request.nodes.entries()) {
    const nodeId = isRecord(node) && typeof node.id === 'string' ? node.id : undefined;
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id || nodeIds.has(node.id)
      || !positive(node.width) || !positive(node.height) || !['rectangle', 'diamond'].includes(node.shape)) {
      refuse(`/nodes/${index}`, 'Nodes need distinct IDs, positive finite dimensions and an explicit supported routing shape.', nodeId === undefined ? {} : { nodeId });
    }
    nodeIds.add(node.id);
  }
  for (const [index, edge] of request.edges.entries()) {
    const edgeId = isRecord(edge) && typeof edge.id === 'string' ? edge.id : undefined;
    if (!isRecord(edge) || typeof edge.id !== 'string' || !edge.id || edgeIds.has(edge.id)
      || !nodeIds.has(edge.from) || !nodeIds.has(edge.to) || typeof edge.label !== 'string') {
      refuse(`/edges/${index}`, 'Edges need distinct IDs, known endpoints and exact resolved label text.', edgeId === undefined ? {} : { edgeId });
    }
    edgeIds.add(edge.id);
  }
  if (request.direction !== undefined && request.direction !== 'TB' && request.direction !== 'LR') refuse('/direction', 'Direction must be TB or LR.');
  if (!isRecord(request.profile) || !(request.profile.baseNodeGap === null || positive(request.profile.baseNodeGap))
    || !nonnegative(request.profile.routeNudge)
    || !(['wideLabelCorridors', 'alignAdjacentRows', 'preferContentLabels'] as const).every(key => typeof request.profile[key] === 'boolean')) {
    refuse('/profile', 'The caller must resolve spacing, alignment, label and routing preferences.');
  }
  const typography = request.labelTypography;
  if (!isRecord(typography) || !positive(typography.fontSize) || !positive(typography.lineHeight)
    || !nonnegative(typography.paddingX) || !nonnegative(typography.paddingY)) refuse('/labelTypography', 'Label typography must have finite positive font metrics and nonnegative padding.');
  const fit = request.fit;
  if (!isRecord(fit) || !isRecord(fit.viewport) || !positive(fit.viewport.width) || !positive(fit.viewport.height)
    || !positive(fit.minZoom) || !positive(fit.maxZoom) || fit.minZoom > fit.maxZoom
    || !positive(fit.paddingFraction) || fit.paddingFraction > 1 || !nonnegative(fit.maxSideDrop) || fit.maxSideDrop > 1) {
    refuse('/fit', 'The caller must resolve a finite viewport, zoom range, fit fraction and side-placement budget.');
  }
  if (request.defaultTopIds !== undefined && (!Array.isArray(request.defaultTopIds) || request.defaultTopIds.some(id => !nodeIds.has(id)))) refuse('/defaultTopIds', 'Default top preferences must refer to known node IDs.');
  if (request.hasIgnoredNodeHints !== undefined && typeof request.hasIgnoredNodeHints !== 'boolean') refuse('/hasIgnoredNodeHints', 'The retained-preference flag must be boolean.');
  if (request.positions !== undefined) {
    if (!isRecord(request.positions)) refuse('/positions', 'Positions must be keyed by node ID.');
    for (const [id, position] of Object.entries(request.positions)) {
      if (!nodeIds.has(id) || !finitePosition(position) || Object.keys(position).some(key => key !== 'x' && key !== 'y')) refuse(`/positions/${pathPart(id)}`, 'A pin needs a known node ID and finite x/y coordinates.', { nodeId: id });
    }
  }
  if (request.routes !== undefined) {
    if (!isRecord(request.routes)) refuse('/routes', 'Routes must be keyed by edge ID.');
    for (const [id, route] of Object.entries(request.routes)) {
      if (!edgeIds.has(id) || !isRecord(route) || !sides.includes(route.sourceSide) || !sides.includes(route.targetSide)
        || (route.waypoints !== undefined && (!Array.isArray(route.waypoints) || !route.waypoints.every(finitePosition)))) {
        refuse(`/routes/${pathPart(id)}`, 'A route needs a known edge ID, supported endpoint sides and finite waypoints.', { edgeId: id });
      }
    }
  }
  try { compileConstraints([...nodeIds], request.constraints); }
  catch (cause) {
    const subject: Pick<Diagnostic, 'nodeId' | 'constraintIndex'> = {};
    if (isRecord(cause)) {
      if (typeof cause.nodeId === 'string') subject.nodeId = cause.nodeId;
      if (typeof cause.constraintIndex === 'number' && Number.isInteger(cause.constraintIndex)) subject.constraintIndex = cause.constraintIndex;
    }
    throw new AutoLayoutError('Invalid graph layout constraints.', [{ code: 'INVALID_LAYOUT_REQUEST', path: '/constraints', message: cause instanceof Error ? cause.message : String(cause), ...subject }], { cause });
  }
  if (request.areas !== undefined) {
    if (!Array.isArray(request.areas)) refuse('/areas', 'Areas must be an array.');
    const areaIds = new Set<string>();
    for (const [index, area] of request.areas.entries()) {
      if (!isRecord(area) || typeof area.id !== 'string' || !area.id || areaIds.has(area.id) || typeof area.title !== 'string'
        || !Array.isArray(area.nodeIds) || area.nodeIds.some(id => !nodeIds.has(id))
        || !isRecord(area.typography) || !positive(area.typography.fontSize) || !positive(area.typography.lineHeight)) {
        refuse(`/areas/${index}`, 'Areas need distinct IDs, exact title text, known members and finite positive typography.');
      }
      areaIds.add(area.id);
    }
    const byId = new Map(request.areas.map(area => [area.id, area]));
    for (const area of request.areas) {
      if ((area.parentId !== undefined && !areaIds.has(area.parentId))
        || (!area.nodeIds.length && !request.areas.some(child => child.parentId === area.id))) refuse(`/areas/${pathPart(area.id)}`, 'Areas need a known parent and at least one node or child area.');
      const ancestors = new Set([area.id]);
      let parent = area.parentId;
      while (parent !== undefined) {
        if (ancestors.has(parent)) refuse(`/areas/${pathPart(area.id)}`, 'Area membership must form an acyclic forest.');
        ancestors.add(parent);
        parent = byId.get(parent)?.parentId;
      }
    }
  }
}

function parsePlacement(source: string | undefined): { bb: string; objects: { name: string; pos?: string }[] } {
  if (source === undefined) throw new Error('Placement requires an initialized Graphviz runtime.');
  const graph: unknown = JSON.parse(source);
  if (!isRecord(graph) || typeof graph.bb !== 'string' || !Array.isArray(graph.objects)
    || graph.objects.some(item => !isRecord(item) || typeof item.name !== 'string')) {
    throw new Error('Graphviz returned invalid placement data.');
  }
  return graph as { bb: string; objects: { name: string; pos?: string }[] };
}

function placementConstraints(model: GraphLayoutRequest): CompiledConstraints {
  const compiled = compileConstraints(model.nodes.map(node => node.id), model.constraints);
  if (!compiled.valid) throw new AutoLayoutError('Automatic placement received conflicting layout hints.', compiled.diagnostics);
  const explicitTop = new Set([...compiled.placements.values()].filter(item => item.place === 'top').map(item => item.node));
  const explicitBottom = new Set([...compiled.placements.values()].filter(item => item.place === 'bottom').map(item => item.node));
  const defaults = new Set(model.defaultTopIds || []);
  const belowTargets = new Set(compiled.belowEdges.map(edge => edge.to));
  const topGroups = new Set<string>(), bottomGroups = new Set<string>();
  for (const [root, members] of compiled.groups) {
    if (members.some(id => explicitTop.has(id))) topGroups.add(root);
    else if (members.some(id => explicitBottom.has(id))) bottomGroups.add(root);
    else if (!belowTargets.has(root) && members.some(id => defaults.has(id) && !compiled.sidePlacements.has(id))) topGroups.add(root);
  }
  return { ...compiled, topGroups, bottomGroups };
}

function dotSource(model: GraphLayoutRequest, sizes: Map<string, Size>, constraints: CompiledConstraints) {
  const longestLabel = Math.max(0, ...model.edges.map(edge => estimateEdgeLabel(edge.label, model.labelTypography).width));
  const direction = model.direction || 'TB';
  const labelCorridor = Math.min(longestLabel, 260) + 40;
  const nodesep = direction === 'LR' ? 150 : labelCorridor;
  const ranksep = direction === 'LR' ? labelCorridor : 150;
  const lines = [
    'digraph G {',
    `rankdir=${direction}; newrank=true; splines=false; nodesep=${(nodesep / 72).toFixed(3)}; ranksep="${(ranksep / 72).toFixed(3)} equally"; remincross=true; searchsize=500; ordering=out;`,
    'node [shape=box, fixedsize=true, label=""];',
  ];
  for (const node of [...model.nodes].sort(compareIds)) {
    const size = sizes.get(node.id)!;
    lines.push(`${q(node.id)} [width=${(size.width / 72).toFixed(4)}, height=${(size.height / 72).toFixed(4)}];`);
  }
  const idsFor = (roots: Set<string>) => [...roots].flatMap(root => constraints.groups.get(root)!).sort();
  const top = idsFor(constraints.topGroups), bottom = idsFor(constraints.bottomGroups);
  if (top.length) lines.push(`{ rank=min; ${top.map(q).join('; ')}; }`);
  if (bottom.length) lines.push(`{ rank=max; ${bottom.map(q).join('; ')}; }`);
  for (const [root, ids] of constraints.orderedGroups) {
    if (ids.length < 2) continue;
    lines.push(`{ rank=same; ${ids.map(q).join('; ')}; }`);
    for (let index = 1; index < ids.length; index += 1) {
      lines.push(`${q(ids[index - 1])} -> ${q(ids[index])} [style=invis, weight=20];`);
    }
  }
  for (const edge of constraints.belowEdges) {
    const from = constraints.orderedGroups.get(edge.from)![0];
    const to = constraints.orderedGroups.get(edge.to)![0];
    lines.push(`${q(from)} -> ${q(to)} [style=invis, minlen=1, weight=12];`);
  }
  const position = new Map<string, { ids: string[]; index: number }>();
  for (const ids of constraints.orderedGroups.values()) ids.forEach((id, index) => position.set(id, { ids, index }));
  for (const edge of [...model.edges].sort(compareIds)) {
    const left = position.get(edge.from), right = position.get(edge.to);
    if (left && right && left.ids === right.ids && right.index < left.index) {
      lines.push(`${q(edge.to)} -> ${q(edge.from)} [id=${q(edge.id)}, dir=back, minlen=0];`);
    } else lines.push(`${q(edge.from)} -> ${q(edge.to)} [id=${q(edge.id)}];`);
  }
  lines.push('}');
  return { source: lines.join('\n'), nodesep, ranksep };
}

function hardRows(model: GraphLayoutRequest, boxes: Map<string, Box>, constraints: CompiledConstraints, nodeGap: number, { labelLanes, compact }: { labelLanes: number; compact: boolean }) {
  // Preserve the main-row composition before moving side cards to their columns.
  const roots = [...constraints.groups.keys()];
  const initialCenters = new Map([...boxes].map(([id, box]) => [id, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }]));
  const rankCenters = [...new Set([...initialCenters.values()].map(point => Math.round(point.y / 4) * 4))]
    .sort((left, right) => left - right);
  const levels = new Map(roots.map(root => [root, Math.min(...constraints.groups.get(root)!
    .map(id => rankCenters.indexOf(Math.round(initialCenters.get(id)!.y / 4) * 4)))]));
  for (const root of constraints.topGroups) levels.set(root, 0);
  for (let pass = 0; pass < roots.length; pass += 1) {
    for (const edge of constraints.belowEdges) {
      levels.set(edge.to, Math.max(levels.get(edge.to)!, levels.get(edge.from)! + 1));
    }
  }
  if (constraints.bottomGroups.size) {
    const bottom = Math.max(...levels.values()) + 1;
    for (const root of constraints.bottomGroups) levels.set(root, bottom);
  }
  const distinct = [...new Set(levels.values())].sort((left, right) => left - right);
  const normalizedLevel = new Map(roots.map(root => [root, distinct.indexOf(levels.get(root)!)]));
  const levelById = new Map<string, number>();
  const rows = new Map<number, { root: string; ids: string[] }[]>();
  for (const root of roots) {
    const level = normalizedLevel.get(root)!;
    if (!rows.has(level)) rows.set(level, []);
    rows.get(level)!.push({ root, ids: constraints.orderedGroups.get(root)! });
    for (const id of constraints.groups.get(root)!) levelById.set(id, level);
  }
  for (const groups of rows.values()) {
    groups.sort((left, right) => Math.min(...left.ids.map(id => initialCenters.get(id)!.x))
      - Math.min(...right.ids.map(id => initialCenters.get(id)!.x)) || left.root.localeCompare(right.root));
  }
  const orderedRows = [...rows.entries()].sort(([left], [right]) => left - right)
    .map(([level, groups]) => ({ level, ids: groups.flatMap(group => group.ids) }));
  const edgeLabelSizes = new Map(model.edges.map(edge => [edge.id, estimateEdgeLabel(edge.label, model.labelTypography)]));
  const wideCorridors = new Set();
  if (compact) for (const edge of model.edges) {
    if (constraints.sidePlacements.has(edge.from)) wideCorridors.add(edge.to);
    if (constraints.sidePlacements.has(edge.to)) wideCorridors.add(edge.from);
    if (model.edges.some(other => other.from === edge.to && other.to === edge.from)) {
      wideCorridors.add(edge.from);
      wideCorridors.add(edge.to);
    }
  }
  const baseNodeGap = model.profile.baseNodeGap ?? Math.max(96, Math.min(nodeGap, 180));
  const gapBetween = (leftId: string, rightId: string) => {
    const labels = model.edges.filter(edge => (edge.from === leftId && edge.to === rightId)
      || (edge.from === rightId && edge.to === leftId));
    const individual = labels.map(edge => {
      const width = edgeLabelSizes.get(edge.id)!.width;
      const wide = compact ? wideCorridors.has(leftId) || wideCorridors.has(rightId)
        : model.profile.wideLabelCorridors || labelLanes > 1;
      return width + (wide ? width + 32 : 48);
    });
    const combined = labels.length > 1
      ? labels.reduce((sum, edge) => sum + edgeLabelSizes.get(edge.id)!.width, 0) + 48
      : 0;
    return Math.max(baseNodeGap, combined, ...individual);
  };
  const rowWidth = (ids: string[]) => ids.reduce((sum, id) => sum + boxes.get(id)!.width, 0)
    + ids.slice(1).reduce((sum, id, index) => sum + gapBetween(ids[index], id), 0);
  const maximumWidth = Math.max(0, ...orderedRows.map(row => rowWidth(row.ids)));
  for (const row of orderedRows) {
    let x = MARGIN + (maximumWidth - rowWidth(row.ids)) / 2;
    row.ids.forEach((id, index) => {
      const box = boxes.get(id)!;
      box.x = x;
      x += box.width + (index < row.ids.length - 1 ? gapBetween(id, row.ids[index + 1]) : 0);
    });
  }
  const positioned = new Set(orderedRows[0]?.ids || []);
  for (const row of orderedRows.slice(1)) {
    const rowIds = new Set(row.ids);
    const deltas = model.profile.alignAdjacentRows ? model.edges.flatMap(edge => {
      const rowId = rowIds.has(edge.from) ? edge.from : rowIds.has(edge.to) ? edge.to : null;
      const partnerId = rowId === edge.from ? edge.to : rowId === edge.to ? edge.from : null;
      if (!rowId || !partnerId || !positioned.has(partnerId) || Math.abs(levelById.get(rowId)! - levelById.get(partnerId)!) !== 1) return [];
      const rowBox = boxes.get(rowId)!, partnerBox = boxes.get(partnerId)!;
      return [partnerBox.x + partnerBox.width / 2 - rowBox.x - rowBox.width / 2];
    }).sort((left, right) => left - right) : [];
    if (deltas.length >= 2) {
      const lower = deltas[Math.floor((deltas.length - 1) / 2)];
      const upper = deltas[Math.ceil((deltas.length - 1) / 2)];
      const shift = lower <= 0 && upper >= 0 ? 0 : Math.abs(lower) < Math.abs(upper) ? lower : upper;
      const minimum = Math.min(...row.ids.map(id => boxes.get(id)!.x));
      const maximum = Math.max(...row.ids.map(id => boxes.get(id)!.x + boxes.get(id)!.width));
      const applied = Math.max(MARGIN - minimum, Math.min(shift, MARGIN + maximumWidth - maximum));
      for (const id of row.ids) boxes.get(id)!.x += applied;
    }
    row.ids.forEach(id => positioned.add(id));
  }
  const verticalGap = (upperLevel: number) => {
    const crossing = model.edges.filter(edge => {
      const from = levelById.get(edge.from)!, to = levelById.get(edge.to)!;
      return Math.min(from, to) <= upperLevel && Math.max(from, to) > upperLevel;
    });
    return labelLanes * Math.max(160, ...crossing.map(edge => edgeLabelSizes.get(edge.id)!.height + 120));
  };
  let top = MARGIN;
  orderedRows.forEach((row, index) => {
    const height = Math.max(...row.ids.map(id => boxes.get(id)!.height));
    const rowCenter = top + height / 2;
    for (const id of row.ids) boxes.get(id)!.y = rowCenter - boxes.get(id)!.height / 2;
    top += height + (index < orderedRows.length - 1 ? verticalGap(row.level) : 0);
  });
  placeSideColumns(model, boxes, constraints, edgeLabelSizes, { compact });
}

function placeWithDot(model: GraphLayoutRequest, sizes: Map<string, Size>, graphviz: GraphvizRuntime | undefined, constraints: CompiledConstraints, placement: { labelLanes: number; compact: boolean }) {
  const dot = dotSource(model, sizes, constraints);
  let graph: { bb?: string; objects: { name: string; pos?: string }[] };
  try {
    graph = parsePlacement(graphviz?.layout(dot.source, 'json', 'dot'));
  } catch (error) {
    throw new AutoLayoutError('Graphviz placement failed.', [{ code: 'PLACEMENT_FAILED', path: '/layout', message: `Graphviz placement failed: ${error instanceof Error ? error.message : String(error)}` }], { cause: error });
  }
  const boundsHeight = Number(graph.bb?.split(',')[3]);
  if (!Number.isFinite(boundsHeight)) throw new AutoLayoutError('Graphviz returned invalid placement bounds.', [{ code: 'PLACEMENT_FAILED', path: '/layout', message: 'Graphviz returned invalid placement bounds.' }]);
  const known = new Set(model.nodes.map(node => node.id));
  const boxes = new Map(graph.objects.filter(item => known.has(item.name)).map(item => {
    const [centerX, centerY] = String(item.pos).split(',').map(Number);
    if (![centerX, centerY].every(Number.isFinite)) {
      throw new AutoLayoutError('Graphviz returned invalid node coordinates.', [{ code: 'PLACEMENT_FAILED', path: `/layout/nodes/${pathPart(item.name)}`, nodeId: item.name, message: `Graphviz returned invalid coordinates for node ${item.name}.` }]);
    }
    const size = sizes.get(item.name)!;
    return [item.name, { ...size, x: Math.round(centerX - size.width / 2), y: Math.round(boundsHeight - centerY - size.height / 2) }];
  }));
  const omitted = model.nodes.find(node => !boxes.has(node.id));
  if (omitted) throw new AutoLayoutError('Graphviz omitted a node.', [{ code: 'PLACEMENT_FAILED', path: '/layout', nodeId: omitted.id, message: 'Graphviz omitted a node.' }]);
  hardRows(model, boxes, constraints, dot.nodesep, placement);
  const minimumX = Math.min(...[...boxes.values()].map(box => box.x));
  const minimumY = Math.min(...[...boxes.values()].map(box => box.y));
  for (const box of boxes.values()) {
    box.x += MARGIN - minimumX;
    box.y += MARGIN - minimumY;
  }
  return boxes;
}

function boxesFromPositions(model: GraphLayoutRequest, sizes: Map<string, Size>): Map<string, Box> {
  return new Map(model.nodes.map(node => [node.id, { ...sizes.get(node.id)!, ...model.positions![node.id] }]));
}

function authoredRoute(boxes: Map<string, Box>, edge: LayoutEdge, route: AuthoredRoute): EdgeRoute {
  const port = (box: Box, side: Side): Point => ({
    top: [box.x + box.width / 2, box.y], right: [box.x + box.width, box.y + box.height / 2],
    bottom: [box.x + box.width / 2, box.y + box.height], left: [box.x, box.y + box.height / 2],
  } satisfies Record<Side, Point>)[side];
  const points: Point[] = [port(boxes.get(edge.from)!, route.sourceSide), ...(route.waypoints || []).map((point): Point => [point.x, point.y]), port(boxes.get(edge.to)!, route.targetSide)];
  if (points.every(point => point[0] === points[0][0] && point[1] === points[0][1])) {
    throw new AutoLayoutError('Explicit route has no extent.', [{ code: 'DEGENERATE_ROUTE', path: `/layout/routes/${pathPart(edge.id)}`, edgeId: edge.id, message: 'Move the nodes or add distinct waypoints to give the route a visible path.' }]);
  }
  return { edge, points, sourceSide: route.sourceSide, targetSide: route.targetSide, manual: true };
}

function completePositions(model: GraphLayoutRequest) {
  const positions = model.positions;
  return positions && model.nodes.every(node => Object.hasOwn(positions, node.id));
}

function pathMiddle(points: Point[]): Point {
  const segments = points.slice(1).map((point, index): [Point, Point] => [points[index], point]);
  const lengths = segments.map(([left, right]) => Math.hypot(right[0] - left[0], right[1] - left[1]));
  const halfway = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let travelled = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const [left, right] = segments[index], length = lengths[index];
    if (travelled + length >= halfway) {
      const fraction = length ? (halfway - travelled) / length : 0;
      return [left[0] + fraction * (right[0] - left[0]), left[1] + fraction * (right[1] - left[1])];
    }
    travelled += length;
  }
  return [...points.at(-1)!];
}

function layoutAttempt(model: GraphLayoutRequest, sizes: Map<string, Size>, engines: LayoutRuntime | undefined, { labelLanes = 1, compact = false } = {}): GraphLayoutResult {
  const constraints = placementConstraints(model);
  const explicit = completePositions(model);
  const boxes = explicit
    ? boxesFromPositions(model, sizes)
    : placeWithDot(model, sizes, engines?.graphviz, constraints, { labelLanes, compact });
  if (!explicit) {
    for (const [id, position] of Object.entries(model.positions || {})) Object.assign(boxes.get(id)!, position);
  }
  const placementDiagnostics = checkPlacementHints(boxes, constraints,
    Object.keys(model.positions || {}).length ? 'warning' : 'error');
  if (placementDiagnostics.some(item => item.severity === 'error')) {
    throw new AutoLayoutError('Automatic placement did not satisfy layout hints.', placementDiagnostics);
  }
  if (!explicit && model.direction === 'LR' && model.constraints?.length) {
    placementDiagnostics.push({ code: 'LAYOUT_DIRECTION_IGNORED', path: '/layout/direction', severity: 'warning',
      message: 'Hard rows use screen-space top-to-bottom ranks; LR direction is not enforced.' });
  }
  if (!explicit && model.hasIgnoredNodeHints) {
    placementDiagnostics.push({ code: 'NODE_HINTS_IGNORED', path: '/layout/nodeHints', severity: 'warning',
      message: 'nodeHints are ignored by automatic placement. Use constraints instead.' });
  }
  const orderedEdges = [...model.edges].sort(compareIds);
  const manualIds = new Set(Object.keys(model.routes || {}));
  const sizesByEdge = new Map(orderedEdges.map(edge => [edge.id, estimateEdgeLabel(edge.label, model.labelTypography)]));
  const routes = routeEdges(boxes, orderedEdges.filter(edge => !manualIds.has(edge.id)), {
    Avoid: engines?.Avoid,
    nodes: model.nodes,
    buffer: 4,
    nudge: model.profile.routeNudge,
  });
  for (const edge of orderedEdges.filter(item => manualIds.has(item.id))) {
    routes.set(edge.id, authoredRoute(boxes, edge, model.routes![edge.id]));
  }
  const headerBoxes = new Map([...areaGeometries(model.areas || [], boxes)].map(([id, box]) => [`area:${id}`, { ...box, height: box.headerHeight }]));
  const labels = placeRouteLabels(new Map([...boxes, ...headerBoxes]), routes, sizesByEdge, { preferContent: model.profile.preferContentLabels });
  for (const diagnostic of labels.diagnostics) {
    const edgeId = diagnostic.edgeId!, center = pathMiddle(routes.get(edgeId)!.points);
    const size = sizesByEdge.get(edgeId)!;
    labels.centers.set(edgeId, { center, box: {
      left: center[0] - size.width / 2, top: center[1] - size.height / 2,
      right: center[0] + size.width / 2, bottom: center[1] + size.height / 2,
    } });
  }
  const diagnostics: Diagnostic[] = [];
  for (const [edgeId, route] of routes) {
    const balanced = excalidrawLabelPath(route.points, labels.centers.get(edgeId)!.center);
    if (!balanced.valid) {
      diagnostics.push({ code: 'ROUTE_POINT_LIMIT', path: `/layout/routes/${pathPart(edgeId)}`, edgeId, message: 'Label anchoring needs more than 17 route points.' });
      continue;
    }
    route.points = balanced.points;
    route.labelCenter = balanced.labelCenter;
    route.labelBox = labels.centers.get(edgeId)!.box;
  }
  if (diagnostics.length) throw new AutoLayoutError('Automatic label anchoring exceeded the route point limit.', diagnostics);
  const layout: GraphLayoutResult = {
    areas: areaGeometries(model.areas || [], boxes),
    boxes,
    direction: model.direction || 'TB',
    orderedEdges,
    containers: new Set(),
    edgeRoutes: routes,
    constraints,
    diagnostics: [...placementDiagnostics, ...labels.diagnostics],
  };
  if (constraints.sidePlacements.size) {
    const actual = layoutFit(layout, model.fit);
    if (explicit) {
      layout.fitComparison = { status: 'unverified', reason: 'complete_positions', actualFit: actual };
      layout.diagnostics.push({ code: 'PLACEMENT_FIT_UNVERIFIED', path: '/layout/hints', severity: 'warning',
        message: `Complete positions preserve the same geometry when side hints are removed; the cost of side placement is unverified (actual Fit ${actual.toFixed(3)}).`,
        actualFit: actual });
      return layout;
    }
    const baselineModel = { ...model, constraints: model.constraints!.filter(hint => hint.type !== 'place' || !['left', 'right'].includes(hint.place)) };
    let reference: GraphLayoutResult;
    try {
      reference = layoutAttempt(baselineModel, sizes, engines);
    } catch (error) {
      if (!(error instanceof AutoLayoutError || error instanceof RoutingError)) throw error;
      layout.diagnostics.push({ code: 'PLACEMENT_FIT_UNAVAILABLE', path: '/layout/hints', severity: 'warning',
        message: `Fit comparison is unavailable because the layout without side hints failed (${error.code}).`,
        baselineDiagnostics: error.diagnostics });
      layout.fitComparison = { status: 'unavailable', reason: 'reference_failed', actualFit: actual };
      return layout;
    }
    const missing = (value: GraphLayoutResult) => new Set(value.diagnostics.filter(item => item.code === 'LABEL_NO_SLOT').map(item => item.edgeId));
    const currentMissing = missing(layout), baselineMissing = missing(reference);
    const currentUnmet = new Set(placementDiagnostics.filter(item => item.code === 'PLACEMENT_HINT_UNMET').map(item => item.constraintIndex));
    const preservesHints = (candidate: GraphLayoutResult) => candidate.diagnostics.filter(item => item.code === 'PLACEMENT_HINT_UNMET')
      .every(item => currentUnmet.has(item.constraintIndex));
    if (labelLanes === 1 && [...currentMissing].some(path => !baselineMissing.has(path))) {
      // One bounded placement repair reserves room for labels beside a crossing
      // route and between rows. It keeps hard constraints and exact supplied pins.
      try {
        const repaired = layoutAttempt(model, sizes, engines, { labelLanes: 2, compact });
        const repairedMissing = missing(repaired);
        if (repairedMissing.size < currentMissing.size && [...repairedMissing].every(path => currentMissing.has(path))
          && preservesHints(repaired)) return repaired;
      } catch (error) {
        if (!(error instanceof AutoLayoutError || error instanceof RoutingError)) throw error;
        // The original completed layout retains its explicit failure diagnostics.
      }
    }
    const baseline = layoutFit(reference, model.fit);
    const drop = 1 - actual / baseline;
    if (!compact && drop > model.fit.maxSideDrop + 1e-9) {
      // Try one compact placement. Keep wide corridors at side/return flows;
      // accept it only when Fit, labels and the already-met hints all pass.
      try {
        const candidate = layoutAttempt(model, sizes, engines, { compact: true });
        if ((candidate.fitComparison?.status === 'measured' && candidate.fitComparison.passed)
          && [...missing(candidate)].every(path => currentMissing.has(path) && baselineMissing.has(path))
          && preservesHints(candidate)) return candidate;
      } catch (error) {
        if (!(error instanceof AutoLayoutError || error instanceof RoutingError)) throw error;
      }
    }
    layout.fitComparison = { status: 'measured', baselineFit: baseline, actualFit: actual, drop, passed: drop <= model.fit.maxSideDrop + 1e-9 };
    if (drop > model.fit.maxSideDrop + 1e-9) layout.diagnostics.push({ code: 'PLACEMENT_FIT_DROP', path: '/layout/hints', severity: 'warning',
      message: `Side columns reduce Fit by ${(drop * 100).toFixed(1)}% (baseline ${baseline.toFixed(3)}, actual ${actual.toFixed(3)}); the configured side-placement budget is exceeded.`,
      baselineFit: baseline, actualFit: actual, drop });
  }
  return layout;
}

/** Placement → pins → routing → labels; bounded repairs preserve constraints and pins. */
export function layoutGraph(request: GraphLayoutRequest, { runtime }: LayoutOptions = {}): GraphLayoutResult {
  validateRequest(request);
  if (!request.nodes.length) return {
    boxes: new Map(), direction: request.direction || 'TB', orderedEdges: [], containers: new Set(), edgeRoutes: new Map(),
    constraints: compileConstraints([], request.constraints), diagnostics: [], areas: new Map(),
  };
  const sizes = new Map(request.nodes.map(node => [node.id, { width: node.width, height: node.height }]));
  return layoutAttempt(request, sizes, runtime);
}
