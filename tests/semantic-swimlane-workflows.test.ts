import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiagramSpec,
  validateDiagramSpec,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

type ActivityType = "step" | "decision" | "artifact";
type CaseId = "review" | "review-plan" | "review-fix";

interface SwimlaneSpec {
  template: "flow.swimlane";
  title: string;
  lanes: Array<{
    id: string;
    label: string;
  }>;
  activities: Array<{
    id: string;
    lane: string;
    type: ActivityType;
    title: string;
  }>;
  transitions: Array<{
    id: string;
    from: string;
    to: string;
    label?: string;
  }>;
}

interface CorpusFixture {
  id: CaseId;
  stages: Array<{
    id: string;
    reads: string[];
    writes: string[];
  }>;
  humanGates: Array<{
    id: string;
  }>;
  writeBoundaries: Array<{
    stage: string;
    allowedArtifacts: string[];
    forbidden: string[];
  }>;
}

interface CorpusManifest {
  cases: Array<{
    id: CaseId;
    file: string;
    requiredFactIds: string[];
  }>;
}

type FactAssertion = (spec: SwimlaneSpec) => void;

const testRoot = dirname(fileURLToPath(import.meta.url));
const swimlaneRoot = join(testRoot, "fixtures", "semantic-swimlane", "v1");
const corpusRoot = join(testRoot, "fixtures", "agent-workflows", "v1");
const caseIds: CaseId[] = ["review", "review-plan", "review-fix"];

const specs = Object.fromEntries(
  caseIds.map((caseId) => [
    caseId,
    readJson<SwimlaneSpec>(join(swimlaneRoot, `${caseId}.json`)),
  ]),
) as Record<CaseId, SwimlaneSpec>;

const manifest = readJson<CorpusManifest>(join(corpusRoot, "manifest.json"));
const fixtures = Object.fromEntries(
  manifest.cases.map((entry) => [
    entry.id,
    readJson<CorpusFixture>(join(corpusRoot, entry.file)),
  ]),
) as Record<CaseId, CorpusFixture>;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertExactValues(
  actual: Iterable<string>,
  expected: Iterable<string>,
  message: string,
): void {
  const actualValues = sorted(actual);
  const expectedValues = sorted(expected);
  invariant(
    JSON.stringify(actualValues) === JSON.stringify(expectedValues),
    `${message}: expected ${JSON.stringify(expectedValues)}, got ${JSON.stringify(actualValues)}`,
  );
}

function activity(spec: SwimlaneSpec, id: string): SwimlaneSpec["activities"][number] {
  const matches = spec.activities.filter((candidate) => candidate.id === id);
  invariant(matches.length === 1, `expected exactly one activity ${id}`);
  return matches[0];
}

function requireActivity(
  spec: SwimlaneSpec,
  id: string,
  lane: string,
  type: ActivityType,
): SwimlaneSpec["activities"][number] {
  const candidate = activity(spec, id);
  invariant(candidate.lane === lane, `${id} must be in ${lane}, got ${candidate.lane}`);
  invariant(candidate.type === type, `${id} must be ${type}, got ${candidate.type}`);
  return candidate;
}

function outgoing(
  spec: SwimlaneSpec,
  id: string,
): SwimlaneSpec["transitions"] {
  return spec.transitions.filter((transition) => transition.from === id);
}

function incoming(
  spec: SwimlaneSpec,
  id: string,
): SwimlaneSpec["transitions"] {
  return spec.transitions.filter((transition) => transition.to === id);
}

function requireTransition(
  spec: SwimlaneSpec,
  from: string,
  to: string,
  label?: string,
): SwimlaneSpec["transitions"][number] {
  const matches = spec.transitions.filter(
    (transition) => transition.from === from && transition.to === to,
  );
  invariant(matches.length === 1, `expected exactly one transition ${from} -> ${to}`);
  if (label !== undefined) {
    invariant(
      matches[0].label === label,
      `${from} -> ${to} must be labelled ${JSON.stringify(label)}, got ${JSON.stringify(matches[0].label)}`,
    );
  }
  return matches[0];
}

function hasPath(
  spec: SwimlaneSpec,
  from: string,
  to: string,
  skippedActivity?: string,
): boolean {
  if (from === skippedActivity || to === skippedActivity) {
    return false;
  }
  const seen = new Set<string>([from]);
  const pending = [from];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const transition of outgoing(spec, current)) {
      if (transition.to === skippedActivity) {
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

function derivedDepths(spec: SwimlaneSpec): Map<string, number> {
  const activityIds = new Set(spec.activities.map((candidate) => candidate.id));
  const indegree = new Map(spec.activities.map((candidate) => [candidate.id, 0]));
  const depths = new Map(spec.activities.map((candidate) => [candidate.id, 0]));
  for (const transition of spec.transitions) {
    invariant(
      activityIds.has(transition.from) && activityIds.has(transition.to),
      `dangling transition ${transition.id}`,
    );
    indegree.set(transition.to, (indegree.get(transition.to) ?? 0) + 1);
  }

  const pending = spec.activities
    .filter((candidate) => indegree.get(candidate.id) === 0)
    .map((candidate) => candidate.id);
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.shift()!;
    visited += 1;
    for (const transition of outgoing(spec, current)) {
      depths.set(
        transition.to,
        Math.max(
          depths.get(transition.to) ?? 0,
          (depths.get(current) ?? 0) + 1,
        ),
      );
      const remaining = (indegree.get(transition.to) ?? 0) - 1;
      indegree.set(transition.to, remaining);
      if (remaining === 0) {
        pending.push(transition.to);
      }
    }
  }
  invariant(visited === spec.activities.length, "fixture flow must be acyclic");
  return depths;
}

function assertTerminal(spec: SwimlaneSpec, id: string): void {
  invariant(outgoing(spec, id).length === 0, `${id} must be terminal`);
}

function assertArtifactTargets(
  spec: SwimlaneSpec,
  stage: string,
  expected: string[],
): void {
  const targets = outgoing(spec, stage)
    .filter((transition) => activity(spec, transition.to).type === "artifact")
    .map((transition) => transition.to);
  assertExactValues(targets, expected, `${stage} artifact targets`);
}

function assertNoDirectLlm(spec: SwimlaneSpec): void {
  const agentLane = spec.lanes.filter((lane) => lane.id === "agents");
  invariant(agentLane.length === 1, "agents lane must exist exactly once");
  invariant(
    agentLane[0].label === "Full agent sessions (no direct LLM)",
    "agents lane must explicitly exclude direct LLM calls",
  );
  for (const candidate of spec.activities) {
    invariant(
      !/direct[- ]llm|\bllm\s*\(/iu.test(`${candidate.id} ${candidate.title}`),
      `${candidate.id} represents a direct LLM call`,
    );
    if (candidate.title.startsWith("Agent:")) {
      invariant(candidate.lane === "agents", `${candidate.id} agent work is outside agents lane`);
    }
    if (candidate.lane === "agents") {
      invariant(candidate.title.startsWith("Agent:"), `${candidate.id} lacks explicit Agent ownership`);
    }
  }
}

function forbiddenIdPattern(action: string): RegExp {
  switch (action) {
    case "source-write":
      return /(?:^|-)source-write(?:-|$)|(?:^|-)write-source(?:-|$)/u;
    case "task-artifact-write":
      return /(?:^|-)task-artifact-write(?:-|$)/u;
    case "original-checkout-write":
      return /(?:^|-)original-checkout(?:-|$)/u;
    case "checkout":
      return /(?:^|-)checkout(?:-|$)/u;
    case "commit":
      return /(?:^|-)commit(?:-|$)/u;
    case "push":
      return /(?:^|-)push(?:-|$)/u;
    case "pull-request":
      return /(?:^|-)pull-request(?:-|$)|(?:^|-)open-pr(?:-|$)/u;
    case "merge":
      return /(?:^|-)merge(?:-|$)/u;
    case "deploy":
      return /(?:^|-)deploy(?:-|$)/u;
    case "remote-mutation":
      return /(?:^|-)remote-mutation(?:-|$)/u;
    default:
      return new RegExp(`(?:^|-)${action.replaceAll("-", "\\-")}(?:-|$)`, "u");
  }
}

function assertForbiddenAbsent(spec: SwimlaneSpec, actions: string[]): void {
  for (const action of actions) {
    const pattern = forbiddenIdPattern(action);
    const offender = spec.activities.find((candidate) => {
      const normalizedId = candidate.id
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, "-");
      const normalizedTitle = candidate.title
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/gu, "-");
      return pattern.test(normalizedId)
        || (
          candidate.title.startsWith("Agent:")
          && pattern.test(normalizedTitle)
        );
    });
    invariant(!offender, `${offender?.id ?? "activity"} represents forbidden ${action}`);
  }
}

function assertBlockedEarlyExit(spec: SwimlaneSpec): void {
  requireActivity(spec, "target-status", "workflow", "decision");
  requireActivity(spec, "target-blocked", "workflow", "step");
  requireTransition(spec, "target-status", "target-blocked", "blocked");
  assertTerminal(spec, "target-blocked");
  invariant(
    !hasPath(spec, "target-blocked", "review-changes")
      && !hasPath(spec, "target-blocked", "review-context"),
    "blocked target must not reach either review lane",
  );
}

function assertParallelReviewLanes(spec: SwimlaneSpec): void {
  requireActivity(spec, "review-changes", "agents", "step");
  requireActivity(spec, "review-context", "agents", "step");
  requireTransition(spec, "target-status", "review-changes", "ready");
  requireTransition(spec, "target-status", "review-context", "ready");
  assertExactValues(
    incoming(spec, "review-changes").map((transition) => transition.from),
    ["target-status"],
    "review-changes predecessors",
  );
  assertExactValues(
    incoming(spec, "review-context").map((transition) => transition.from),
    ["target-status"],
    "review-context predecessors",
  );
  const depths = derivedDepths(spec);
  invariant(
    depths.get("review-changes") === depths.get("review-context"),
    "parallel review activities must share one derived depth",
  );
}

function assertAdjudicationJoin(spec: SwimlaneSpec): void {
  requireActivity(spec, "adjudicate", "agents", "decision");
  requireTransition(spec, "review-changes", "adjudicate", "both required");
  requireTransition(spec, "review-context", "adjudicate", "both required");
  assertExactValues(
    incoming(spec, "adjudicate").map((transition) => transition.from),
    ["review-changes", "review-context"],
    "adjudicate join inputs",
  );
  const depths = derivedDepths(spec);
  invariant(
    depths.get("adjudicate")
      === Math.max(
        depths.get("review-changes") ?? -1,
        depths.get("review-context") ?? -1,
      ) + 1,
    "adjudicate must follow both review lanes",
  );
}

function assertPendingFixPlanPublication(spec: SwimlaneSpec): void {
  requireActivity(spec, "publish-report", "agents", "decision");
  requireActivity(spec, "fix-plan", "operator", "artifact");
  requireActivity(spec, "no-fix-plan", "workflow", "step");
  requireTransition(
    spec,
    "publish-report",
    "fix-plan",
    "findings; all dispositions pending",
  );
  requireTransition(spec, "publish-report", "no-fix-plan", "no findings");
  assertExactValues(
    outgoing(spec, "publish-report")
      .filter((transition) => transition.label === "no findings")
      .map((transition) => transition.to),
    ["no-fix-plan"],
    "no-findings branch",
  );
  assertTerminal(spec, "no-fix-plan");
  invariant(
    !hasPath(spec, "no-fix-plan", "fix-plan"),
    "no-findings branch must not reach fix-plan",
  );
}

function assertWorkflowRoutesAgentDecision(spec: SwimlaneSpec): void {
  requireActivity(spec, "resolve-target", "agents", "step");
  requireActivity(spec, "target-status", "workflow", "decision");
  requireTransition(spec, "resolve-target", "target-status");
}

function assertImmutableReviewInput(spec: SwimlaneSpec): void {
  requireActivity(spec, "review-report", "artifacts", "artifact");
  requireActivity(spec, "resolve-review-task", "agents", "step");
  requireTransition(
    spec,
    "review-report",
    "resolve-review-task",
    "reopen exact SHA-256",
  );
}

function assertNoOverwriteExistingPlan(spec: SwimlaneSpec): void {
  requireActivity(spec, "write-preconditions", "workflow", "decision");
  requireActivity(spec, "existing-plan-blocked", "workflow", "step");
  requireTransition(
    spec,
    "write-preconditions",
    "existing-plan-blocked",
    "already exists; never overwrite",
  );
  assertTerminal(spec, "existing-plan-blocked");
  invariant(
    !hasPath(spec, "existing-plan-blocked", "write-fix-plan"),
    "existing plan branch must not reach write-fix-plan",
  );
}

function assertExactFindingCoverage(spec: SwimlaneSpec): void {
  requireActivity(spec, "validate-fix-plan", "workflow", "decision");
  requireTransition(
    spec,
    "review-report",
    "validate-fix-plan",
    "exact finding set",
  );
  requireTransition(spec, "fix-plan", "validate-fix-plan");
  assertExactValues(
    incoming(spec, "validate-fix-plan").map((transition) => transition.from),
    ["review-report", "fix-plan"],
    "fix-plan validation inputs",
  );
}

function assertAllDispositionsPending(spec: SwimlaneSpec): void {
  requireActivity(spec, "write-fix-plan", "agents", "step");
  requireActivity(spec, "fix-plan", "operator", "artifact");
  requireTransition(
    spec,
    "write-fix-plan",
    "fix-plan",
    "all dispositions pending",
  );
  requireTransition(spec, "write-preconditions", "write-fix-plan", "absent");
  invariant(
    !hasPath(spec, "existing-plan-blocked", "fix-plan"),
    "blocked plan branch must not publish fix-plan",
  );
}

function assertNoSourceWrites(spec: SwimlaneSpec): void {
  assertArtifactTargets(spec, "write-fix-plan", [
    "review-task-updated",
    "fix-plan",
  ]);
  assertForbiddenAbsent(spec, [
    "source-write",
    "checkout",
    "commit",
    "push",
    "remote-mutation",
  ]);
}

function assertAcceptedOnlyWrites(spec: SwimlaneSpec): void {
  requireActivity(spec, "accepted-findings", "operator", "decision");
  requireActivity(spec, "approved-plan-status", "workflow", "decision");
  requireActivity(spec, "approval-blocked", "workflow", "step");
  requireActivity(spec, "apply-accepted-findings", "agents", "step");
  requireTransition(spec, "accepted-findings", "approved-plan-status");
  requireTransition(
    spec,
    "approved-plan-status",
    "apply-accepted-findings",
    "ready; explicit accepted ids only",
  );
  assertExactValues(
    incoming(spec, "approved-plan-status").map((transition) => transition.from),
    ["accepted-findings"],
    "approved-plan-status input",
  );
  assertExactValues(
    incoming(spec, "apply-accepted-findings").map((transition) => transition.from),
    ["approved-plan-status"],
    "apply-accepted-findings input",
  );
  invariant(
    !hasPath(spec, "approval-blocked", "apply-accepted-findings"),
    "blocked approval branch must not reach source writes",
  );
  invariant(
    !hasPath(
      spec,
      "fix-plan",
      "apply-accepted-findings",
      "accepted-findings",
    ),
    "apply path must pass through operator accepted-findings",
  );
}

function assertDistinctLinkedWorktree(spec: SwimlaneSpec): void {
  requireActivity(spec, "linked-worktree", "artifacts", "artifact");
  requireTransition(
    spec,
    "apply-accepted-findings",
    "linked-worktree",
    "distinct path; original checkout read-only",
  );
  assertArtifactTargets(spec, "apply-accepted-findings", ["linked-worktree"]);
  assertExactValues(
    spec.activities
      .filter((candidate) => candidate.id.includes("worktree"))
      .map((candidate) => candidate.id),
    ["linked-worktree", "retained-worktree-decision"],
    "worktree semantic elements",
  );
}

function assertOriginalCheckoutReadOnly(spec: SwimlaneSpec): void {
  requireTransition(
    spec,
    "apply-accepted-findings",
    "linked-worktree",
    "distinct path; original checkout read-only",
  );
  invariant(
    !spec.activities.some((candidate) => candidate.id.includes("original-checkout")),
    "original checkout must not be represented as a writable activity or artifact",
  );
}

function assertUnchangedHeadNoCommit(spec: SwimlaneSpec): void {
  const worktree = requireActivity(
    spec,
    "linked-worktree",
    "artifacts",
    "artifact",
  );
  invariant(
    worktree.title
      === "Linked worktree: HEAD unchanged; no commit, push, PR, merge, or deploy",
    "linked-worktree must preserve exact unchanged-HEAD negative contract",
  );
  assertForbiddenAbsent(spec, ["commit"]);
}

function assertIndependentVerification(spec: SwimlaneSpec): void {
  requireActivity(spec, "verify-and-report", "agents", "step");
  requireTransition(
    spec,
    "linked-worktree",
    "verify-and-report",
    "reopen complete diff independently",
  );
  const depths = derivedDepths(spec);
  invariant(
    (depths.get("verify-and-report") ?? -1) > (depths.get("linked-worktree") ?? -1),
    "independent verifier must follow linked worktree",
  );
}

function assertUnresolvedPreventsCompletion(spec: SwimlaneSpec): void {
  const completion = requireActivity(
    spec,
    "completion-status",
    "workflow",
    "decision",
  );
  invariant(
    completion.title === "Completed only when unresolvedIds is empty",
    "completion decision must preserve unresolvedIds guard",
  );
  requireTransition(spec, "verify-and-report", "completion-status");
}

function assertNoRemoteMutation(spec: SwimlaneSpec): void {
  const worktree = activity(spec, "linked-worktree");
  invariant(
    worktree.title
      === "Linked worktree: HEAD unchanged; no commit, push, PR, merge, or deploy",
    "linked worktree must name every forbidden remote action",
  );
  assertForbiddenAbsent(spec, [
    "commit",
    "push",
    "pull-request",
    "merge",
    "deploy",
    "remote-mutation",
  ]);
}

const factAssertions: Record<CaseId, Record<string, FactAssertion>> = {
  review: {
    "blocked-early-exit": assertBlockedEarlyExit,
    "two-parallel-review-lanes": assertParallelReviewLanes,
    "adjudicate-joins-both-lanes": assertAdjudicationJoin,
    "pending-fix-plan-publication": assertPendingFixPlanPublication,
    "workflow-routes-agent-decisions": assertWorkflowRoutesAgentDecision,
    "no-direct-llm": assertNoDirectLlm,
  },
  "review-plan": {
    "immutable-review-input": assertImmutableReviewInput,
    "no-overwrite-existing-plan": assertNoOverwriteExistingPlan,
    "exact-finding-coverage": assertExactFindingCoverage,
    "all-dispositions-pending": assertAllDispositionsPending,
    "no-source-writes": assertNoSourceWrites,
    "no-direct-llm": assertNoDirectLlm,
  },
  "review-fix": {
    "accepted-only-writes": assertAcceptedOnlyWrites,
    "distinct-linked-worktree": assertDistinctLinkedWorktree,
    "original-checkout-read-only": assertOriginalCheckoutReadOnly,
    "unchanged-head-no-commit": assertUnchangedHeadNoCommit,
    "independent-verification": assertIndependentVerification,
    "unresolved-prevents-completion": assertUnresolvedPreventsCompletion,
    "no-remote-mutation": assertNoRemoteMutation,
    "no-direct-llm": assertNoDirectLlm,
  },
};

const gateAssertions: Record<CaseId, Record<string, FactAssertion>> = {
  review: {
    "finding-dispositions": (spec) => {
      requireActivity(spec, "finding-dispositions", "operator", "decision");
      requireTransition(
        spec,
        "fix-plan",
        "finding-dispositions",
        "accept, waive, or defer",
      );
      const depths = derivedDepths(spec);
      invariant(
        (depths.get("finding-dispositions") ?? -1) > (depths.get("fix-plan") ?? -1),
        "review human gate must follow all-pending plan",
      );
    },
  },
  "review-plan": {
    "finding-dispositions": (spec) => {
      requireActivity(spec, "finding-dispositions", "operator", "decision");
      requireTransition(
        spec,
        "validate-fix-plan",
        "finding-dispositions",
        "plan remains human-owned",
      );
      const depths = derivedDepths(spec);
      invariant(
        (depths.get("finding-dispositions") ?? -1)
          > (depths.get("validate-fix-plan") ?? -1),
        "review-plan human gate must follow validation",
      );
    },
  },
  "review-fix": {
    "accepted-findings": (spec) => {
      requireActivity(spec, "accepted-findings", "operator", "decision");
      requireTransition(
        spec,
        "fix-plan",
        "accepted-findings",
        "explicit accepted ids only",
      );
      invariant(
        hasPath(spec, "accepted-findings", "apply-accepted-findings"),
        "accepted-findings gate must precede apply",
      );
    },
    "retained-worktree-decision": (spec) => {
      requireActivity(
        spec,
        "retained-worktree-decision",
        "operator",
        "decision",
      );
      requireTransition(
        spec,
        "verify-and-report",
        "retained-worktree-decision",
        "keep, edit, commit, or discard",
      );
      const depths = derivedDepths(spec);
      invariant(
        (depths.get("retained-worktree-decision") ?? -1)
          > (depths.get("verify-and-report") ?? -1),
        "retained worktree gate must follow independent verification",
      );
    },
  },
};

const writeStageMappings: Record<
  CaseId,
  Record<string, { semanticStage: string; targets: string[] }>
> = {
  review: {
    "publish-report": {
      semanticStage: "publish-report",
      targets: ["review-task-updated", "review-report", "fix-plan"],
    },
  },
  "review-plan": {
    "write-fix-plan": {
      semanticStage: "write-fix-plan",
      targets: ["review-task-updated", "fix-plan"],
    },
  },
  "review-fix": {
    "apply-accepted-findings": {
      semanticStage: "apply-accepted-findings",
      targets: ["linked-worktree"],
    },
    "verify-and-report": {
      semanticStage: "verify-and-report",
      targets: ["review-task-updated", "fix-report"],
    },
  },
};

const readOnlyStageMappings: Record<CaseId, Record<string, string>> = {
  review: {
    "resolve-target": "resolve-target",
    "review-changes": "review-changes",
    "review-context": "review-context",
    adjudicate: "adjudicate",
  },
  "review-plan": {
    "resolve-review-task": "resolve-review-task",
    "validate-fix-plan": "validate-fix-plan",
  },
  "review-fix": {
    "resolve-approved-plan": "approved-plan-status",
  },
};

function normalizeCorpusArtifact(id: string): string {
  return id === "review-task" ? "review-task-updated" : id;
}

function assertWriteBoundaries(caseId: CaseId, spec: SwimlaneSpec): void {
  const fixture = fixtures[caseId];
  const writeMappings = writeStageMappings[caseId];
  const readMappings = readOnlyStageMappings[caseId];
  for (const boundary of fixture.writeBoundaries) {
    if (boundary.allowedArtifacts.length > 0) {
      const mapping = writeMappings[boundary.stage];
      invariant(mapping, `missing write-stage mapping for ${caseId}/${boundary.stage}`);
      assertExactValues(
        mapping.targets,
        boundary.allowedArtifacts.map(normalizeCorpusArtifact),
        `${caseId}/${boundary.stage} corpus write mapping`,
      );
      assertArtifactTargets(spec, mapping.semanticStage, mapping.targets);
    } else {
      const semanticStage = readMappings[boundary.stage];
      invariant(
        semanticStage,
        `missing read-only stage mapping for ${caseId}/${boundary.stage}`,
      );
      assertArtifactTargets(spec, semanticStage, []);
    }
    assertForbiddenAbsent(spec, boundary.forbidden);
  }
}

function assertStateDistinctTaskArtifacts(
  caseId: CaseId,
  spec: SwimlaneSpec,
): void {
  const fixture = fixtures[caseId];
  const readsTask = fixture.stages.some((stage) => stage.reads.includes("review-task"));
  const writesTask = fixture.stages.some((stage) => stage.writes.includes("review-task"));
  if (!readsTask || !writesTask) {
    return;
  }
  requireActivity(spec, "review-task-input", "artifacts", "artifact");
  requireActivity(spec, "review-task-updated", "artifacts", "artifact");
  invariant(
    activity(spec, "review-task-input").id !== activity(spec, "review-task-updated").id,
    `${caseId} must separate read-only and updated task artifacts`,
  );
  for (const mapping of Object.values(writeStageMappings[caseId])) {
    invariant(
      !outgoing(spec, mapping.semanticStage)
        .some((transition) => transition.to === "review-task-input"),
      `${mapping.semanticStage} must not write review-task-input`,
    );
  }
}

function assertCaseContract(caseId: CaseId, spec: SwimlaneSpec): void {
  const entry = manifest.cases.find((candidate) => candidate.id === caseId);
  invariant(entry, `missing manifest entry ${caseId}`);
  for (const factId of entry.requiredFactIds) {
    const assertion = factAssertions[caseId][factId];
    invariant(assertion, `missing fact assertion ${caseId}/${factId}`);
    assertion(spec);
  }
  for (const gate of fixtures[caseId].humanGates) {
    const assertion = gateAssertions[caseId][gate.id];
    invariant(assertion, `missing gate assertion ${caseId}/${gate.id}`);
    assertion(spec);
  }
  assertWriteBoundaries(caseId, spec);
  assertStateDistinctTaskArtifacts(caseId, spec);
}

function assertFixtureCaps(spec: SwimlaneSpec): void {
  invariant(spec.template === "flow.swimlane", "fixture template must be flow.swimlane");
  invariant(spec.title.length > 0 && spec.title.length <= 80, "title must fit 80 chars");
  invariant(!spec.title.includes("\n"), "title must be single-line");
  invariant(spec.lanes.length >= 2 && spec.lanes.length <= 5, "lane count outside cap");
  invariant(
    spec.activities.length >= 2 && spec.activities.length <= 16,
    "activity count outside cap",
  );
  invariant(
    spec.transitions.length >= 1 && spec.transitions.length <= 24,
    "transition count outside cap",
  );
  invariant(
    new Set(spec.lanes.map((lane) => lane.id)).size === spec.lanes.length,
    "lane ids must be unique",
  );
  invariant(
    new Set(spec.activities.map((candidate) => candidate.id)).size
      === spec.activities.length,
    "activity ids must be unique",
  );
  invariant(
    new Set(spec.transitions.map((transition) => transition.id)).size
      === spec.transitions.length,
    "transition ids must be unique",
  );
  for (const lane of spec.lanes) {
    invariant(
      lane.label.length > 0 && lane.label.length <= 48 && !lane.label.includes("\n"),
      `${lane.id} lane label exceeds cap`,
    );
    invariant(
      spec.activities.some((candidate) => candidate.lane === lane.id),
      `${lane.id} lane must not be empty`,
    );
  }
  for (const candidate of spec.activities) {
    invariant(
      candidate.title.length > 0
        && candidate.title.length <= 80
        && !candidate.title.includes("\n"),
      `${candidate.id} title exceeds cap`,
    );
  }
  for (const transition of spec.transitions) {
    invariant(
      transition.label === undefined
        || (
          transition.label.length > 0
          && transition.label.length <= 48
          && !transition.label.includes("\n")
        ),
      `${transition.id} label exceeds cap`,
    );
  }

  const depths = derivedDepths(spec);
  invariant(
    Math.max(...depths.values()) <= 6,
    "fixture exceeds maximum derived depth 6",
  );
  const cells = new Map<string, number>();
  for (const candidate of spec.activities) {
    const key = `${candidate.lane}/${depths.get(candidate.id)}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  for (const [cell, count] of cells) {
    invariant(count <= 3, `${cell} exceeds three-activity cell cap`);
  }
}

function cloneSpec(spec: SwimlaneSpec): SwimlaneSpec {
  return structuredClone(spec);
}

function changeLane(spec: SwimlaneSpec, id: string, lane: string): SwimlaneSpec {
  const mutated = cloneSpec(spec);
  activity(mutated, id).lane = lane;
  return mutated;
}

function removeActivity(spec: SwimlaneSpec, id: string): SwimlaneSpec {
  const mutated = cloneSpec(spec);
  mutated.activities = mutated.activities.filter((candidate) => candidate.id !== id);
  return mutated;
}

function removeTransition(spec: SwimlaneSpec, id: string): SwimlaneSpec {
  const mutated = cloneSpec(spec);
  mutated.transitions = mutated.transitions.filter((transition) => transition.id !== id);
  return mutated;
}

function changeTransitionLabel(
  spec: SwimlaneSpec,
  id: string,
  label: string,
): SwimlaneSpec {
  const mutated = cloneSpec(spec);
  const transition = mutated.transitions.find((candidate) => candidate.id === id);
  invariant(transition, `missing mutation transition ${id}`);
  transition.label = label;
  return mutated;
}

function collapseArtifact(
  spec: SwimlaneSpec,
  removedId: string,
  transitionId: string,
  replacementId: string,
): SwimlaneSpec {
  const mutated = removeActivity(spec, removedId);
  const transition = mutated.transitions.find((candidate) => candidate.id === transitionId);
  invariant(transition, `missing collapse transition ${transitionId}`);
  transition.to = replacementId;
  return mutated;
}

function addActivityFromStage(
  spec: SwimlaneSpec,
  stage: string,
  candidate: SwimlaneSpec["activities"][number],
): SwimlaneSpec {
  const mutated = cloneSpec(spec);
  mutated.activities.push(candidate);
  mutated.transitions.push({
    id: `${stage}-${candidate.id}`,
    from: stage,
    to: candidate.id,
    label: "mutation",
  });
  return mutated;
}

const mutationCases: Array<{
  caseId: CaseId;
  category: string;
  mutate: (spec: SwimlaneSpec) => SwimlaneSpec;
  expected: string | RegExp;
}> = [
  {
    caseId: "review",
    category: "wrong lane",
    mutate: (spec) => changeLane(spec, "target-status", "agents"),
    expected: /target-status must be in workflow/u,
  },
  {
    caseId: "review",
    category: "missing activity",
    mutate: (spec) => removeActivity(spec, "target-blocked"),
    expected: /expected exactly one activity target-blocked/u,
  },
  {
    caseId: "review",
    category: "missing join transition",
    mutate: (spec) => removeTransition(spec, "context-adjudicate"),
    expected: /expected exactly one transition review-context -> adjudicate/u,
  },
  {
    caseId: "review",
    category: "changed outcome label",
    mutate: (spec) => changeTransitionLabel(spec, "status-blocked", "stopped"),
    expected: /target-status -> target-blocked must be labelled "blocked"/u,
  },
  {
    caseId: "review",
    category: "published artifact collapse",
    mutate: (spec) => collapseArtifact(
      spec,
      "review-report",
      "publish-review",
      "review-task-updated",
    ),
    expected: /publish-report artifact targets: expected/u,
  },
  {
    caseId: "review",
    category: "extra write target",
    mutate: (spec) => addActivityFromStage(spec, "publish-report", {
      id: "unexpected-artifact",
      lane: "artifacts",
      type: "artifact",
      title: "Artifact: unexpected write target",
    }),
    expected: /publish-report artifact targets: expected/u,
  },
  {
    caseId: "review",
    category: "direct LLM activity",
    mutate: (spec) => addActivityFromStage(spec, "resolve-target", {
      id: "direct-llm-call",
      lane: "agents",
      type: "step",
      title: "Direct LLM: classify",
    }),
    expected: /direct-llm-call represents a direct LLM call/u,
  },
  {
    caseId: "review",
    category: "forbidden remote action",
    mutate: (spec) => addActivityFromStage(spec, "publish-report", {
      id: "remote-action",
      lane: "agents",
      type: "step",
      title: "Agent: push remote branch",
    }),
    expected: /remote-action represents forbidden push/u,
  },
  {
    caseId: "review-plan",
    category: "wrong lane",
    mutate: (spec) => changeLane(spec, "write-preconditions", "agents"),
    expected: /write-preconditions must be in workflow/u,
  },
  {
    caseId: "review-plan",
    category: "missing activity",
    mutate: (spec) => removeActivity(spec, "existing-plan-blocked"),
    expected: /expected exactly one activity existing-plan-blocked/u,
  },
  {
    caseId: "review-plan",
    category: "missing join transition",
    mutate: (spec) => removeTransition(spec, "plan-validation"),
    expected: /expected exactly one transition fix-plan -> validate-fix-plan/u,
  },
  {
    caseId: "review-plan",
    category: "changed gate label",
    mutate: (spec) => changeTransitionLabel(
      spec,
      "validation-dispositions",
      "workflow approved",
    ),
    expected: /validate-fix-plan -> finding-dispositions must be labelled "plan remains human-owned"/u,
  },
  {
    caseId: "review-plan",
    category: "input/output artifact collapse",
    mutate: (spec) => {
      const mutated = collapseArtifact(
        spec,
        "review-task-updated",
        "write-task",
        "review-task-input",
      );
      mutated.transitions = mutated.transitions.filter(
        (transition) => transition.id !== "task-resolve",
      );
      return mutated;
    },
    expected: /write-fix-plan artifact targets: expected/u,
  },
  {
    caseId: "review-plan",
    category: "extra write target",
    mutate: (spec) => addActivityFromStage(spec, "write-fix-plan", {
      id: "unexpected-artifact",
      lane: "artifacts",
      type: "artifact",
      title: "Artifact: unexpected write target",
    }),
    expected: /write-fix-plan artifact targets: expected/u,
  },
  {
    caseId: "review-plan",
    category: "direct LLM activity",
    mutate: (spec) => addActivityFromStage(spec, "resolve-review-task", {
      id: "direct-llm-call",
      lane: "agents",
      type: "step",
      title: "Direct LLM: draft plan",
    }),
    expected: /direct-llm-call represents a direct LLM call/u,
  },
  {
    caseId: "review-plan",
    category: "forbidden remote action",
    mutate: (spec) => addActivityFromStage(spec, "write-fix-plan", {
      id: "remote-action",
      lane: "agents",
      type: "step",
      title: "Agent: push remote branch",
    }),
    expected: /remote-action represents forbidden push/u,
  },
  {
    caseId: "review-fix",
    category: "wrong lane",
    mutate: (spec) => changeLane(spec, "accepted-findings", "workflow"),
    expected: /accepted-findings must be in operator/u,
  },
  {
    caseId: "review-fix",
    category: "missing activity",
    mutate: (spec) => removeActivity(spec, "approval-blocked"),
    expected: /expected exactly one activity approval-blocked/u,
  },
  {
    caseId: "review-fix",
    category: "missing join transition",
    mutate: (spec) => removeTransition(spec, "worktree-verify"),
    expected: /expected exactly one transition linked-worktree -> verify-and-report/u,
  },
  {
    caseId: "review-fix",
    category: "changed outcome label",
    mutate: (spec) => changeTransitionLabel(
      spec,
      "approved-apply",
      "ready",
    ),
    expected: /approved-plan-status -> apply-accepted-findings must be labelled "ready; explicit accepted ids only"/u,
  },
  {
    caseId: "review-fix",
    category: "input/output artifact collapse",
    mutate: (spec) => {
      const mutated = collapseArtifact(
        spec,
        "review-task-updated",
        "verify-task",
        "review-task-input",
      );
      mutated.transitions = mutated.transitions.filter(
        (transition) => transition.id !== "task-accepted-findings",
      );
      return mutated;
    },
    expected: /verify-and-report artifact targets: expected/u,
  },
  {
    caseId: "review-fix",
    category: "extra write target",
    mutate: (spec) => addActivityFromStage(spec, "verify-and-report", {
      id: "unexpected-artifact",
      lane: "artifacts",
      type: "artifact",
      title: "Artifact: unexpected write target",
    }),
    expected: /verify-and-report artifact targets: expected/u,
  },
  {
    caseId: "review-fix",
    category: "direct LLM activity",
    mutate: (spec) => addActivityFromStage(spec, "verify-and-report", {
      id: "direct-llm-call",
      lane: "agents",
      type: "step",
      title: "Direct LLM: verify",
    }),
    expected: /direct-llm-call represents a direct LLM call/u,
  },
  {
    caseId: "review-fix",
    category: "forbidden remote action",
    mutate: (spec) => addActivityFromStage(spec, "verify-and-report", {
      id: "remote-action",
      lane: "agents",
      type: "step",
      title: "Agent: push remote branch",
    }),
    expected: /remote-action represents forbidden push/u,
  },
];

describe("flow.swimlane frozen agent-workflow projections", () => {
  it("covers all 20 manifest facts with executable assertions", () => {
    let factCount = 0;
    for (const entry of manifest.cases) {
      assertExactValues(
        Object.keys(factAssertions[entry.id]),
        entry.requiredFactIds,
        `${entry.id} fact assertions`,
      );
      for (const factId of entry.requiredFactIds) {
        expect(
          () => factAssertions[entry.id][factId](specs[entry.id]),
          `${entry.id}/${factId}`,
        ).not.toThrow();
        factCount += 1;
      }
    }
    expect(factCount).toBe(20);
  });

  it("covers every frozen human gate with an owner, ordering, and exact handoff", () => {
    let gateCount = 0;
    for (const caseId of caseIds) {
      assertExactValues(
        Object.keys(gateAssertions[caseId]),
        fixtures[caseId].humanGates.map((gate) => gate.id),
        `${caseId} human gate assertions`,
      );
      for (const gate of fixtures[caseId].humanGates) {
        expect(
          () => gateAssertions[caseId][gate.id](specs[caseId]),
          `${caseId}/${gate.id}`,
        ).not.toThrow();
        gateCount += 1;
      }
    }
    expect(gateCount).toBe(4);
  });

  it("preserves exact write targets, read-only stages, forbidden actions, and task state identity", () => {
    for (const caseId of caseIds) {
      expect(() => assertWriteBoundaries(caseId, specs[caseId])).not.toThrow();
      expect(() => assertStateDistinctTaskArtifacts(caseId, specs[caseId]))
        .not.toThrow();
    }
    expect(
      Object.values(writeStageMappings)
        .flatMap((mapping) => Object.keys(mapping)),
    ).toHaveLength(4);
  });

  it.each(caseIds)("%s stays inside every frozen weak-model cap", (caseId) => {
    expect(() => assertFixtureCaps(specs[caseId])).not.toThrow();
  });

  it.each(caseIds)("%s validates and builds through the public router", (caseId) => {
    const validation = validateDiagramSpec(specs[caseId]);
    expect(validation.ok).toBe(true);
    expect(validation.diagnostics).toEqual([]);

    const build = buildDiagramSpec(specs[caseId], { seed: 42 });
    expect(build.ok).toBe(true);
    if (!build.ok) {
      return;
    }
    expect(build.geometry.ok).toBe(true);
    expect(build.metadata.template).toBe("flow.swimlane");
    const metadata = build.metadata as unknown as {
      activities: Array<{ id: string; depth: number }>;
      transitions: Array<{ id: string }>;
    };
    assertExactValues(
      metadata.activities.map((candidate) => candidate.id),
      specs[caseId].activities.map((candidate) => candidate.id),
      `${caseId} built activity ids`,
    );
    assertExactValues(
      metadata.transitions.map((transition) => transition.id),
      specs[caseId].transitions.map((transition) => transition.id),
      `${caseId} built transition ids`,
    );
    expect(Math.max(...metadata.activities.map((candidate) => candidate.depth)))
      .toBeLessThanOrEqual(6);
  });

  it.each(mutationCases)(
    "$caseId rejects $category mutation",
    ({ caseId, mutate, expected }) => {
      expect(
        () => assertCaseContract(caseId, mutate(specs[caseId])),
      ).toThrow(expected);
    },
  );
});
