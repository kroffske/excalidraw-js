import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "agent-workflows",
  "v1",
);

const manifest = readJson("manifest.json");
const fixtureFiles = readdirSync(fixtureRoot)
  .filter((name) => name.endsWith(".json") && name !== "manifest.json")
  .sort();
const fixtures = Object.fromEntries(
  fixtureFiles.map((name) => {
    const value = readJson(name);
    return [stringField(value, "id"), value];
  }),
);

const OWNER_KINDS = new Set(["human", "orchestrator", "agent", "artifact-store"]);
const STAGE_MODES = new Set(["read-only", "task-artifact-write", "isolated-source-write"]);
const DECISION_KINDS = new Set(["early-exit", "routing", "completion", "artifact-publication"]);
const ARTIFACT_KINDS = new Set([
  "task-metadata",
  "review-evidence",
  "approval-plan",
  "runtime-evidence",
  "runtime-result",
  "isolated-source-diff",
  "verification-report",
]);
const MUTABILITIES = new Set([
  "workflow-updated",
  "immutable",
  "human-editable",
  "append-only",
  "workflow-written",
  "human-edited",
  "uncommitted",
]);
const HUMAN_STATES = new Set(["pending", "accepted", "waived", "deferred", "keep", "edit", "commit", "discard"]);
const FORBIDDEN_ACTIONS = new Set([
  "source-write",
  "task-artifact-write",
  "original-checkout-write",
  "checkout",
  "commit",
  "push",
  "pull-request",
  "merge",
  "deploy",
  "remote-mutation",
]);
const PROVENANCE_ROLES = new Set(["workflow-source", "diagram-generator", "editable-diagram", "rendered-png"]);
const EVIDENCE_GRADES = new Set(["live-dirty-working-tree", "claude-read-recovery", "unavailable"]);
const FILE_STATES = new Set(["modified", "untracked", "missing", "recovered"]);
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ID = /^[a-z][a-z0-9-]*$/;
const EXPECTED_BASELINE = "849d17996f0eb193620bfc99f2d3e3ae51a167cb";
const EXPECTED_CAPTURE = {
  repositoryPath: "<local-checkout>/locus-pi",
  repositoryPathPolicy: "redacted-machine-local",
  head: "e3d7f138930a5d1e24883998f6f9b7a650225c24",
  branch: "codex/curated-review-workflow",
  workingTree: "dirty",
  capturedAt: "2026-07-18T02:15:40+03:00",
} as const;

type FrozenProvenance = {
  path: string;
  state: string;
  evidenceGrade: string;
  sha256: string | null;
  recovery?: {
    sessionId: string;
    toolUseId: string;
  };
};

const EXPECTED_PROVENANCE: Record<string, Record<string, FrozenProvenance>> = {
  review: {
    "workflow-source": {
      path: "extensions/workflows/examples/review.workflow.mjs",
      state: "modified",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "2474d3fdafd7072f4e1392a7fb7ddeeecdab237928161f3d0ec9037f81362087",
    },
    "diagram-generator": {
      path: "extensions/workflows/examples/review-pipeline.diagram.mjs",
      state: "modified",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "303daea59492a3a068841d6d61e7ce37e9e97b5fa9242b7807adf25b198f7964",
    },
    "editable-diagram": {
      path: "extensions/workflows/examples/review-pipeline.excalidraw",
      state: "modified",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "36cc77d420c160517099573f5d4c9811ba035b8dcb7d05dc7c711f1e2f42823f",
    },
    "rendered-png": {
      path: "extensions/workflows/examples/review-pipeline.png",
      state: "modified",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "d23af65fd45374e3cd75fa6a1b43acee9876aa954afefe5924517801904c44b6",
    },
  },
  "review-plan": {
    "workflow-source": {
      path: "extensions/workflows/examples/review-plan.workflow.mjs",
      state: "recovered",
      evidenceGrade: "claude-read-recovery",
      sha256: "baaa6f6bc2f71ac18d7dab794c2829c29029289d8206c749f7e25b3f967622cb",
      recovery: {
        sessionId: "01192827-e983-4293-be92-b3aeb3fe153b",
        toolUseId: "toolu_0124MJkveDz6ig19tgrBvrxC",
      },
    },
    "diagram-generator": {
      path: "extensions/workflows/examples/review-plan-pipeline.diagram.mjs",
      state: "recovered",
      evidenceGrade: "claude-read-recovery",
      sha256: "04c14b83061963213ec86a5b0f0253f750f83d6f952edc9b77ebda616164dab3",
      recovery: {
        sessionId: "01192827-e983-4293-be92-b3aeb3fe153b",
        toolUseId: "toolu_01BueAnCdLdhGWd68gdeL6KH",
      },
    },
    "editable-diagram": {
      path: "extensions/workflows/examples/review-plan-pipeline.excalidraw",
      state: "missing",
      evidenceGrade: "unavailable",
      sha256: null,
    },
    "rendered-png": {
      path: "extensions/workflows/examples/review-plan-pipeline.png",
      state: "missing",
      evidenceGrade: "unavailable",
      sha256: null,
    },
  },
  "review-fix": {
    "workflow-source": {
      path: "extensions/workflows/examples/review-fix.workflow.mjs",
      state: "untracked",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "53dcfda9e24f4d89cf563649eead04aea6dff419bc59495034312594304efd81",
    },
    "diagram-generator": {
      path: "extensions/workflows/examples/review-fix-pipeline.diagram.mjs",
      state: "untracked",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "6ba05c4a88c9d04dbbf1d907b0853aeae869c601f145ed722e1d58d7a6baa925",
    },
    "editable-diagram": {
      path: "extensions/workflows/examples/review-fix-pipeline.excalidraw",
      state: "untracked",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "23724409cff2a635214d8534eb50cdb6badd7aea409b1730e0b48334197f9037",
    },
    "rendered-png": {
      path: "extensions/workflows/examples/review-fix-pipeline.png",
      state: "untracked",
      evidenceGrade: "live-dirty-working-tree",
      sha256: "2c322bc289bf954a4e43da8f4515a92744d993f401cdc942fb7e76f911a50133",
    },
  },
};

const EXPECTED_FACT_STATEMENTS: Record<string, Record<string, string>> = {
  review: {
    "blocked-early-exit": "A blocked target stops before either review lane.",
    "two-parallel-review-lanes": "Changes and context review execute as one two-member parallel group.",
    "adjudicate-joins-both-lanes": "Adjudication depends on both parallel review results.",
    "pending-fix-plan-publication": "When findings exist, publication creates a fix plan with every disposition pending.",
    "workflow-routes-agent-decisions": "Agents produce judgment data; the trusted workflow only validates and routes it.",
    "no-direct-llm": "The workflow uses full agent sessions and no direct LLM call.",
  },
  "review-plan": {
    "immutable-review-input": "The review report is reopened and its exact SHA-256 must match task metadata.",
    "no-overwrite-existing-plan": "An existing fix plan blocks the workflow and is never overwritten.",
    "exact-finding-coverage": "Every review finding appears exactly once and no unknown finding is introduced.",
    "all-dispositions-pending": "Every published and validated disposition is pending.",
    "no-source-writes": "Only task metadata and the fix plan may be written; source remains read-only.",
    "no-direct-llm": "The workflow uses full agent sessions and no direct LLM call.",
  },
  "review-fix": {
    "accepted-only-writes": "Only findings explicitly accepted by the operator may change source.",
    "distinct-linked-worktree": "All source changes occur in a real linked worktree distinct from the original checkout.",
    "original-checkout-read-only": "The original checkout remains unchanged throughout implementation and verification.",
    "unchanged-head-no-commit": "No commit is created, so linked-worktree HEAD before and after is identical.",
    "independent-verification": "A separate full agent reopens artifacts and independently verifies the complete diff.",
    "unresolved-prevents-completion": "Any unresolved accepted finding prevents completed status.",
    "no-remote-mutation": "The workflow never commits, pushes, opens a pull request, merges, or deploys.",
    "no-direct-llm": "The workflow uses full agent sessions and no direct LLM call.",
  },
};

const EXPECTED_DECISION_ROLES: Record<
  string,
  Record<string, { producer: string; router: string }>
> = {
  review: {
    "target-status": { producer: "agent", router: "workflow" },
    "review-barrier": { producer: "workflow", router: "workflow" },
    "fix-plan-publication": { producer: "agent", router: "workflow" },
  },
  "review-plan": {
    "review-task-status": { producer: "agent", router: "workflow" },
    "existing-plan": { producer: "agent", router: "workflow" },
    "plan-validation": { producer: "agent", router: "workflow" },
  },
  "review-fix": {
    "approved-plan-status": { producer: "agent", router: "workflow" },
    "implementation-status": { producer: "agent", router: "workflow" },
    "completion-status": { producer: "workflow", router: "workflow" },
  },
};

function readJson(name: string): JsonObject {
  return asObject(JSON.parse(readFileSync(join(fixtureRoot, name), "utf8")), name);
}

function asObject(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonObject;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value;
}

function stringField(value: JsonObject, key: string, path = "$"): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }
  return field;
}

function stringArray(value: unknown, path: string): string[] {
  return asArray(value, path).map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      throw new Error(`${path}[${index}] must be a non-empty string`);
    }
    return item;
  });
}

function uniqueStringArray(value: unknown, path: string): string[] {
  const items = stringArray(value, path);
  if (new Set(items).size !== items.length) {
    throw new Error(`${path} must contain unique values`);
  }
  return items;
}

function exactKeys(value: JsonObject, required: string[], optional: string[] = [], path = "$"): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${path}.${key} is unknown`);
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      throw new Error(`${path}.${key} is required`);
    }
  }
}

function assertId(value: string, path: string): void {
  if (!ID.test(value)) {
    throw new Error(`${path} is not a stable id`);
  }
}

function uniqueObjects(items: unknown[], path: string): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  items.forEach((item, index) => {
    const object = asObject(item, `${path}[${index}]`);
    const id = stringField(object, "id", `${path}[${index}]`);
    assertId(id, `${path}[${index}].id`);
    if (result.has(id)) {
      throw new Error(`${path} contains duplicate id '${id}'`);
    }
    result.set(id, object);
  });
  return result;
}

function validateManifest(
  value: JsonObject,
  caseFixtures: Record<string, JsonObject>,
  files: string[],
): void {
  exactKeys(value, ["schema", "baseline", "capture", "crossCaseTransitions", "cases"]);
  if (value.schema !== "agent-workflow-corpus.v1") {
    throw new Error("$.schema is invalid");
  }

  const baseline = asObject(value.baseline, "$.baseline");
  exactKeys(baseline, ["repository", "commit"], [], "$.baseline");
  if (
    baseline.repository !== "excalidraw-js"
    || typeof baseline.commit !== "string"
    || baseline.commit !== EXPECTED_BASELINE
    || !GIT_COMMIT.test(baseline.commit)
  ) {
    throw new Error("$.baseline is invalid");
  }

  const capture = asObject(value.capture, "$.capture");
  exactKeys(
    capture,
    ["repositoryPath", "repositoryPathPolicy", "head", "branch", "workingTree", "capturedAt"],
    [],
    "$.capture",
  );
  if (
    capture.repositoryPath !== EXPECTED_CAPTURE.repositoryPath
    || capture.repositoryPathPolicy !== EXPECTED_CAPTURE.repositoryPathPolicy
    || typeof capture.head !== "string"
    || !GIT_COMMIT.test(capture.head)
    || capture.head !== EXPECTED_CAPTURE.head
    || capture.branch !== EXPECTED_CAPTURE.branch
    || capture.workingTree !== EXPECTED_CAPTURE.workingTree
    || capture.capturedAt !== EXPECTED_CAPTURE.capturedAt
  ) {
    throw new Error("$.capture is invalid");
  }

  if (asArray(value.crossCaseTransitions, "$.crossCaseTransitions").length !== 0) {
    throw new Error("$.crossCaseTransitions must stay empty");
  }

  const cases = uniqueObjects(asArray(value.cases, "$.cases"), "$.cases");
  if (cases.size !== 3) {
    throw new Error("$.cases must contain exactly three cases");
  }

  const manifestFiles: string[] = [];
  for (const [id, caseValue] of cases) {
    const path = `$.cases.${id}`;
    exactKeys(caseValue, ["id", "file", "requiredFactIds", "provenance"], [], path);
    const file = stringField(caseValue, "file", path);
    if (file !== `${id}.json`) {
      throw new Error(`${path}.file must match its case id`);
    }
    manifestFiles.push(file);

    const requiredFactIds = stringArray(caseValue.requiredFactIds, `${path}.requiredFactIds`);
    if (requiredFactIds.length === 0 || new Set(requiredFactIds).size !== requiredFactIds.length) {
      throw new Error(`${path}.requiredFactIds must be non-empty and unique`);
    }

    const provenance = asArray(caseValue.provenance, `${path}.provenance`);
    if (provenance.length !== PROVENANCE_ROLES.size) {
      throw new Error(`${path}.provenance must have exactly four records`);
    }
    const roles = new Set<string>();
    for (let index = 0; index < provenance.length; index += 1) {
      const record = asObject(provenance[index], `${path}.provenance[${index}]`);
      validateProvenance(record, `${path}.provenance[${index}]`, EXPECTED_CAPTURE.capturedAt);
      const role = stringField(record, "role", `${path}.provenance[${index}]`);
      if (roles.has(role)) {
        throw new Error(`${path}.provenance contains duplicate role '${role}'`);
      }
      roles.add(role);
      validateFrozenProvenance(id, role, record, `${path}.provenance[${index}]`);
    }
    if (roles.size !== PROVENANCE_ROLES.size || [...PROVENANCE_ROLES].some((role) => !roles.has(role))) {
      throw new Error(`${path}.provenance must cover all four source/render roles`);
    }

    const fixture = caseFixtures[id];
    if (!fixture) {
      throw new Error(`${path} has no loaded fixture`);
    }
    validateFixture(fixture, requiredFactIds);
    validateLoadBearingFacts(fixture);
  }

  if (new Set(manifestFiles).size !== manifestFiles.length) {
    throw new Error("$.cases contains duplicate files");
  }
  if (JSON.stringify([...manifestFiles].sort()) !== JSON.stringify([...files].sort())) {
    throw new Error("manifest/files are not a bijection");
  }
  if (Object.keys(caseFixtures).sort().join(",") !== [...cases.keys()].sort().join(",")) {
    throw new Error("manifest/loaded fixtures are not a bijection");
  }
}

function validateProvenance(value: JsonObject, path: string, expectedCapturedAt: string): void {
  exactKeys(
    value,
    ["role", "path", "state", "evidenceGrade", "sha256", "capturedAt"],
    ["recovery"],
    path,
  );
  const role = stringField(value, "role", path);
  const state = stringField(value, "state", path);
  const grade = stringField(value, "evidenceGrade", path);
  stringField(value, "path", path);
  const capturedAt = stringField(value, "capturedAt", path);
  if (!PROVENANCE_ROLES.has(role) || !FILE_STATES.has(state) || !EVIDENCE_GRADES.has(grade)) {
    throw new Error(`${path} has an invalid provenance enum`);
  }
  if (capturedAt !== expectedCapturedAt) {
    throw new Error(`${path}.capturedAt does not match the frozen capture`);
  }

  if (grade === "live-dirty-working-tree") {
    if (!["modified", "untracked"].includes(state) || typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) {
      throw new Error(`${path} is not valid live dirty-tree evidence`);
    }
    if ("recovery" in value) {
      throw new Error(`${path}.recovery is forbidden for live evidence`);
    }
  } else if (grade === "claude-read-recovery") {
    if (state !== "recovered" || typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) {
      throw new Error(`${path} is not valid recovered evidence`);
    }
    const recovery = asObject(value.recovery, `${path}.recovery`);
    exactKeys(recovery, ["sessionId", "toolUseId"], [], `${path}.recovery`);
    stringField(recovery, "sessionId", `${path}.recovery`);
    stringField(recovery, "toolUseId", `${path}.recovery`);
  } else if (state !== "missing" || value.sha256 !== null || "recovery" in value) {
    throw new Error(`${path} is not valid unavailable evidence`);
  }
}

function validateFrozenProvenance(
  caseId: string,
  role: string,
  value: JsonObject,
  path: string,
): void {
  const expected = EXPECTED_PROVENANCE[caseId]?.[role];
  if (!expected) {
    throw new Error(`${path} has no frozen provenance expectation`);
  }
  const recovery = "recovery" in value
    ? asObject(value.recovery, `${path}.recovery`)
    : undefined;
  if (
    value.path !== expected.path
    || value.state !== expected.state
    || value.evidenceGrade !== expected.evidenceGrade
    || value.sha256 !== expected.sha256
    || recovery?.sessionId !== expected.recovery?.sessionId
    || recovery?.toolUseId !== expected.recovery?.toolUseId
  ) {
    throw new Error(`${path} does not match frozen provenance`);
  }
}

function validateFixture(value: JsonObject, requiredFactIds: string[]): void {
  exactKeys(value, [
    "schema",
    "id",
    "title",
    "owners",
    "stages",
    "parallelGroups",
    "decisions",
    "artifacts",
    "humanGates",
    "writeBoundaries",
    "invariants",
  ]);
  if (value.schema !== "agent-workflow-fixture.v1") {
    throw new Error("$.schema is invalid");
  }
  const caseId = stringField(value, "id");
  assertId(caseId, "$.id");
  stringField(value, "title");

  const owners = uniqueObjects(asArray(value.owners, "$.owners"), "$.owners");
  if (owners.size === 0) {
    throw new Error("$.owners must not be empty");
  }
  for (const [id, owner] of owners) {
    exactKeys(owner, ["id", "label", "kind"], [], `$.owners.${id}`);
    stringField(owner, "label", `$.owners.${id}`);
    if (!OWNER_KINDS.has(stringField(owner, "kind", `$.owners.${id}`))) {
      throw new Error(`$.owners.${id}.kind is invalid`);
    }
  }

  const artifacts = uniqueObjects(asArray(value.artifacts, "$.artifacts"), "$.artifacts");
  const stages = uniqueObjects(asArray(value.stages, "$.stages"), "$.stages");
  const groups = uniqueObjects(asArray(value.parallelGroups, "$.parallelGroups"), "$.parallelGroups");
  if (artifacts.size === 0 || stages.size === 0) {
    throw new Error("$.artifacts and $.stages must not be empty");
  }

  for (const [id, stage] of stages) {
    exactKeys(
      stage,
      ["id", "owner", "mode", "dependsOn", "reads", "writes"],
      ["parallelGroup"],
      `$.stages.${id}`,
    );
    const owner = stringField(stage, "owner", `$.stages.${id}`);
    if (!owners.has(owner)) {
      throw new Error(`$.stages.${id}.owner is dangling`);
    }
    const mode = stringField(stage, "mode", `$.stages.${id}`);
    if (!STAGE_MODES.has(mode)) {
      throw new Error(`$.stages.${id}.mode is invalid`);
    }
    for (const dependency of uniqueStringArray(stage.dependsOn, `$.stages.${id}.dependsOn`)) {
      if (!stages.has(dependency) || dependency === id) {
        throw new Error(`$.stages.${id}.dependsOn is dangling or self-referential`);
      }
    }
    const reads = uniqueStringArray(stage.reads, `$.stages.${id}.reads`);
    const writes = uniqueStringArray(stage.writes, `$.stages.${id}.writes`);
    for (const artifact of [...reads, ...writes]) {
      if (!artifacts.has(artifact)) {
        throw new Error(`$.stages.${id} references missing artifact '${artifact}'`);
      }
    }
    if ((mode === "read-only" && writes.length > 0) || (mode !== "read-only" && writes.length === 0)) {
      throw new Error(`$.stages.${id}.mode disagrees with its writes`);
    }
    if ("parallelGroup" in stage) {
      const group = stringField(stage, "parallelGroup", `$.stages.${id}`);
      if (!groups.has(group)) {
        throw new Error(`$.stages.${id}.parallelGroup is dangling`);
      }
    }
  }
  assertAcyclicStages(stages);

  const groupMembership = new Set<string>();
  for (const [id, group] of groups) {
    exactKeys(group, ["id", "members", "join"], [], `$.parallelGroups.${id}`);
    const members = stringArray(group.members, `$.parallelGroups.${id}.members`);
    if (members.length < 2 || new Set(members).size !== members.length) {
      throw new Error(`$.parallelGroups.${id}.members must be unique and non-trivial`);
    }
    for (const member of members) {
      if (!stages.has(member) || groupMembership.has(member)) {
        throw new Error(`$.parallelGroups.${id} has dangling or repeated membership`);
      }
      groupMembership.add(member);
      if (stages.get(member)?.parallelGroup !== id) {
        throw new Error(`$.parallelGroups.${id} disagrees with stage membership`);
      }
    }
    const join = stringField(group, "join", `$.parallelGroups.${id}`);
    if (!stages.has(join)) {
      throw new Error(`$.parallelGroups.${id}.join is dangling`);
    }
    const joinDependencies = new Set(stringArray(stages.get(join)?.dependsOn, `$.stages.${join}.dependsOn`));
    if (members.some((member) => !joinDependencies.has(member))) {
      throw new Error(`$.parallelGroups.${id}.join must depend on every member`);
    }
  }
  for (const [id, stage] of stages) {
    if ("parallelGroup" in stage && !groupMembership.has(id)) {
      throw new Error(`$.stages.${id}.parallelGroup has no reciprocal membership`);
    }
  }

  const decisions = uniqueObjects(asArray(value.decisions, "$.decisions"), "$.decisions");
  if (decisions.size === 0) {
    throw new Error("$.decisions must not be empty");
  }
  for (const [id, decision] of decisions) {
    exactKeys(decision, ["id", "producer", "router", "at", "kind", "outcomes", "effect"], [], `$.decisions.${id}`);
    const producer = stringField(decision, "producer", `$.decisions.${id}`);
    const router = stringField(decision, "router", `$.decisions.${id}`);
    if (!owners.has(producer)) {
      throw new Error(`$.decisions.${id}.producer is dangling`);
    }
    if (!owners.has(router)) {
      throw new Error(`$.decisions.${id}.router is dangling`);
    }
    if (!["agent", "orchestrator"].includes(stringField(owners.get(producer)!, "kind"))) {
      throw new Error(`$.decisions.${id}.producer cannot produce workflow judgment`);
    }
    if (stringField(owners.get(router)!, "kind") !== "orchestrator") {
      throw new Error(`$.decisions.${id}.router must be an orchestrator`);
    }
    if (!stages.has(stringField(decision, "at", `$.decisions.${id}`))) {
      throw new Error(`$.decisions.${id}.at is dangling`);
    }
    if (!DECISION_KINDS.has(stringField(decision, "kind", `$.decisions.${id}`))) {
      throw new Error(`$.decisions.${id}.kind is invalid`);
    }
    if (uniqueStringArray(decision.outcomes, `$.decisions.${id}.outcomes`).length < 2) {
      throw new Error(`$.decisions.${id}.outcomes must contain at least two values`);
    }
    stringField(decision, "effect", `$.decisions.${id}`);
  }

  for (const [id, artifact] of artifacts) {
    exactKeys(artifact, ["id", "label", "kind", "mutability", "producer"], [], `$.artifacts.${id}`);
    stringField(artifact, "label", `$.artifacts.${id}`);
    if (!ARTIFACT_KINDS.has(stringField(artifact, "kind", `$.artifacts.${id}`))) {
      throw new Error(`$.artifacts.${id}.kind is invalid`);
    }
    if (!MUTABILITIES.has(stringField(artifact, "mutability", `$.artifacts.${id}`))) {
      throw new Error(`$.artifacts.${id}.mutability is invalid`);
    }
    const producer = stringField(artifact, "producer", `$.artifacts.${id}`);
    if (producer !== "external" && !stages.has(producer) && !owners.has(producer)) {
      throw new Error(`$.artifacts.${id}.producer is dangling`);
    }
    if (
      stages.has(producer)
      && !stringArray(stages.get(producer)?.writes, `$.stages.${producer}.writes`).includes(id)
    ) {
      throw new Error(`$.artifacts.${id}.producer does not write the artifact`);
    }
  }

  const gates = uniqueObjects(asArray(value.humanGates, "$.humanGates"), "$.humanGates");
  for (const [id, gate] of gates) {
    exactKeys(
      gate,
      ["id", "owner", "artifact", "states", "effect"],
      ["beforeStage", "afterStage", "initialState"],
      `$.humanGates.${id}`,
    );
    const owner = stringField(gate, "owner", `$.humanGates.${id}`);
    if (!owners.has(owner)) {
      throw new Error(`$.humanGates.${id}.owner is dangling`);
    }
    if (stringField(owners.get(owner)!, "kind") !== "human") {
      throw new Error(`$.humanGates.${id}.owner must be human`);
    }
    if (!artifacts.has(stringField(gate, "artifact", `$.humanGates.${id}`))) {
      throw new Error(`$.humanGates.${id}.artifact is dangling`);
    }
    const anchors = ["beforeStage", "afterStage"].filter((key) => key in gate);
    if (anchors.length !== 1) {
      throw new Error(`$.humanGates.${id} needs exactly one stage anchor`);
    }
    if (!stages.has(stringField(gate, anchors[0], `$.humanGates.${id}`))) {
      throw new Error(`$.humanGates.${id} stage anchor is dangling`);
    }
    const states = uniqueStringArray(gate.states, `$.humanGates.${id}.states`);
    if (states.length < 2 || states.some((state) => !HUMAN_STATES.has(state))) {
      throw new Error(`$.humanGates.${id}.states must contain at least two values`);
    }
    if (
      "initialState" in gate
      && !states.includes(stringField(gate, "initialState", `$.humanGates.${id}`))
    ) {
      throw new Error(`$.humanGates.${id}.initialState must be one of its states`);
    }
    stringField(gate, "effect", `$.humanGates.${id}`);
  }

  const boundaries = asArray(value.writeBoundaries, "$.writeBoundaries");
  const boundaryStages = new Set<string>();
  boundaries.forEach((item, index) => {
    const boundary = asObject(item, `$.writeBoundaries[${index}]`);
    exactKeys(boundary, ["stage", "allowedArtifacts", "forbidden"], [], `$.writeBoundaries[${index}]`);
    const stage = stringField(boundary, "stage", `$.writeBoundaries[${index}]`);
    if (!stages.has(stage) || boundaryStages.has(stage)) {
      throw new Error(`$.writeBoundaries[${index}].stage is dangling or duplicate`);
    }
    boundaryStages.add(stage);
    const allowedArtifacts = uniqueStringArray(
      boundary.allowedArtifacts,
      `$.writeBoundaries[${index}].allowedArtifacts`,
    );
    for (const artifact of allowedArtifacts) {
      if (!artifacts.has(artifact)) {
        throw new Error(`$.writeBoundaries[${index}] references missing artifact`);
      }
    }
    const stageWrites = stringArray(stages.get(stage)?.writes, `$.stages.${stage}.writes`);
    if (sortedValues(allowedArtifacts) !== sortedValues(stageWrites)) {
      throw new Error(`$.writeBoundaries[${index}] disagrees with stage writes`);
    }
    const forbidden = uniqueStringArray(boundary.forbidden, `$.writeBoundaries[${index}].forbidden`);
    if (forbidden.some((action) => !FORBIDDEN_ACTIONS.has(action))) {
      throw new Error(`$.writeBoundaries[${index}].forbidden contains an invalid action`);
    }
  });
  if (boundaryStages.size !== stages.size) {
    throw new Error("$.writeBoundaries must cover every stage exactly once");
  }

  const invariants = uniqueObjects(asArray(value.invariants, "$.invariants"), "$.invariants");
  for (const [id, invariant] of invariants) {
    exactKeys(invariant, ["id", "statement"], [], `$.invariants.${id}`);
    stringField(invariant, "statement", `$.invariants.${id}`);
  }
  if (
    [...invariants.keys()].sort().join(",")
    !== [...requiredFactIds].sort().join(",")
  ) {
    throw new Error(`fixture '${caseId}' does not match its complete required fact-id set`);
  }
  const expectedStatements = EXPECTED_FACT_STATEMENTS[caseId];
  if (!expectedStatements) {
    throw new Error(`fixture '${caseId}' has no frozen fact statements`);
  }
  if (sortedValues(invariants.keys()) !== sortedValues(Object.keys(expectedStatements))) {
    throw new Error(`fixture '${caseId}' changed its frozen fact-id set`);
  }
  for (const [id, statement] of Object.entries(expectedStatements)) {
    if (invariants.get(id)?.statement !== statement) {
      throw new Error(`fixture '${caseId}' changed required fact '${id}'`);
    }
  }
}

function assertAcyclicStages(stages: Map<string, JsonObject>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new Error(`$.stages contains a dependency cycle at '${id}'`);
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    for (const dependency of stringArray(stages.get(id)?.dependsOn, `$.stages.${id}.dependsOn`)) {
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of stages.keys()) {
    visit(id);
  }
}

function sortedValues(values: Iterable<string>): string {
  return [...values].sort().join(",");
}

function validateLoadBearingFacts(value: JsonObject): void {
  const id = stringField(value, "id");
  const owners = new Map(
    asArray(value.owners, "$.owners").map((owner) => {
      const object = asObject(owner, "$.owners[]");
      return [stringField(object, "id"), object];
    }),
  );
  const stages = new Map(
    asArray(value.stages, "$.stages").map((stage) => {
      const object = asObject(stage, "$.stages[]");
      return [stringField(object, "id"), object];
    }),
  );
  const groups = new Map(
    asArray(value.parallelGroups, "$.parallelGroups").map((group) => {
      const object = asObject(group, "$.parallelGroups[]");
      return [stringField(object, "id"), object];
    }),
  );
  const decisions = new Map(
    asArray(value.decisions, "$.decisions").map((decision) => {
      const object = asObject(decision, "$.decisions[]");
      return [stringField(object, "id"), object];
    }),
  );
  const artifacts = new Map(
    asArray(value.artifacts, "$.artifacts").map((artifact) => {
      const object = asObject(artifact, "$.artifacts[]");
      return [stringField(object, "id"), object];
    }),
  );
  const gates = new Map(
    asArray(value.humanGates, "$.humanGates").map((gate) => {
      const object = asObject(gate, "$.humanGates[]");
      return [stringField(object, "id"), object];
    }),
  );
  const boundaries = new Map(
    asArray(value.writeBoundaries, "$.writeBoundaries").map((boundary) => {
      const object = asObject(boundary, "$.writeBoundaries[]");
      return [stringField(object, "stage"), object];
    }),
  );
  validateDecisionRoles(id, decisions);
  const fullAgentSessionsOnly = (
    owners.get("agent")?.kind === "agent"
    && owners.get("agent")?.label === "Full agent sessions"
    && [...owners.values()].every((owner) => {
      const identity = `${String(owner.id)} ${String(owner.label)}`.toLowerCase();
      return !identity.includes("llm");
    })
    && [...stages.values()].every((stage) => stage.owner === "agent")
  );

  if (id === "review") {
    const group = groups.get("review-lanes");
    const targetStatus = decisions.get("target-status");
    const publication = decisions.get("fix-plan-publication");
    const dispositionGate = gates.get("finding-dispositions");
    assertLoadBearingFacts(id, {
      "blocked-early-exit": (
        decisionMatches(targetStatus, {
          producer: "agent",
          router: "workflow",
          at: "resolve-target",
          kind: "early-exit",
          outcomes: ["ready", "blocked"],
          effectIncludes: "blocked stops before both review lanes",
        })
        && hasValues(stages.get("review-changes")?.dependsOn, ["resolve-target"])
        && hasValues(stages.get("review-context")?.dependsOn, ["resolve-target"])
      ),
      "two-parallel-review-lanes": (
        exactValues(group?.members, ["review-changes", "review-context"])
        && stages.get("review-changes")?.parallelGroup === "review-lanes"
        && stages.get("review-context")?.parallelGroup === "review-lanes"
      ),
      "adjudicate-joins-both-lanes": (
        group?.join === "adjudicate"
        && exactValues(
          stages.get("adjudicate")?.dependsOn,
          ["review-changes", "review-context"],
        )
      ),
      "pending-fix-plan-publication": (
        decisionMatches(publication, {
          producer: "agent",
          router: "workflow",
          at: "publish-report",
          kind: "artifact-publication",
          outcomes: ["findings", "no-findings"],
          effectIncludes: "all pending",
        })
        && hasValues(stages.get("publish-report")?.writes, ["fix-plan"])
        && artifacts.get("fix-plan")?.kind === "approval-plan"
        && artifacts.get("fix-plan")?.mutability === "human-editable"
        && dispositionGate?.afterStage === "publish-report"
        && dispositionGate?.initialState === "pending"
      ),
      "workflow-routes-agent-decisions": (
        targetStatus?.producer === "agent"
        && publication?.producer === "agent"
        && [...decisions.values()].every((decision) => decision.router === "workflow")
      ),
      "no-direct-llm": fullAgentSessionsOnly,
    });
  } else if (id === "review-plan") {
    const existingPlan = decisions.get("existing-plan");
    const planValidation = decisions.get("plan-validation");
    const dispositionGate = gates.get("finding-dispositions");
    const declaredWrites = [...stages.values()].flatMap((stage) =>
      stringArray(stage.writes, `$.stages.${String(stage.id)}.writes`)
    );
    assertLoadBearingFacts(id, {
      "immutable-review-input": (
        artifacts.get("review-report")?.mutability === "immutable"
        && hasValues(stages.get("resolve-review-task")?.reads, ["review-task", "review-report"])
        && hasValues(stages.get("validate-fix-plan")?.reads, ["review-task", "review-report"])
      ),
      "no-overwrite-existing-plan": decisionMatches(existingPlan, {
        producer: "agent",
        router: "workflow",
        at: "write-fix-plan",
        kind: "routing",
        outcomes: ["absent", "already-exists"],
        effectIncludes: "never overwritten",
      }),
      "exact-finding-coverage": (
        decisionMatches(planValidation, {
          producer: "agent",
          router: "workflow",
          at: "validate-fix-plan",
          kind: "completion",
          outcomes: ["completed", "blocked"],
          effectIncludes: "exact finding coverage",
        })
        && hasValues(
          stages.get("validate-fix-plan")?.reads,
          ["review-report", "fix-plan"],
        )
      ),
      "all-dispositions-pending": (
        String(planValidation?.effect).includes("pending dispositions")
        && artifacts.get("fix-plan")?.mutability === "human-editable"
        && dispositionGate?.afterStage === "validate-fix-plan"
        && dispositionGate?.initialState === "pending"
      ),
      "no-source-writes": (
        [...stages.values()].every((stage) => stage.mode !== "isolated-source-write")
        && declaredWrites.every((artifact) => ["review-task", "fix-plan"].includes(artifact))
        && [...boundaries.values()].every((boundary) =>
          hasValues(boundary.forbidden, ["source-write"])
        )
      ),
      "no-direct-llm": fullAgentSessionsOnly,
    });
  } else if (id === "review-fix") {
    const applyStage = stages.get("apply-accepted-findings");
    const verifyStage = stages.get("verify-and-report");
    const acceptedGate = gates.get("accepted-findings");
    const completion = decisions.get("completion-status");
    const applyBoundary = asArray(value.writeBoundaries, "$.writeBoundaries")
      .map((item) => asObject(item, "$.writeBoundaries[]"))
      .find((item) => item.stage === "apply-accepted-findings");
    const remoteActions = [
      "commit",
      "push",
      "pull-request",
      "merge",
      "deploy",
      "remote-mutation",
    ];
    assertLoadBearingFacts(id, {
      "accepted-only-writes": (
        acceptedGate?.beforeStage === "resolve-approved-plan"
        && acceptedGate?.initialState === "pending"
        && String(acceptedGate?.effect).includes("only explicit accepted ids")
        && hasValues(applyStage?.reads, ["fix-plan"])
      ),
      "distinct-linked-worktree": (
        applyStage?.mode === "isolated-source-write"
        && exactValues(applyStage?.writes, ["linked-worktree"])
        && artifacts.get("linked-worktree")?.kind === "isolated-source-diff"
        && artifacts.get("linked-worktree")?.producer === "apply-accepted-findings"
      ),
      "original-checkout-read-only": (
        hasValues(applyBoundary?.forbidden, ["original-checkout-write"])
        && [...stages.entries()]
          .filter(([stageId]) => stageId !== "apply-accepted-findings")
          .every(([, stage]) => stage.mode === "read-only" || stage.mode === "task-artifact-write")
      ),
      "unchanged-head-no-commit": (
        artifacts.get("linked-worktree")?.mutability === "uncommitted"
        && [...boundaries.values()].every((boundary) =>
          hasValues(boundary.forbidden, ["commit"])
        )
      ),
      "independent-verification": (
        verifyStage?.owner === "agent"
        && exactValues(verifyStage?.dependsOn, ["apply-accepted-findings"])
        && hasValues(
          verifyStage?.reads,
          ["review-task", "review-report", "fix-plan", "linked-worktree"],
        )
        && hasValues(verifyStage?.writes, ["fix-report"])
        && artifacts.get("fix-report")?.kind === "verification-report"
        && artifacts.get("fix-report")?.producer === "verify-and-report"
      ),
      "unresolved-prevents-completion": decisionMatches(completion, {
        producer: "workflow",
        router: "workflow",
        at: "verify-and-report",
        kind: "completion",
        outcomes: ["completed", "partial", "blocked"],
        effectIncludes: "no unresolved ids",
      }),
      "no-remote-mutation": [...boundaries.values()].every((boundary) =>
        hasValues(boundary.forbidden, remoteActions)
      ),
      "no-direct-llm": fullAgentSessionsOnly,
    });
  } else {
    throw new Error(`unknown case '${id}'`);
  }
}

function validateDecisionRoles(
  caseId: string,
  decisions: Map<string, JsonObject>,
): void {
  const expected = EXPECTED_DECISION_ROLES[caseId];
  if (!expected || sortedValues(decisions.keys()) !== sortedValues(Object.keys(expected))) {
    throw new Error(`fixture '${caseId}' changed its frozen decision set`);
  }
  for (const [decisionId, roles] of Object.entries(expected)) {
    const decision = decisions.get(decisionId);
    if (
      decision?.producer !== roles.producer
      || decision.router !== roles.router
    ) {
      throw new Error(`fixture '${caseId}' changed roles for decision '${decisionId}'`);
    }
  }
}

function assertLoadBearingFacts(caseId: string, facts: Record<string, boolean>): void {
  const expectedIds = Object.keys(EXPECTED_FACT_STATEMENTS[caseId] ?? {});
  if (sortedValues(Object.keys(facts)) !== sortedValues(expectedIds)) {
    throw new Error(`fixture '${caseId}' has incomplete structural fact checks`);
  }
  for (const [factId, preserved] of Object.entries(facts)) {
    if (!preserved) {
      throw new Error(`fixture '${caseId}' lost load-bearing fact '${factId}'`);
    }
  }
}

function decisionMatches(
  value: JsonObject | undefined,
  expected: {
    producer: string;
    router: string;
    at: string;
    kind: string;
    outcomes: string[];
    effectIncludes: string;
  },
): boolean {
  return (
    value?.producer === expected.producer
    && value.router === expected.router
    && value.at === expected.at
    && value.kind === expected.kind
    && exactValues(value.outcomes, expected.outcomes)
    && String(value.effect).includes(expected.effectIncludes)
  );
}

function hasValues(actual: unknown, expected: string[]): boolean {
  const values = new Set(Array.isArray(actual) ? actual : []);
  return expected.every((value) => values.has(value));
}

function exactValues(actual: unknown, expected: string[]): boolean {
  return (
    Array.isArray(actual)
    && actual.every((value) => typeof value === "string")
    && sortedValues(actual) === sortedValues(expected)
  );
}

function requireValues(actual: unknown, expected: string[], label: string): void {
  stringArray(actual, label);
  if (!hasValues(actual, expected)) {
    throw new Error(`${label} is missing`);
  }
}

function cloneCorpus(): {
  manifest: JsonObject;
  fixtures: Record<string, JsonObject>;
  files: string[];
} {
  return {
    manifest: structuredClone(manifest),
    fixtures: structuredClone(fixtures),
    files: [...fixtureFiles],
  };
}

function productionSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return productionSourceFiles(path);
    }
    return entry.isFile() && /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [path] : [];
  });
}

describe("agent-workflow acceptance corpus", () => {
  it("is self-contained, schema-strict, and bijective", () => {
    expect(() => validateManifest(manifest, fixtures, fixtureFiles)).not.toThrow();
    expect(Object.keys(fixtures).sort()).toEqual(["review", "review-fix", "review-plan"]);
  });

  it("preserves every declared load-bearing semantic fact", () => {
    for (const fixture of Object.values(fixtures)) {
      expect(() => validateLoadBearingFacts(fixture)).not.toThrow();
    }
  });

  it("keeps the test-only corpus out of production runtime code", () => {
    const sourceRoot = join(fixtureRoot, "..", "..", "..", "..", "src");
    const importers = productionSourceFiles(sourceRoot)
      .filter((path) => readFileSync(path, "utf8").includes("agent-workflows"));
    expect(importers).toEqual([]);
  });

  it.each([
    ["unknown field", (corpus: ReturnType<typeof cloneCorpus>) => {
      corpus.fixtures.review.invented = true;
    }],
    ["duplicate stage", (corpus: ReturnType<typeof cloneCorpus>) => {
      const stages = asArray(corpus.fixtures.review.stages, "stages");
      stages.push(structuredClone(stages[0]));
    }],
    ["dangling dependency", (corpus: ReturnType<typeof cloneCorpus>) => {
      const stage = asObject(asArray(corpus.fixtures.review.stages, "stages")[1], "stage");
      stage.dependsOn = ["missing-stage"];
    }],
    ["wrong owner", (corpus: ReturnType<typeof cloneCorpus>) => {
      const stage = asObject(asArray(corpus.fixtures.review.stages, "stages")[0], "stage");
      stage.owner = "missing-owner";
    }],
    ["producer/router swap", (corpus: ReturnType<typeof cloneCorpus>) => {
      const decision = asObject(asArray(corpus.fixtures.review.decisions, "decisions")[0], "decision");
      [decision.producer, decision.router] = [decision.router, decision.producer];
    }],
    ["omitted decision producer", (corpus: ReturnType<typeof cloneCorpus>) => {
      const decisions = asArray(corpus.fixtures.review.decisions, "decisions")
        .map((decision) => asObject(decision, "decision"));
      const barrier = decisions.find((decision) => decision.id === "review-barrier");
      if (barrier) {
        barrier.producer = "agent";
      }
    }],
    ["read-only stage write", (corpus: ReturnType<typeof cloneCorpus>) => {
      const stage = asObject(asArray(corpus.fixtures.review.stages, "stages")[0], "stage");
      stage.writes = ["review-task"];
    }],
    ["write-boundary mismatch", (corpus: ReturnType<typeof cloneCorpus>) => {
      const boundary = asObject(
        asArray(corpus.fixtures.review.writeBoundaries, "boundaries")[4],
        "boundary",
      );
      boundary.allowedArtifacts = ["review-task", "review-report"];
    }],
    ["artifact producer mismatch", (corpus: ReturnType<typeof cloneCorpus>) => {
      const artifacts = asArray(corpus.fixtures["review-plan"].artifacts, "artifacts")
        .map((artifact) => asObject(artifact, "artifact"));
      const fixPlan = artifacts.find((artifact) => artifact.id === "fix-plan");
      if (fixPlan) {
        fixPlan.producer = "validate-fix-plan";
      }
    }],
    ["dependency cycle", (corpus: ReturnType<typeof cloneCorpus>) => {
      const stage = asObject(asArray(corpus.fixtures.review.stages, "stages")[0], "stage");
      stage.dependsOn = ["adjudicate"];
    }],
    ["non-human gate owner", (corpus: ReturnType<typeof cloneCorpus>) => {
      const gate = asObject(asArray(corpus.fixtures.review.humanGates, "gates")[0], "gate");
      gate.owner = "agent";
    }],
    ["invalid gate initial state", (corpus: ReturnType<typeof cloneCorpus>) => {
      const gate = asObject(asArray(corpus.fixtures.review.humanGates, "gates")[0], "gate");
      gate.initialState = "completed";
    }],
    ["dangling artifact", (corpus: ReturnType<typeof cloneCorpus>) => {
      const stage = asObject(asArray(corpus.fixtures["review-fix"].stages, "stages")[1], "stage");
      stage.writes = ["missing-artifact"];
    }],
    ["dangling parallel member", (corpus: ReturnType<typeof cloneCorpus>) => {
      const group = asObject(asArray(corpus.fixtures.review.parallelGroups, "groups")[0], "group");
      group.members = ["review-changes", "missing-stage"];
    }],
    ["invalid provenance", (corpus: ReturnType<typeof cloneCorpus>) => {
      const cases = asArray(corpus.manifest.cases, "cases");
      const provenance = asArray(asObject(cases[0], "case").provenance, "provenance");
      asObject(provenance[0], "provenance").evidenceGrade = "committed";
    }],
    ["duplicate provenance role", (corpus: ReturnType<typeof cloneCorpus>) => {
      const cases = asArray(corpus.manifest.cases, "cases");
      const provenance = asArray(asObject(cases[0], "case").provenance, "provenance");
      asObject(provenance[1], "provenance").role = "workflow-source";
    }],
    ["changed frozen source hash", (corpus: ReturnType<typeof cloneCorpus>) => {
      const cases = asArray(corpus.manifest.cases, "cases");
      const provenance = asArray(asObject(cases[0], "case").provenance, "provenance");
      asObject(provenance[0], "provenance").sha256 = "0".repeat(64);
    }],
    ["missing repository path policy", (corpus: ReturnType<typeof cloneCorpus>) => {
      const capture = asObject(corpus.manifest.capture, "capture");
      delete capture.repositoryPathPolicy;
    }],
    ["changed repository path policy", (corpus: ReturnType<typeof cloneCorpus>) => {
      const capture = asObject(corpus.manifest.capture, "capture");
      capture.repositoryPathPolicy = "machine-local";
    }],
    ["cross-case execution edge", (corpus: ReturnType<typeof cloneCorpus>) => {
      corpus.manifest.crossCaseTransitions = [{ from: "review", to: "review-plan" }];
    }],
    ["missing fixture file", (corpus: ReturnType<typeof cloneCorpus>) => {
      corpus.files = corpus.files.filter((name) => name !== "review-plan.json");
    }],
    ["orphan fixture file", (corpus: ReturnType<typeof cloneCorpus>) => {
      corpus.files.push("orphan.json");
    }],
    ["missing required fact", (corpus: ReturnType<typeof cloneCorpus>) => {
      const invariants = asArray(corpus.fixtures["review-plan"].invariants, "invariants");
      invariants.pop();
    }],
    ["changed required fact", (corpus: ReturnType<typeof cloneCorpus>) => {
      const invariants = asArray(corpus.fixtures.review.invariants, "invariants").map((item) => asObject(item, "invariant"));
      const blocked = invariants.find((item) => item.id === "blocked-early-exit");
      if (blocked) {
        blocked.statement = "Blocked may continue.";
      }
    }],
    ["wrong join dependencies", (corpus: ReturnType<typeof cloneCorpus>) => {
      const stages = asArray(corpus.fixtures.review.stages, "stages").map((stage) => asObject(stage, "stage"));
      const adjudicate = stages.find((stage) => stage.id === "adjudicate");
      if (adjudicate) {
        adjudicate.dependsOn = ["review-changes"];
      }
    }],
    ["missing accepted-only gate", (corpus: ReturnType<typeof cloneCorpus>) => {
      const gates = asArray(corpus.fixtures["review-fix"].humanGates, "gates").map((gate) => asObject(gate, "gate"));
      const accepted = gates.find((gate) => gate.id === "accepted-findings");
      if (accepted) {
        accepted.beforeStage = "apply-accepted-findings";
      }
    }],
  ])("fails closed for %s", (_label, mutate) => {
    const corpus = cloneCorpus();
    mutate(corpus);
    expect(() => validateManifest(corpus.manifest, corpus.fixtures, corpus.files)).toThrow();
  });
});
