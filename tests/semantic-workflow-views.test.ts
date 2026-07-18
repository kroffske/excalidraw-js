import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiagramSpec,
  validateDiagramSpec,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

type CaseId = "review" | "review-plan" | "review-fix";
type View = "c4" | "sequence" | "swimlane";
type Grade = "structural" | "annotated" | "omitted";
type UnitType = "requiredFact" | "humanGate" | "writeBoundary";

interface FieldProof {
  kind: "fields";
  pointers: string[];
  values: string[];
}

interface AnnotationProof {
  kind: "annotation";
  pointers: string[];
  tokens: string[];
}

interface PredicateProof {
  kind: "predicate";
  name: "reachable" | "fork-join" | "precedes" | "depends-on-all" | "no-matching-semantic-id";
  args: Record<string, unknown>;
}

type CoverageProof = FieldProof | AnnotationProof | PredicateProof;

interface CoverageExpectation {
  grade: Grade;
  proof?: CoverageProof;
  reason?: string;
}

interface CoverageRow extends CoverageExpectation {
  caseId: CaseId;
  unitType: UnitType;
  unitId: string;
  view: View;
}

interface ExpectationDocument {
  schema: string;
  views: View[];
  cases: Array<{
    caseId: CaseId;
    units: Array<{
      unitType: UnitType;
      unitId: string;
      views: Record<View, CoverageExpectation>;
    }>;
  }>;
}

interface LedgerDocument {
  schema: string;
  rows: CoverageRow[];
}

interface CorpusManifest {
  crossCaseTransitions: unknown[];
  cases: Array<{
    id: CaseId;
    file: string;
    requiredFactIds: string[];
  }>;
}

interface CorpusFixture {
  id: CaseId;
  humanGates: Array<{ id: string }>;
  writeBoundaries: Array<{ stage: string }>;
}

interface ProjectionEvidence {
  value: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

interface C4Spec {
  system: {
    containers: Array<{
      id: string;
      iconId?: string;
    }>;
  };
  relationships: Array<{
    id: string;
    from: string;
    to: string;
  }>;
}

interface SequenceSpec {
  participants: Array<{ id: string; name: string }>;
  messages: Array<{
    id: string;
    from: string;
    to: string;
    kind: "call" | "return";
    label: string;
  }>;
  notes: Array<{
    id: string;
    message: string;
    text: string;
  }>;
}

interface SwimlaneSpec {
  lanes: Array<{ id: string }>;
  activities: Array<{
    id: string;
    lane: string;
    type: "step" | "decision" | "artifact";
  }>;
  transitions: Array<{
    id: string;
    from: string;
    to: string;
  }>;
}

const testRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testRoot, "fixtures");
const corpusRoot = join(fixtureRoot, "agent-workflows", "v1");
const projectionRoots: Record<View, string> = {
  c4: join(fixtureRoot, "semantic-c4", "v1"),
  sequence: join(fixtureRoot, "semantic-sequence", "v1"),
  swimlane: join(fixtureRoot, "semantic-swimlane", "v1"),
};
const coverageRoot = join(fixtureRoot, "semantic-workflow-views", "v1");
const caseIds: CaseId[] = ["review", "review-plan", "review-fix"];
const views: View[] = ["c4", "sequence", "swimlane"];

const manifest = readJson<CorpusManifest>(join(corpusRoot, "manifest.json"));
const corpusFixtures = Object.fromEntries(
  manifest.cases.map((entry) => [
    entry.id,
    readJson<CorpusFixture>(join(corpusRoot, entry.file)),
  ]),
) as Record<CaseId, CorpusFixture>;
const expectations = readJson<ExpectationDocument>(
  join(coverageRoot, "coverage-expectations.json"),
);
const ledger = readJson<LedgerDocument>(join(coverageRoot, "coverage-ledger.json"));
const evidence = loadProjectionEvidence();
const expectedRows = flattenExpectations(expectations);

const structuralPointers: Record<View, RegExp[]> = {
  c4: [
    /^\$\.system\.containers\[\d+\]\.id$/u,
    /^\$\.relationships\[\d+\]\.(?:from|to)$/u,
  ],
  sequence: [
    /^\$\.participants\[\d+\]\.id$/u,
    /^\$\.messages\[\d+\]\.(?:from|to|kind)$/u,
  ],
  swimlane: [
    /^\$\.lanes\[\d+\]\.id$/u,
    /^\$\.activities\[\d+\]\.(?:lane|type)$/u,
    /^\$\.transitions\[\d+\]\.(?:from|to)$/u,
  ],
};

const annotationPointers: Record<View, RegExp[]> = {
  c4: [
    /^\$\.title$/u,
    /^\$\.system\.(?:name|description)$/u,
    /^\$\.system\.containers\[\d+\]\.(?:name|description|technology)$/u,
    /^\$\.relationships\[\d+\]\.(?:description|technology)$/u,
  ],
  sequence: [
    /^\$\.title$/u,
    /^\$\.participants\[\d+\]\.name$/u,
    /^\$\.messages\[\d+\]\.label$/u,
    /^\$\.notes\[\d+\]\.text$/u,
  ],
  swimlane: [
    /^\$\.title$/u,
    /^\$\.lanes\[\d+\]\.label$/u,
    /^\$\.activities\[\d+\]\.title$/u,
    /^\$\.transitions\[\d+\]\.label$/u,
  ],
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function invariant(condition: unknown, code: string, detail: string): asserts condition {
  if (!condition) {
    throw new Error(`${code}: ${detail}`);
  }
}

function rowKey(row: Pick<CoverageRow, "caseId" | "unitType" | "unitId" | "view">): string {
  return `${row.caseId}/${row.unitType}/${row.unitId}/${row.view}`;
}

function unitKey(
  caseId: CaseId,
  unitType: UnitType,
  unitId: string,
): string {
  return `${caseId}/${unitType}/${unitId}`;
}

function flattenExpectations(document: ExpectationDocument): CoverageRow[] {
  return document.cases.flatMap(({ caseId, units }) =>
    units.flatMap(({ unitType, unitId, views: unitViews }) =>
      document.views.map((view) => ({
        caseId,
        unitType,
        unitId,
        view,
        ...unitViews[view],
      }))
    )
  );
}

function loadProjectionEvidence(): Record<CaseId, Record<View, ProjectionEvidence>> {
  return Object.fromEntries(
    caseIds.map((caseId) => [
      caseId,
      Object.fromEntries(
        views.map((view) => {
          const input = readJson<unknown>(
            join(projectionRoots[view], `${caseId}.json`),
          );
          const validation = validateDiagramSpec(input, { seed: 42 });
          invariant(
            validation.ok,
            "INVALID_PROJECTION",
            `${caseId}/${view} did not validate`,
          );
          const build = buildDiagramSpec(input, { seed: 42 });
          invariant(
            build.ok && build.geometry.ok,
            "INVALID_PROJECTION",
            `${caseId}/${view} did not build cleanly`,
          );
          return [
            view,
            {
              value: validation.value as unknown as Record<string, unknown>,
              metadata: build.metadata as unknown as Record<string, unknown>,
            },
          ];
        }),
      ) as Record<View, ProjectionEvidence>,
    ]),
  ) as Record<CaseId, Record<View, ProjectionEvidence>>;
}

function isAllowedPointer(
  view: View,
  kind: FieldProof["kind"] | AnnotationProof["kind"],
  pointer: string,
): boolean {
  const allowlist = kind === "fields"
    ? structuralPointers[view]
    : annotationPointers[view];
  return allowlist.some((pattern) => pattern.test(pointer));
}

function assertPointerClass(
  view: View,
  kind: FieldProof["kind"] | AnnotationProof["kind"],
  pointer: string,
  key: string,
): void {
  if (isAllowedPointer(view, kind, pointer)) {
    return;
  }
  const belongsToAnotherView = views.some(
    (candidate) =>
      candidate !== view && isAllowedPointer(candidate, kind, pointer),
  );
  invariant(
    !belongsToAnotherView,
    "CROSS_VIEW_POINTER",
    `${key} uses ${pointer}`,
  );
  invariant(false, "DISALLOWED_POINTER", `${key} uses ${pointer}`);
}

function resolvePointer(
  value: Record<string, unknown>,
  pointer: string,
  key: string,
): unknown {
  invariant(pointer.startsWith("$."), "INVALID_POINTER", `${key} uses ${pointer}`);
  const segments: Array<string | number> = [];
  const segmentPattern = /\.([A-Za-z][A-Za-z0-9]*)|\[(\d+)\]/gy;
  let offset = 1;
  while (offset < pointer.length) {
    segmentPattern.lastIndex = offset;
    const match = segmentPattern.exec(pointer);
    invariant(
      match !== null && match.index === offset,
      "INVALID_POINTER",
      `${key} uses ${pointer}`,
    );
    segments.push(match[1] ?? Number(match[2]));
    offset = segmentPattern.lastIndex;
  }

  let current: unknown = value;
  for (const segment of segments) {
    const validContainer = current !== null && typeof current === "object";
    invariant(validContainer, "DANGLING_POINTER", `${key} uses ${pointer}`);
    if (typeof segment === "number") {
      invariant(
        Array.isArray(current) && segment < current.length,
        "DANGLING_POINTER",
        `${key} uses ${pointer}`,
      );
      current = current[segment];
      continue;
    }
    invariant(
      !Array.isArray(current)
        && Object.prototype.hasOwnProperty.call(current, segment),
      "DANGLING_POINTER",
      `${key} uses ${pointer}`,
    );
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringArray(
  value: unknown,
  code: string,
  detail: string,
): string[] {
  invariant(
    Array.isArray(value) && value.every((item) => typeof item === "string"),
    code,
    detail,
  );
  return value;
}

function stringArg(
  args: Record<string, unknown>,
  name: string,
  key: string,
): string {
  const value = args[name];
  invariant(
    typeof value === "string",
    "INVALID_PREDICATE_ARGS",
    `${key} requires string ${name}`,
  );
  return value;
}

function arrayArg(
  args: Record<string, unknown>,
  name: string,
  key: string,
): string[] {
  return stringArray(
    args[name],
    "INVALID_PREDICATE_ARGS",
    `${key} requires string[] ${name}`,
  );
}

function asSequence(value: Record<string, unknown>, key: string): SequenceSpec {
  invariant(
    Array.isArray(value.messages),
    "PREDICATE_VIEW_MISMATCH",
    `${key} requires sequence input`,
  );
  return value as unknown as SequenceSpec;
}

function asSwimlane(value: Record<string, unknown>, key: string): SwimlaneSpec {
  invariant(
    Array.isArray(value.activities) && Array.isArray(value.transitions),
    "PREDICATE_VIEW_MISMATCH",
    `${key} requires swimlane input`,
  );
  return value as unknown as SwimlaneSpec;
}

function assertKnownIds(
  ids: Set<string>,
  required: string[],
  key: string,
): void {
  const missing = required.filter((id) => !ids.has(id));
  invariant(
    missing.length === 0,
    "INVALID_PREDICATE_ARGS",
    `${key} has unknown ids ${JSON.stringify(missing)}`,
  );
}

function swimlaneReachable(
  spec: SwimlaneSpec,
  from: string,
  to: string,
): boolean {
  const pending = [from];
  const seen = new Set<string>(pending);
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const transition of spec.transitions) {
      if (transition.from !== current) {
        continue;
      }
      if (transition.to === to) {
        return true;
      }
      if (!seen.has(transition.to)) {
        seen.add(transition.to);
        pending.push(transition.to);
      }
    }
  }
  return false;
}

function executePredicate(
  view: View,
  projection: ProjectionEvidence,
  proof: PredicateProof,
  key: string,
): void {
  const { value, metadata } = projection;
  invariant(
    metadata.template === value.template,
    "PREDICATE_METADATA_MISMATCH",
    `${key} build metadata does not match normalized input`,
  );

  switch (proof.name) {
    case "precedes": {
      invariant(view === "sequence", "PREDICATE_VIEW_MISMATCH", key);
      const spec = asSequence(value, key);
      const before = arrayArg(proof.args, "before", key);
      const after = stringArg(proof.args, "after", key);
      const messageIds = spec.messages.map(({ id }) => id);
      assertKnownIds(new Set(messageIds), [...before, after], key);
      const afterIndex = messageIds.indexOf(after);
      invariant(
        before.every((id) => messageIds.indexOf(id) < afterIndex),
        "PREDICATE_FAILED",
        `${key} expected ${JSON.stringify(before)} before ${after}`,
      );
      return;
    }
    case "reachable": {
      invariant(view === "swimlane", "PREDICATE_VIEW_MISMATCH", key);
      const spec = asSwimlane(value, key);
      const from = stringArg(proof.args, "from", key);
      const targets = arrayArg(proof.args, "targets", key);
      const expected = proof.args.expected;
      invariant(
        typeof expected === "boolean",
        "INVALID_PREDICATE_ARGS",
        `${key} requires boolean expected`,
      );
      const activityIds = new Set(spec.activities.map(({ id }) => id));
      assertKnownIds(activityIds, [from, ...targets], key);
      invariant(
        targets.every(
          (target) => swimlaneReachable(spec, from, target) === expected,
        ),
        "PREDICATE_FAILED",
        `${key} reachability differs`,
      );
      return;
    }
    case "fork-join": {
      invariant(view === "swimlane", "PREDICATE_VIEW_MISMATCH", key);
      const spec = asSwimlane(value, key);
      const fork = stringArg(proof.args, "fork", key);
      const branches = arrayArg(proof.args, "branches", key);
      const joinId = stringArg(proof.args, "join", key);
      invariant(
        branches.length === 2 && branches[0] !== branches[1],
        "INVALID_PREDICATE_ARGS",
        `${key} requires two distinct branches`,
      );
      const activityIds = new Set(spec.activities.map(({ id }) => id));
      assertKnownIds(activityIds, [fork, ...branches, joinId], key);
      const directForkTargets = new Set(
        spec.transitions
          .filter(({ from }) => from === fork)
          .map(({ to }) => to),
      );
      const directJoinSources = new Set(
        spec.transitions
          .filter(({ to }) => to === joinId)
          .map(({ from }) => from),
      );
      const realForkJoin = branches.every(
        (branch) =>
          directForkTargets.has(branch)
          && swimlaneReachable(spec, fork, branch)
          && swimlaneReachable(spec, branch, joinId)
          && directJoinSources.has(branch),
      )
        && !swimlaneReachable(spec, branches[0], branches[1])
        && !swimlaneReachable(spec, branches[1], branches[0]);
      invariant(
        realForkJoin,
        "PREDICATE_FAILED",
        `${key} is not a real fork/join`,
      );
      return;
    }
    case "depends-on-all": {
      invariant(view === "swimlane", "PREDICATE_VIEW_MISMATCH", key);
      const spec = asSwimlane(value, key);
      const node = stringArg(proof.args, "node", key);
      const predecessors = arrayArg(proof.args, "predecessors", key);
      const activityIds = new Set(spec.activities.map(({ id }) => id));
      assertKnownIds(activityIds, [node, ...predecessors], key);
      const directSources = new Set(
        spec.transitions
          .filter(({ to }) => to === node)
          .map(({ from }) => from),
      );
      invariant(
        predecessors.every((id) => directSources.has(id)),
        "PREDICATE_FAILED",
        `${key} does not depend on every predecessor`,
      );
      return;
    }
    case "no-matching-semantic-id": {
      const tokens = arrayArg(proof.args, "tokens", key).map((token) =>
        token.toLowerCase()
      );
      const ids = semanticIds(view, value, key).map((id) => id.toLowerCase());
      invariant(
        tokens.every((token) => ids.every((id) => !id.includes(token))),
        "PREDICATE_FAILED",
        `${key} found a forbidden semantic id`,
      );
      return;
    }
    default:
      invariant(
        false,
        "UNSUPPORTED_PREDICATE",
        `${key} uses ${String(proof.name)}`,
      );
  }
}

function semanticIds(
  view: View,
  value: Record<string, unknown>,
  key: string,
): string[] {
  if (view === "sequence") {
    const spec = asSequence(value, key);
    return [
      ...spec.participants.map(({ id }) => id),
      ...spec.messages.map(({ id }) => id),
      ...spec.notes.map(({ id }) => id),
    ];
  }
  if (view === "swimlane") {
    const spec = asSwimlane(value, key);
    return [
      ...spec.lanes.map(({ id }) => id),
      ...spec.activities.map(({ id }) => id),
      ...spec.transitions.map(({ id }) => id),
    ];
  }
  const spec = value as unknown as C4Spec;
  return [
    ...spec.system.containers.map(({ id }) => id),
    ...spec.relationships.map(({ id }) => id),
  ];
}

function evaluateProof(row: CoverageRow, key: string): void {
  invariant(row.proof !== undefined, "MISSING_PROOF", key);
  invariant(row.reason === undefined, "NON_OMITTED_HAS_REASON", key);
  const projection = evidence[row.caseId][row.view];
  if (row.proof.kind === "predicate") {
    invariant(
      row.grade === "structural",
      "PREDICATE_GRADE_MISMATCH",
      key,
    );
    executePredicate(row.view, projection, row.proof, key);
    return;
  }

  invariant(
    row.proof.pointers.length > 0,
    "MISSING_POINTER",
    key,
  );
  const values = row.proof.pointers.map((pointer) => {
    assertPointerClass(row.view, row.proof!.kind as "fields" | "annotation", pointer, key);
    return resolvePointer(projection.value, pointer, key);
  });
  if (row.proof.kind === "fields") {
    invariant(row.grade === "structural", "FIELD_GRADE_MISMATCH", key);
    invariant(
      values.every((value) => typeof value === "string")
        && JSON.stringify(values) === JSON.stringify(row.proof.values),
      "WITNESS_MISMATCH",
      `${key} resolved unexpected structural values`,
    );
    return;
  }

  invariant(row.grade === "annotated", "ANNOTATION_GRADE_MISMATCH", key);
  invariant(
    values.every((value) => typeof value === "string"),
    "ANNOTATION_NOT_TEXT",
    key,
  );
  const annotation = values.join("\n").toLowerCase();
  for (const token of row.proof.tokens) {
    invariant(
      annotation.includes(token.toLowerCase()),
      "ANNOTATION_TOKEN_MISSING",
      `${key} lacks ${JSON.stringify(token)}`,
    );
  }
}

function exactExpectationShape(row: CoverageExpectation): string {
  return JSON.stringify({
    grade: row.grade,
    ...(row.proof === undefined ? {} : { proof: row.proof }),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
  });
}

function evaluateCoverage(rows: CoverageRow[]): void {
  const expectationByKey = new Map(
    expectedRows.map((row) => [rowKey(row), row]),
  );
  const seen = new Set<string>();

  for (const row of rows) {
    const key = rowKey(row);
    const expected = expectationByKey.get(key);
    invariant(expected !== undefined, "EXTRA_TUPLE", key);
    invariant(!seen.has(key), "DUPLICATE_TUPLE", key);
    seen.add(key);
    invariant(row.grade === expected.grade, "WRONG_GRADE", key);

    if (row.grade === "omitted") {
      invariant(row.proof === undefined, "OMITTED_HAS_PROOF", key);
      invariant(
        typeof row.reason === "string" && row.reason.length > 0,
        "OMITTED_WITHOUT_REASON",
        key,
      );
    } else {
      evaluateProof(row, key);
    }

    invariant(
      exactExpectationShape(row) === exactExpectationShape(expected),
      "WITNESS_MISMATCH",
      key,
    );
  }

  for (const key of expectationByKey.keys()) {
    invariant(seen.has(key), "MISSING_TUPLE", key);
  }
}

function cloneRows(): CoverageRow[] {
  return structuredClone(ledger.rows);
}

function findRow(
  rows: CoverageRow[],
  key: string,
): CoverageRow {
  const row = rows.find((candidate) => rowKey(candidate) === key);
  invariant(row !== undefined, "TEST_SETUP", `missing ${key}`);
  return row;
}

function corpusUnitKeys(): Set<string> {
  const keys = new Set<string>();
  for (const entry of manifest.cases) {
    for (const factId of entry.requiredFactIds) {
      keys.add(unitKey(entry.id, "requiredFact", factId));
    }
    for (const gate of corpusFixtures[entry.id].humanGates) {
      keys.add(unitKey(entry.id, "humanGate", gate.id));
    }
    for (const boundary of corpusFixtures[entry.id].writeBoundaries) {
      keys.add(unitKey(entry.id, "writeBoundary", boundary.stage));
    }
  }
  return keys;
}

describe("agent-workflow semantic projections", () => {
  it("builds nine case-local projections with clean geometry at seed 42", () => {
    expect(Object.keys(evidence)).toEqual(caseIds);
    for (const caseId of caseIds) {
      expect(Object.keys(evidence[caseId])).toEqual(views);
    }
  });

  it("keeps C4 iconless, internal-only, directionally bounded, and case-specific", () => {
    const expectedRelationships: Record<CaseId, string[]> = {
      review: ["workflow->agent", "agent->artifacts"],
      "review-plan": ["workflow->agent", "agent->artifacts"],
      "review-fix": [
        "workflow->agent",
        "agent->artifacts",
        "agent->worktree",
      ],
    };

    for (const caseId of caseIds) {
      const spec = evidence[caseId].c4.value as unknown as C4Spec;
      const expectedContainers = caseId === "review-fix"
        ? ["workflow", "agent", "artifacts", "worktree"]
        : ["workflow", "agent", "artifacts"];
      expect(spec.system.containers.map(({ id }) => id)).toEqual(
        expectedContainers,
      );
      expect(spec.system.containers.some(({ id }) => id === "operator")).toBe(false);
      expect(spec.system.containers.every(({ iconId }) => iconId === undefined)).toBe(true);
      expect(
        spec.relationships.map(({ from, to }) => `${from}->${to}`),
      ).toEqual(expectedRelationships[caseId]);

      const unorderedPairs = spec.relationships.map(({ from, to }) =>
        [from, to].sort().join("<->")
      );
      expect(new Set(unorderedPairs).size).toBe(unorderedPairs.length);
      const pairCap = expectedContainers.length === 4 ? 6 : 3;
      expect(spec.relationships.length).toBeLessThanOrEqual(pairCap);

      const build = buildDiagramSpec(
        readJson<unknown>(join(projectionRoots.c4, `${caseId}.json`)),
        { seed: 42 },
      );
      expect(build.ok).toBe(true);
      if (build.ok) {
        expect(Object.keys(build.scene.files)).toEqual([]);
      }
    }
  });

  it("keeps sequence participants exact and temporal semantics input-ordered", () => {
    for (const caseId of caseIds) {
      const spec = evidence[caseId].sequence.value as unknown as SequenceSpec;
      expect(spec.participants.map(({ id }) => id)).toEqual([
        "operator",
        "workflow",
        "agent",
        "artifacts",
      ]);
      expect(spec.messages.length).toBeGreaterThanOrEqual(1);
      expect(spec.messages.length).toBeLessThanOrEqual(12);
      expect(spec.notes.length).toBeLessThanOrEqual(8);
      expect(new Set(spec.notes.map(({ message }) => message)).size).toBe(
        spec.notes.length,
      );
      expect(spec.notes.every(({ text }) =>
        text.length <= 160 && !/[\r\n\u2028\u2029]/u.test(text)
      )).toBe(true);

      const metadata = evidence[caseId].sequence.metadata as unknown as {
        messages: Array<{ id: string; kind: "call" | "return" }>;
      };
      expect(metadata.messages.map(({ id }) => id)).toEqual(
        spec.messages.map(({ id }) => id),
      );
      expect(metadata.messages.map(({ kind }) => kind)).toEqual(
        spec.messages.map(({ kind }) => kind),
      );
    }

    const review = evidence.review.sequence.value as unknown as SequenceSpec;
    expect(
      review.messages.every(({ label }) => !/\b(?:parallel|concurrent)\b/iu.test(label)),
    ).toBe(true);
    expect(
      review.notes.some(({ text }) => /\bparallel\b/iu.test(text)),
    ).toBe(true);
  });

  it("keeps cases independent across corpus, expectations, and evaluated rows", () => {
    expect(manifest.crossCaseTransitions).toEqual([]);
    expect(manifest.cases.map(({ id }) => id)).toEqual(caseIds);
    expect(expectations.cases.map(({ caseId }) => caseId)).toEqual(caseIds);
    expect(new Set(ledger.rows.map(({ caseId }) => caseId))).toEqual(
      new Set(caseIds),
    );

    const units = corpusUnitKeys();
    for (const row of ledger.rows) {
      expect(units.has(unitKey(row.caseId, row.unitType, row.unitId))).toBe(true);
    }
  });
});

describe("agent-workflow cross-view coverage oracle", () => {
  it("covers every corpus unit exactly once per view with an independent witness", () => {
    expect(expectations.schema).toBe(
      "semantic-workflow-coverage-expectations.v1",
    );
    expect(expectations.views).toEqual(views);
    expect(ledger.schema).toBe("semantic-workflow-coverage-ledger.v1");
    const units = corpusUnitKeys();
    expect(units.size).toBe(35);
    expect(
      manifest.cases.reduce(
        (count, entry) => count + entry.requiredFactIds.length,
        0,
      ),
    ).toBe(20);
    expect(
      caseIds.reduce(
        (count, caseId) => count + corpusFixtures[caseId].humanGates.length,
        0,
      ),
    ).toBe(4);
    expect(
      caseIds.reduce(
        (count, caseId) =>
          count + corpusFixtures[caseId].writeBoundaries.length,
        0,
      ),
    ).toBe(11);
    expect(expectedRows).toHaveLength(105);
    expect(ledger.rows).toHaveLength(105);
    expect(new Set(ledger.rows.map(rowKey)).size).toBe(105);
    evaluateCoverage(ledger.rows);
  });

  it("attributes every planned ledger mutation to its intended guard", () => {
    const mutationCases: Array<{
      name: string;
      mutate: (rows: CoverageRow[]) => void;
      error: string;
    }> = [
      {
        name: "wrong grade",
        mutate: (rows) => {
          findRow(
            rows,
            "review/requiredFact/blocked-early-exit/c4",
          ).grade = "structural";
        },
        error: "WRONG_GRADE",
      },
      {
        name: "wrong but allowlisted witness",
        mutate: (rows) => {
          const row = findRow(
            rows,
            "review-fix/requiredFact/distinct-linked-worktree/c4",
          );
          invariant(row.proof?.kind === "fields", "TEST_SETUP", "field proof");
          row.proof.pointers = [
            "$.system.containers[2].id",
            "$.relationships[1].from",
            "$.relationships[1].to",
          ];
        },
        error: "WITNESS_MISMATCH",
      },
      {
        name: "wrong valid predicate arguments",
        mutate: (rows) => {
          const row = findRow(
            rows,
            "review/requiredFact/two-parallel-review-lanes/swimlane",
          );
          invariant(row.proof?.kind === "predicate", "TEST_SETUP", "predicate proof");
          row.proof.args = {
            fork: "target-status",
            branches: ["review-context", "review-changes"],
            join: "adjudicate",
          };
        },
        error: "WITNESS_MISMATCH",
      },
      {
        name: "dangling pointer",
        mutate: (rows) => {
          const row = findRow(
            rows,
            "review/requiredFact/blocked-early-exit/c4",
          );
          invariant(row.proof?.kind === "annotation", "TEST_SETUP", "annotation proof");
          row.proof.pointers = ["$.relationships[99].description"];
        },
        error: "DANGLING_POINTER",
      },
      {
        name: "cross-view pointer",
        mutate: (rows) => {
          const row = findRow(
            rows,
            "review-fix/requiredFact/distinct-linked-worktree/c4",
          );
          invariant(row.proof?.kind === "fields", "TEST_SETUP", "field proof");
          row.proof.pointers = ["$.messages[0].from"];
        },
        error: "CROSS_VIEW_POINTER",
      },
      {
        name: "missing tuple",
        mutate: (rows) => {
          rows.splice(
            rows.findIndex(
              (row) =>
                rowKey(row)
                === "review/requiredFact/blocked-early-exit/c4",
            ),
            1,
          );
        },
        error: "MISSING_TUPLE",
      },
      {
        name: "extra tuple",
        mutate: (rows) => {
          rows.push({
            caseId: "review",
            unitType: "requiredFact",
            unitId: "invented-fact",
            view: "c4",
            grade: "omitted",
            reason: "Invented tuple.",
          });
        },
        error: "EXTRA_TUPLE",
      },
      {
        name: "omitted with pointer",
        mutate: (rows) => {
          const row = findRow(
            rows,
            "review/writeBoundary/resolve-target/c4",
          );
          row.proof = {
            kind: "annotation",
            pointers: ["$.system.description"],
            tokens: ["workflow"],
          };
        },
        error: "OMITTED_HAS_PROOF",
      },
    ];

    for (const mutation of mutationCases) {
      const rows = cloneRows();
      mutation.mutate(rows);
      expect(
        () => evaluateCoverage(rows),
        mutation.name,
      ).toThrow(new RegExp(`^${mutation.error}:`, "u"));
    }
  });
});
