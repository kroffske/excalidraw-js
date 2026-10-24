import type { Constraint, ConstraintEdge, CompiledConstraints, Diagnostic, PlaceConstraint, RowConstraint, RelativeConstraint } from './types.js';
class DisjointRows {
  parent: Map<string, string>;
  explicitRows: Map<string, Set<number>>;
  constructor(ids: string[]) {
    this.parent = new Map(ids.map(id => [id, id]));
    this.explicitRows = new Map(ids.map(id => [id, new Set()]));
  }

  find(id: string): string {
    const parent = this.parent.get(id)!;
    if (parent !== id) this.parent.set(id, this.find(parent));
    return this.parent.get(id)!;
  }

  union(left: string, right: string, rowIndex?: number) {
    let a = this.find(left), b = this.find(right);
    if (a === b) {
      if (rowIndex !== undefined) this.explicitRows.get(a)!.add(rowIndex);
      return { root: a, mergedRows: this.explicitRows.get(a)!.size > 1 };
    }
    if (a > b) [a, b] = [b, a];
    const rows = new Set([...this.explicitRows.get(a)!, ...this.explicitRows.get(b)!]);
    if (rowIndex !== undefined) rows.add(rowIndex);
    this.parent.set(b, a);
    this.explicitRows.set(a, rows);
    this.explicitRows.delete(b);
    return { root: a, mergedRows: rows.size > 1 };
  }
}

function cycleNodes(nodes: string[], edges: ConstraintEdge[]) {
  const outgoing = new Map<string, string[]>(nodes.map(id => [id, []]));
  const indegree = new Map(nodes.map(id => [id, 0]));
  for (const edge of edges) {
    if (!outgoing.has(edge.from) || !outgoing.has(edge.to)) continue;
    outgoing.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to)! + 1);
  }
  const ready = [...nodes].filter(id => indegree.get(id) === 0).sort();
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    for (const next of outgoing.get(ready[cursor])!.sort()) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next)! === 0) ready.push(next);
    }
  }
  return new Set([...indegree].filter(([, degree]) => degree > 0).map(([id]) => id));
}

/** Compile normalized geometry constraints; source grammar and family admission belong to the caller. */
export function compileConstraints(nodeIds: string[], input: Constraint[] = []): CompiledConstraints {
  if (!Array.isArray(nodeIds) || nodeIds.some(id => typeof id !== 'string' || !id)
    || new Set(nodeIds).size !== nodeIds.length || !Array.isArray(input)) {
    throw new TypeError('Constraint compilation requires distinct node IDs and a normalized constraint array.');
  }
  const known = new Set(nodeIds);
  for (const form of input) {
    if (!form || !Number.isInteger(form.index) || form.index < 0
      || (form.type === 'row' ? !Array.isArray(form.ids) || form.ids.length < 2
        || new Set(form.ids).size !== form.ids.length || form.ids.some(id => !known.has(id))
        : form.type === 'place' ? !known.has(form.node) || !['top', 'bottom', 'left', 'right'].includes(form.place)
          : !['below', 'rightOf'].includes(form.type) || !known.has(form.node) || !known.has(form.other))) {
      throw Object.assign(new TypeError('Constraints must use normalized forms, known node IDs and nonnegative integer indices.'), {
        ...(form && Number.isInteger(form.index) && form.index >= 0 ? { constraintIndex: form.index } : {}),
        ...(form && form.type !== 'row' && typeof form.node === 'string' ? { nodeId: form.node } : {}),
      });
    }
  }
  const ids = [...nodeIds], forms = input.map(form => form.type === 'row' ? { ...form, ids: [...form.ids] } : { ...form });
  let valid = true;
  const diagnostics: Diagnostic[] = [];
  const report = (code: string, constraintIndex: number, message: string, nodeId?: string) => diagnostics.push({
    code, path: `/layout/hints/${constraintIndex}`, message, constraintIndex, ...(nodeId === undefined ? {} : { nodeId }),
  });
  const placements = new Map<string, PlaceConstraint>();
  for (const form of forms.filter((item): item is PlaceConstraint => item.type === 'place')) {
    if (placements.has(form.node)) {
      report('HINT_CONFLICT', form.index, `Node ${form.node} already has a place hint.`, form.node);
      valid = false;
    } else placements.set(form.node, form);
  }

  const sidePlacements = new Map([...placements].filter(([, form]) => ['left', 'right'].includes(form.place)));
  for (const form of forms.filter(item => item.type !== 'place')) {
    const members = form.type === 'row' ? form.ids : [form.node, form.other];
    if (members.some(id => sidePlacements.has(id))) {
      report('HINT_CONFLICT', form.index, 'A side-column node cannot also participate in row, rightOf or below hints.');
      valid = false;
    }
  }

  const rows = new DisjointRows(ids);
  for (const form of forms.filter((item): item is RowConstraint | RelativeConstraint => item.type === 'row' || item.type === 'rightOf')) {
    const members = form.type === 'row' ? form.ids : [form.other, form.node];
    for (let index = 1; index < members.length; index += 1) {
      const merged = rows.union(members[index - 1], members[index], form.type === 'row' ? form.index : undefined);
      if (merged.mergedRows) {
        report('HINT_CONFLICT', form.index, 'A node cannot belong to two rows after row and rightOf hints are merged.');
        valid = false;
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = rows.find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  const orderEdges = forms.flatMap(form => {
    if (form.type === 'row') return form.ids.slice(1).map((id, index) => ({ from: form.ids[index], to: id, index: form.index }));
    if (form.type === 'rightOf') return [{ from: form.other, to: form.node, index: form.index }];
    return [];
  });
  for (const members of groups.values()) {
    const cyclic = cycleNodes(members, orderEdges.filter(edge => rows.find(edge.from) === rows.find(members[0])));
    if (cyclic.size) {
      const edge = orderEdges.find(item => cyclic.has(item.from) && cyclic.has(item.to));
      report('HINT_CONFLICT', edge!.index, 'The left-to-right row order contains a cycle.');
      valid = false;
    }
  }

  const belowEdges = forms.filter((item): item is RelativeConstraint => item.type === 'below').map(form => ({
    from: rows.find(form.other), to: rows.find(form.node), index: form.index,
  }));
  const groupIds = [...groups.keys()];
  const cyclicGroups = cycleNodes(groupIds, belowEdges);
  if (cyclicGroups.size) {
    const edge = belowEdges.find(item => cyclicGroups.has(item.from) && cyclicGroups.has(item.to));
    report('HINT_CONFLICT', edge!.index, 'The row-to-below graph contains a cycle.');
    valid = false;
  }
  const topGroups = new Set([...placements.values()].filter(item => item.place === 'top').map(item => rows.find(item.node)));
  const bottomGroups = new Set([...placements.values()].filter(item => item.place === 'bottom').map(item => rows.find(item.node)));
  for (const group of topGroups) if (bottomGroups.has(group)) {
    const form = [...placements.values()].find(item => rows.find(item.node) === group && item.place === 'bottom');
    report('HINT_CONFLICT', form!.index, 'One merged row cannot be both top and bottom.', form!.node);
    valid = false;
  }
  for (const edge of belowEdges) {
    const topDisplaced = topGroups.has(edge.to);
    const bottomDisplaced = bottomGroups.has(edge.from);
    if (!topDisplaced && !bottomDisplaced) continue;
    const message = topDisplaced && bottomDisplaced
      ? 'A below hint cannot place a top row below, or a bottom row above, another row.'
      : topDisplaced
        ? 'A below hint cannot force a top row below another row.'
        : 'A below hint cannot force a bottom row above another row.';
    report('HINT_CONFLICT', edge.index, message);
    valid = false;
  }



  const order = new Map(ids.map((id, index) => [id, index]));
  const orderedGroups = new Map<string, string[]>();
  for (const [root, members] of groups) {
    const edges = orderEdges.filter(edge => rows.find(edge.from) === root);
    const outgoing = new Map<string, string[]>(members.map(id => [id, []]));
    const indegree = new Map(members.map(id => [id, 0]));
    for (const edge of edges) {
      outgoing.get(edge.from)!.push(edge.to);
      indegree.set(edge.to, indegree.get(edge.to)! + 1);
    }
    const ready = members.filter(id => indegree.get(id) === 0).sort((a, b) => order.get(a)! - order.get(b)! || a.localeCompare(b));
    const sorted: string[] = [];
    for (let cursor = 0; cursor < ready.length; cursor += 1) {
      const id = ready[cursor];
      sorted.push(id);
      for (const next of outgoing.get(id)!.sort()) {
        indegree.set(next, indegree.get(next)! - 1);
        if (indegree.get(next)! === 0) ready.push(next);
      }
    }
    orderedGroups.set(root, sorted);
  }
  return { valid, forms, ids, rows, groups, orderEdges, belowEdges, placements, sidePlacements, topGroups, bottomGroups, diagnostics, orderedGroups };
}
