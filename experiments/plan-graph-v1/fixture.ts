import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

export type EdgeKind = "primary" | "support" | "feedback";

export interface Group {
  id: string;
  label: string;
  members: string[];
}

export interface Node {
  id: string;
  group: string;
  title: string;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface SameRankConstraint {
  kind: "sameRank";
  nodes: string[];
  reason: string;
}

export interface BeforeConstraint {
  kind: "before";
  from: string;
  to: string;
  reason: string;
}

export type Constraint = SameRankConstraint | BeforeConstraint;

export interface Fixture {
  version: 1;
  id: string;
  title: string;
  dense: boolean;
  source: string;
  groups: Group[];
  nodes: Node[];
  edges: Edge[];
  constraints: Constraint[];
}

export const EXPECTED_FIXTURE_HASHES = {
  "course-schedule-kahn.json": "36ac2869eb47bfd318f7e744f98bdffd15e82fed10a85443a6b4421cfd354493",
  "locus-skill-chain-grouped.json": "60646db1d3bdda202bde8b6e76c985639f806e7c7b8ff5eec3166cec2bf2de7a",
  "ml-train-serve-c4.json": "84173f045bd489ecfc9f4fcaf0057971d3a2a6aa7c458eebdba3f13705fe31a4",
  "reaper-supervised-loop.json": "20ff8f5d8f839291a51f31ec9b50f98201a75607bd81a78b2967ba6f3116839f",
  "semantic-redraw-control.json": "2b4758c2a5c3d904dd71e1cf2514334b15a84e7d37dbb3f91d208facfb02c954",
} as const;

const FIXTURE_KEYS = ["version", "id", "title", "dense", "source", "groups", "nodes", "edges", "constraints"] as const;
const GROUP_KEYS = ["id", "label", "members"] as const;
const NODE_KEYS = ["id", "group", "title"] as const;
const EDGE_KEYS = ["id", "from", "to", "kind"] as const;
const SAME_RANK_KEYS = ["kind", "nodes", "reason"] as const;
const BEFORE_KEYS = ["kind", "from", "to", "reason"] as const;
const EDGE_KINDS = new Set<EdgeKind>(["primary", "support", "feedback"]);
const DEFAULT_FIXTURE_ROOT = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function validateFixture(value: unknown): Fixture {
  const fixture = objectAt(value, "$");
  exactKeys(fixture, FIXTURE_KEYS, "$");
  if (fixture.version !== 1) {
    fail("$.version", "must equal 1");
  }

  const id = nonEmptyString(fixture.id, "$.id");
  const title = nonEmptyString(fixture.title, "$.title");
  const dense = booleanAt(fixture.dense, "$.dense");
  const source = nonEmptyString(fixture.source, "$.source");
  const groups = arrayAt(fixture.groups, "$.groups").map(parseGroup);
  const nodes = arrayAt(fixture.nodes, "$.nodes").map(parseNode);
  const edges = arrayAt(fixture.edges, "$.edges").map(parseEdge);
  const constraints = arrayAt(fixture.constraints, "$.constraints").map(parseConstraint);

  nonEmpty(groups, "$.groups");
  nonEmpty(nodes, "$.nodes");
  nonEmpty(edges, "$.edges");
  uniqueIds(groups, "$.groups");
  uniqueIds(nodes, "$.nodes");
  uniqueIds(edges, "$.edges");

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const declaredMembership = new Map<string, string>();

  for (const [groupIndex, group] of groups.entries()) {
    nonEmpty(group.members, `$.groups[${groupIndex}].members`);
    uniqueStrings(group.members, `$.groups[${groupIndex}].members`);
    for (const member of group.members) {
      if (!nodeById.has(member)) {
        fail(`$.groups[${groupIndex}].members`, `references unknown node '${member}'`);
      }
      const previous = declaredMembership.get(member);
      if (previous) {
        fail(`$.groups[${groupIndex}].members`, `node '${member}' is also declared by group '${previous}'`);
      }
      declaredMembership.set(member, group.id);
    }
  }

  for (const [nodeIndex, node] of nodes.entries()) {
    if (!groupById.has(node.group)) {
      fail(`$.nodes[${nodeIndex}].group`, `references unknown group '${node.group}'`);
    }
    const declaredGroup = declaredMembership.get(node.id);
    if (declaredGroup !== node.group) {
      fail(
        `$.nodes[${nodeIndex}].group`,
        declaredGroup
          ? `does not match members declaration in group '${declaredGroup}'`
          : `node '${node.id}' is missing from group '${node.group}' members`,
      );
    }
  }

  for (const [edgeIndex, edge] of edges.entries()) {
    if (!nodeById.has(edge.from)) {
      fail(`$.edges[${edgeIndex}].from`, `references unknown node '${edge.from}'`);
    }
    if (!nodeById.has(edge.to)) {
      fail(`$.edges[${edgeIndex}].to`, `references unknown node '${edge.to}'`);
    }
  }

  for (const [constraintIndex, constraint] of constraints.entries()) {
    if (constraint.kind === "sameRank") {
      if (constraint.nodes.length < 2) {
        fail(`$.constraints[${constraintIndex}].nodes`, "must contain at least two nodes");
      }
      uniqueStrings(constraint.nodes, `$.constraints[${constraintIndex}].nodes`);
      for (const nodeId of constraint.nodes) {
        if (!nodeById.has(nodeId)) {
          fail(`$.constraints[${constraintIndex}].nodes`, `references unknown node '${nodeId}'`);
        }
      }
    } else {
      if (!groupById.has(constraint.from)) {
        fail(`$.constraints[${constraintIndex}].from`, `references unknown group '${constraint.from}'`);
      }
      if (!groupById.has(constraint.to)) {
        fail(`$.constraints[${constraintIndex}].to`, `references unknown group '${constraint.to}'`);
      }
      if (constraint.from === constraint.to) {
        fail(`$.constraints[${constraintIndex}]`, "before constraint must reference two distinct groups");
      }
    }
  }

  return { version: 1, id, title, dense, source, groups, nodes, edges, constraints };
}

export function loadFixtures(root: string | URL = DEFAULT_FIXTURE_ROOT): Fixture[] {
  const fixtureRoot = root instanceof URL ? fileURLToPath(root) : resolve(root);
  const expectedNames = Object.keys(EXPECTED_FIXTURE_HASHES).sort(codePointCompare);
  const actualNames = readdirSync(fixtureRoot)
    .filter((name) => name.endsWith(".json"))
    .sort(codePointCompare);

  if (!sameStrings(actualNames, expectedNames)) {
    const missing = expectedNames.filter((name) => !actualNames.includes(name));
    const extra = actualNames.filter((name) => !expectedNames.includes(name));
    throw new Error(
      `Fixture catalog mismatch: missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
    );
  }

  return expectedNames.map((name) => {
    const bytes = readFileSync(join(fixtureRoot, name));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    const expectedHash = EXPECTED_FIXTURE_HASHES[name as keyof typeof EXPECTED_FIXTURE_HASHES];
    if (actualHash !== expectedHash) {
      throw new Error(`Fixture hash mismatch for '${name}': expected ${expectedHash}, got ${actualHash}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Fixture '${name}' is not valid JSON`, { cause: error });
    }
    const fixture = validateFixture(parsed);
    if (`${fixture.id}.json` !== name) {
      throw new Error(`Fixture id '${fixture.id}' does not match filename '${name}'`);
    }
    return fixture;
  });
}

function parseGroup(value: unknown, index: number): Group {
  const path = `$.groups[${index}]`;
  const group = objectAt(value, path);
  exactKeys(group, GROUP_KEYS, path);
  return {
    id: nonEmptyString(group.id, `${path}.id`),
    label: nonEmptyString(group.label, `${path}.label`),
    members: arrayAt(group.members, `${path}.members`).map((member, memberIndex) =>
      nonEmptyString(member, `${path}.members[${memberIndex}]`)),
  };
}

function parseNode(value: unknown, index: number): Node {
  const path = `$.nodes[${index}]`;
  const node = objectAt(value, path);
  exactKeys(node, NODE_KEYS, path);
  return {
    id: nonEmptyString(node.id, `${path}.id`),
    group: nonEmptyString(node.group, `${path}.group`),
    title: nonEmptyString(node.title, `${path}.title`),
  };
}

function parseEdge(value: unknown, index: number): Edge {
  const path = `$.edges[${index}]`;
  const edge = objectAt(value, path);
  exactKeys(edge, EDGE_KEYS, path);
  const kind = nonEmptyString(edge.kind, `${path}.kind`);
  if (!EDGE_KINDS.has(kind as EdgeKind)) {
    fail(`${path}.kind`, `must be one of ${Array.from(EDGE_KINDS).join(", ")}`);
  }
  return {
    id: nonEmptyString(edge.id, `${path}.id`),
    from: nonEmptyString(edge.from, `${path}.from`),
    to: nonEmptyString(edge.to, `${path}.to`),
    kind: kind as EdgeKind,
  };
}

function parseConstraint(value: unknown, index: number): Constraint {
  const path = `$.constraints[${index}]`;
  const constraint = objectAt(value, path);
  const kind = nonEmptyString(constraint.kind, `${path}.kind`);
  if (kind === "sameRank") {
    exactKeys(constraint, SAME_RANK_KEYS, path);
    return {
      kind,
      nodes: arrayAt(constraint.nodes, `${path}.nodes`).map((node, nodeIndex) =>
        nonEmptyString(node, `${path}.nodes[${nodeIndex}]`)),
      reason: nonEmptyString(constraint.reason, `${path}.reason`),
    };
  }
  if (kind === "before") {
    exactKeys(constraint, BEFORE_KEYS, path);
    return {
      kind,
      from: nonEmptyString(constraint.from, `${path}.from`),
      to: nonEmptyString(constraint.to, `${path}.to`),
      reason: nonEmptyString(constraint.reason, `${path}.reason`),
    };
  }
  return fail(`${path}.kind`, "must be 'sameRank' or 'before'");
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    return fail(path, "must be an array");
  }
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return fail(path, "must be a non-empty, trimmed string");
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    return fail(path, "must be a boolean");
  }
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !expected.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    fail(path, `schema mismatch: missing=[${missing.join(", ")}] unknown=[${unknown.join(", ")}]`);
  }
}

function uniqueIds(values: Array<{ id: string }>, path: string): void {
  uniqueStrings(values.map((value) => value.id), `${path} ids`);
}

function uniqueStrings(values: string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      fail(path, `contains duplicate '${value}'`);
    }
    seen.add(value);
  }
}

function nonEmpty(values: unknown[], path: string): void {
  if (values.length === 0) {
    fail(path, "must not be empty");
  }
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid plan-graph fixture at ${path}: ${message}`);
}
