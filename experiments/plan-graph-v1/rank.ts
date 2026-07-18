import type { Constraint, Fixture } from "./fixture.js";
import type { PlannerReason } from "./model.js";

interface Ranking {
  ranks: Record<string, number>;
  components: Record<string, string[]>;
  componentByNode: Record<string, string>;
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  constructor(ids: string[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent) throw new Error(`UNKNOWN_CONSTRAINT_REFERENCE:${id}`);
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left: string, right: string): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a === b) return;
    const [root, child] = codePointCompare(a, b) <= 0 ? [a, b] : [b, a];
    this.parent.set(child, root);
  }
}

export function rankFixture(fixture: Fixture): Ranking {
  const nodeIds = fixture.nodes.map((node) => node.id);
  const nodeSet = new Set(nodeIds);
  const groups = new Map(fixture.groups.map((group) => [group.id, group.members]));
  const union = new UnionFind(nodeIds);

  for (const constraint of fixture.constraints) {
    if (constraint.kind !== "sameRank") continue;
    assertSameRankConstraint(constraint, nodeSet);
    const [head, ...tail] = constraint.nodes;
    for (const node of tail) union.union(head, node);
  }

  const componentByNode = Object.fromEntries(
    nodeIds.map((id) => [id, union.find(id)]),
  );
  const components: Record<string, string[]> = {};
  for (const id of nodeIds) {
    const root = componentByNode[id];
    (components[root] ??= []).push(id);
  }
  for (const members of Object.values(components)) members.sort(codePointCompare);

  const arcs = new Map<string, Set<string>>();
  const indegree = new Map(Object.keys(components).map((id) => [id, 0]));
  const addArc = (fromNode: string, toNode: string, reason: PlannerReason) => {
    if (!nodeSet.has(fromNode) || !nodeSet.has(toNode)) {
      throw new Error(`UNKNOWN_CONSTRAINT_REFERENCE:${fromNode}:${toNode}`);
    }
    const from = componentByNode[fromNode];
    const to = componentByNode[toNode];
    if (from === to) throw new Error(`${reason}:${fromNode}:${toNode}`);
    const targets = arcs.get(from) ?? new Set<string>();
    if (!targets.has(to)) {
      targets.add(to);
      arcs.set(from, targets);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  };

  for (const edge of fixture.edges) {
    if (edge.kind === "feedback") continue;
    addArc(edge.from, edge.to, "RANKING_EDGE_WITHIN_SAME_RANK");
  }
  for (const constraint of fixture.constraints) {
    if (constraint.kind !== "before") continue;
    const fromMembers = groups.get(constraint.from);
    const toMembers = groups.get(constraint.to);
    if (!fromMembers || !toMembers) {
      throw new Error(
        `UNKNOWN_CONSTRAINT_REFERENCE:${constraint.from}:${constraint.to}`,
      );
    }
    for (const from of fromMembers) {
      for (const to of toMembers) addArc(from, to, "BEFORE_CONFLICT");
    }
  }

  const ready = [...indegree.entries()]
    .filter(([, value]) => value === 0)
    .map(([id]) => id)
    .sort(codePointCompare);
  const componentRanks = new Map(Object.keys(components).map((id) => [id, 0]));
  let visited = 0;
  while (ready.length > 0) {
    const current = ready.shift()!;
    visited += 1;
    for (const target of [...(arcs.get(current) ?? [])].sort(codePointCompare)) {
      componentRanks.set(
        target,
        Math.max(
          componentRanks.get(target) ?? 0,
          (componentRanks.get(current) ?? 0) + 1,
        ),
      );
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if (indegree.get(target) === 0) {
        ready.push(target);
        ready.sort(codePointCompare);
      }
    }
  }
  if (visited !== Object.keys(components).length) {
    throw new Error("RANKING_CYCLE");
  }

  const ranks = Object.fromEntries(
    nodeIds.map((id) => [id, componentRanks.get(componentByNode[id]) ?? 0]),
  );
  return { ranks, components, componentByNode };
}

function assertSameRankConstraint(
  constraint: Extract<Constraint, { kind: "sameRank" }>,
  nodeSet: Set<string>,
): void {
  if (new Set(constraint.nodes).size !== constraint.nodes.length) {
    throw new Error("DUPLICATE_CONSTRAINT_MEMBER");
  }
  if (constraint.nodes.length < 2) throw new Error("BEFORE_CONFLICT");
  for (const node of constraint.nodes) {
    if (!nodeSet.has(node)) throw new Error(`UNKNOWN_CONSTRAINT_REFERENCE:${node}`);
  }
}

export function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
