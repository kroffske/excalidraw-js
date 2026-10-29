import type { Box, GraphLayoutRequest, CompiledConstraints, Size, PlaceConstraint, Diagnostic, GraphLayoutResult, FitPolicy } from './types.js';

const centerY = (box: Box) => box.y + box.height / 2;

/** Exterior columns keep the main rows intact and follow their partners vertically. */
export function placeSideColumns(model: GraphLayoutRequest, boxes: Map<string, Box>, constraints: CompiledConstraints, edgeLabelSizes: Map<string, Size>, { compact = false } = {}) {
  const sides = constraints.sidePlacements;
  if (!sides.size) return;
  const main = [...boxes].filter(([id]) => !sides.has(id)).map(([, box]) => box);
  const minX = main.length ? Math.min(...main.map(box => box.x)) : 80;
  const maxX = main.length ? Math.max(...main.map(box => box.x + box.width)) : 80;
  const topIds = [...constraints.topGroups].flatMap(root => constraints.groups.get(root)!);
  const bottomIds = [...constraints.bottomGroups].flatMap(root => constraints.groups.get(root)!);
  const topCenter = () => Math.max(...topIds.map(id => centerY(boxes.get(id)!)));
  const bottomCenter = () => Math.min(...bottomIds.map(id => centerY(boxes.get(id)!)));
  // When both extreme rows are fixed, reserve enough vertical room for a full
  // side column before deriving partner medians. No-side layouts skip this pass.
  if (topIds.length && bottomIds.length) {
    const requiredSpan = Math.max(...['left', 'right'].map(side => {
      const heights = [...sides].filter(([, hint]) => hint.place === side).map(([id]) => boxes.get(id)!.height);
      return heights.length < 2 ? 0 : heights.reduce((sum, height) => sum + height, 0)
        - Math.min(...heights) + (heights.length - 1) * 120;
    }));
    const start = topCenter(), span = bottomCenter() - start;
    if (span > 0 && requiredSpan > span) for (const box of main) {
      const y = start + (centerY(box) - start) * requiredSpan / span;
      box.y = y - box.height / 2;
    }
  }
  for (const side of ['left', 'right']) {
    const ids = [...sides].filter(([, hint]) => hint.place === side).map(([id]) => id);
    if (!ids.length) continue;
    const wanted = ids.map(id => {
      const partners = new Set(model.edges.filter(edge => edge.from === id || edge.to === id)
        .map(edge => edge.from === id ? edge.to : edge.from).filter(other => !sides.has(other)));
      const ys = [...partners].map(other => centerY(boxes.get(other)!)).sort((a, b) => a - b);
      const middle = Math.floor(ys.length / 2);
      const y = ys.length ? (ys[middle] + ys[Math.floor((ys.length - 1) / 2)]) / 2 : centerY(boxes.get(id)!);
      return { id, y };
    }).sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
    const width = Math.max(...ids.map(id => boxes.get(id)!.width));
    // Start with incident-label clearance. A compact candidate uses the margin
    // width and is retained only after routing confirms labels, hints and Fit.
    const gap = compact ? 80 : Math.max(160, ...model.edges.filter(edge => ids.includes(edge.from) || ids.includes(edge.to))
      .map(edge => edgeLabelSizes.get(edge.id)!.width + 48));
    let floor = -Infinity;
    for (const { id, y } of wanted) {
      const box = boxes.get(id)!;
      box.x = (side === 'left' ? minX - gap - width : maxX + gap) + (width - box.width) / 2;
      box.y = Math.max(y - box.height / 2, floor);
      floor = box.y + box.height + 120;
    }
    // Pack back from the bottom band, then forward from the top band. This
    // preserves column order when separated medians leave less room at one end.
    if (bottomIds.length) {
      let ceiling = bottomCenter() + boxes.get(wanted.at(-1)!.id)!.height / 2;
      for (const { id } of [...wanted].reverse()) {
        const box = boxes.get(id)!;
        box.y = Math.min(box.y, ceiling - box.height);
        ceiling = box.y - 120;
      }
    }
    if (topIds.length) {
      let floor = topCenter() - boxes.get(wanted[0].id)!.height / 2;
      for (const { id } of wanted) {
        const box = boxes.get(id)!;
        box.y = Math.max(box.y, floor);
        floor = box.y + box.height + 120;
      }
    }
  }
}

/** Check final boxes after explicit pins; place semantics match the author measure. */
export function checkPlacementHints(boxes: Map<string, Box>, constraints: CompiledConstraints, severity: 'warning' | 'error'): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const violatesPlace = (hint: PlaceConstraint, id: string, own: Box, other: Box) => ({
    top: () => other.y + other.height <= own.y,
    bottom: () => other.y >= own.y + own.height,
    left: () => constraints.placements.get(id)?.place !== 'left' && other.x < own.x + own.width,
    right: () => constraints.placements.get(id)?.place !== 'right' && other.x + other.width > own.x,
  })[hint.place]();
  for (const hint of constraints.forms) {
    let met;
    if (hint.type === 'place') {
      const own = boxes.get(hint.node)!;
      met = [...boxes].every(([id, other]) => id === hint.node || !violatesPlace(hint, id, own, other));
    } else if (hint.type === 'row') {
      const row = hint.ids.map(id => boxes.get(id)!);
      met = row.every(box => Math.abs(centerY(box) - centerY(row[0])) <= 2)
        && row.slice(1).every((box, index) => box.x >= row[index].x + row[index].width);
    } else {
      const own = boxes.get(hint.node)!, other = boxes.get(hint.other)!;
      met = hint.type === 'below' ? own.y >= other.y + other.height
        : own.x >= other.x + other.width && Math.abs(centerY(own) - centerY(other)) <= 2;
    }
    if (!met) diagnostics.push({ code: 'PLACEMENT_HINT_UNMET', path: `/layout/hints/${hint.index}`, severity, constraintIndex: hint.index,
      ...(hint.type === 'row' ? {} : { nodeId: hint.node }),
      message: `Final coordinates do not satisfy the ${hint.type === 'place' ? hint.place : hint.type} hint.` });
  }
  return diagnostics;
}

/** Match the author measure's application Fit: cards and routes, excluding edge text. */
export function layoutFit(layout: Pick<GraphLayoutResult, 'boxes' | 'edgeRoutes'>, policy: FitPolicy) {
  const xs: number[] = [], ys: number[] = [];
  for (const box of layout.boxes.values()) { xs.push(box.x, box.x + box.width); ys.push(box.y, box.y + box.height); }
  for (const route of layout.edgeRoutes.values()) {
    for (const [x, y] of route.points) { xs.push(x); ys.push(y); }
  }
  return fitZoomForBounds(xs.length ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } : null,
    policy);
}

/** Viewport fit arithmetic; consumers supply their camera bounds and convention. */
export function fitZoomForBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number } | null, policy: FitPolicy): number {
  const { viewport, minZoom, maxZoom, paddingFraction } = policy;
  if (!bounds) return minZoom;
  const width = Math.max(1, bounds.maxX - bounds.minX), height = Math.max(1, bounds.maxY - bounds.minY);
  return Math.max(minZoom, Math.min(maxZoom, paddingFraction * Math.min(viewport.width / width, viewport.height / height)));
}
