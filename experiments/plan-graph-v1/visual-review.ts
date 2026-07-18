import type { Fixture } from "./fixture.js";
import type {
  QaVisualReview,
  VisualPendingReason,
  VisualReconciliation,
  VisualReview,
  VisualReviewIdentity,
  VisualReviewLedger,
  VisualReviewRecord,
  VisualScore,
} from "./model.js";
import { codePointCompare } from "./rank.js";

export interface VisualEvidenceIdentity {
  sourceSha256: string;
  renderer: Record<string, string>;
  artifacts: Record<string, VisualReviewIdentity>;
}

const LEDGER_KEYS = [
  "schemaVersion",
  "status",
  "pendingReasons",
  "sourceSha256",
  "renderer",
  "records",
] as const;
const RECORD_KEYS = [
  "fixtureId",
  "identity",
  "mainReview",
  "qaReview",
  "reconciliation",
] as const;
const IDENTITY_KEYS = [
  "canonicalResultSha256",
  "sceneSha256",
  "pngSha256",
] as const;
const REVIEW_KEYS = [
  "reviewer",
  "armA",
  "armB",
  "preference",
  "rationale",
] as const;
const SCORE_KEYS = [
  "primaryStory",
  "groupTitles",
  "nodeTitlesAndRoutes",
] as const;
const RENDERER_KEYS = [
  "rendererVersion",
  "playwrightVersion",
  "browser",
  "font",
  "os",
] as const;
const PENDING_REASONS = new Set<VisualPendingReason>([
  "INVALID_JSON",
  "UNKNOWN_KEY",
  "INVALID_SCHEMA",
  "SOURCE_MISMATCH",
  "RENDERER_MISMATCH",
  "FIXTURE_SET_MISMATCH",
  "DUPLICATE_FIXTURE",
  "RESULT_MISMATCH",
  "SCENE_MISMATCH",
  "PNG_MISMATCH",
  "INCOMPLETE_MAIN_REVIEW",
  "INVALID_SCORE",
  "INVALID_PREFERENCE",
  "QA_DISAGREEMENT",
]);

class LedgerIssue extends Error {
  constructor(readonly reason: VisualPendingReason) {
    super(reason);
  }
}

export function parseVisualReviewLedger(
  text: string,
  expected: VisualEvidenceIdentity,
  fixtures: Fixture[],
): VisualReviewLedger {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return pendingVisualReview(expected, fixtures, "INVALID_JSON");
  }

  try {
    const ledger = parseLedger(raw);
    validateLedgerIdentity(ledger, expected, fixtures);
    return normalizeLedgerStatus(ledger, expected, fixtures);
  } catch (error) {
    const reason =
      error instanceof LedgerIssue ? error.reason : "INVALID_SCHEMA";
    return pendingVisualReview(expected, fixtures, reason);
  }
}

export function pendingVisualReview(
  expected: VisualEvidenceIdentity,
  fixtures: Fixture[],
  reason: VisualPendingReason = "INCOMPLETE_MAIN_REVIEW",
): VisualReviewLedger {
  return {
    schemaVersion: 1,
    status: "pending",
    pendingReasons: [reason],
    sourceSha256: expected.sourceSha256,
    renderer: { ...expected.renderer },
    records: fixtures
      .map((fixture) => ({
        fixtureId: fixture.id,
        identity: {
          canonicalResultSha256: {
            ...expected.artifacts[fixture.id].canonicalResultSha256,
          },
          sceneSha256: {
            ...expected.artifacts[fixture.id].sceneSha256,
          },
          pngSha256: {
            ...expected.artifacts[fixture.id].pngSha256,
          },
        },
        mainReview: null,
        qaReview: { status: "not-reviewed" } as const,
        reconciliation: { status: "not-required" } as const,
      }))
      .sort((left, right) =>
        codePointCompare(left.fixtureId, right.fixtureId),
      ),
  };
}

function parseLedger(value: unknown): VisualReviewLedger {
  const ledger = objectAt(value);
  exactKeys(ledger, LEDGER_KEYS);
  if (ledger.schemaVersion !== 1) issue("INVALID_SCHEMA");
  const status = enumAt(
    ledger.status,
    ["pending", "accepted", "disputed"] as const,
  );
  const pendingReasons = arrayAt(ledger.pendingReasons).map((reason) => {
    if (typeof reason !== "string" || !PENDING_REASONS.has(reason as VisualPendingReason)) {
      issue("INVALID_SCHEMA");
    }
    return reason as VisualPendingReason;
  });
  const records = arrayAt(ledger.records).map(parseRecord);
  return {
    schemaVersion: 1,
    status,
    pendingReasons,
    sourceSha256: shaAt(ledger.sourceSha256),
    renderer: parseRenderer(ledger.renderer),
    records,
  };
}

function parseRecord(value: unknown): VisualReviewRecord {
  const record = objectAt(value);
  exactKeys(record, RECORD_KEYS);
  return {
    fixtureId: stringAt(record.fixtureId),
    identity: parseIdentity(record.identity),
    mainReview:
      record.mainReview === null ? null : parseReview(record.mainReview),
    qaReview: parseQaReview(record.qaReview),
    reconciliation: parseReconciliation(record.reconciliation),
  };
}

function parseIdentity(value: unknown): VisualReviewIdentity {
  const identity = objectAt(value);
  exactKeys(identity, IDENTITY_KEYS);
  return {
    canonicalResultSha256: parseHashPair(
      identity.canonicalResultSha256,
    ),
    sceneSha256: parseHashTriple(identity.sceneSha256),
    pngSha256: parseHashTriple(identity.pngSha256),
  };
}

function parseReview(value: unknown): VisualReview {
  const review = objectAt(value);
  exactKeys(review, REVIEW_KEYS);
  return {
    reviewer: stringAt(review.reviewer),
    armA: parseScore(review.armA),
    armB: parseScore(review.armB),
    preference: preferenceAt(review.preference),
    rationale: rationaleAt(review.rationale),
  };
}

function parseQaReview(value: unknown): QaVisualReview {
  const review = objectAt(value);
  const status = enumAt(
    review.status,
    ["not-reviewed", "agreed", "disagreed"] as const,
  );
  if (status === "not-reviewed") {
    exactKeys(review, ["status"]);
    return { status };
  }
  exactKeys(review, ["status", ...REVIEW_KEYS]);
  const parsed = parseReview(
    Object.fromEntries(
      Object.entries(review).filter(([key]) => key !== "status"),
    ),
  );
  return { status, ...parsed };
}

function parseReconciliation(value: unknown): VisualReconciliation {
  const reconciliation = objectAt(value);
  const status = enumAt(
    reconciliation.status,
    ["not-required", "pending", "resolved"] as const,
  );
  if (status !== "resolved") {
    exactKeys(reconciliation, ["status"]);
    return { status };
  }
  exactKeys(reconciliation, ["status", "rationale", "reviewers"]);
  const reviewers = arrayAt(reconciliation.reviewers).map(stringAt);
  if (reviewers.length !== 2 || reviewers[0] === reviewers[1]) {
    issue("INVALID_SCHEMA");
  }
  return {
    status,
    rationale: rationaleAt(reconciliation.rationale),
    reviewers: [reviewers[0], reviewers[1]],
  };
}

function normalizeLedgerStatus(
  ledger: VisualReviewLedger,
  expected: VisualEvidenceIdentity,
  fixtures: Fixture[],
): VisualReviewLedger {
  if (ledger.status === "accepted" && ledger.pendingReasons.length > 0) {
    issue("INVALID_SCHEMA");
  }
  if (ledger.records.some((record) => record.mainReview === null)) {
    return pendingVisualReview(
      expected,
      fixtures,
      "INCOMPLETE_MAIN_REVIEW",
    );
  }
  const hasUnresolvedQa = ledger.records.some((record) => {
    const reconciliation = record.reconciliation;
    if (record.qaReview.status === "not-reviewed") {
      if (reconciliation.status !== "not-required") issue("INVALID_SCHEMA");
      return false;
    }
    const main = record.mainReview!;
    const gateDisagreement = hasGateRelevantDisagreement(
      fixtures.find((fixture) => fixture.id === record.fixtureId)!,
      main,
      record.qaReview,
    );
    if (record.qaReview.status === "agreed") {
      if (gateDisagreement || reconciliation.status !== "not-required") {
        issue("INVALID_SCHEMA");
      }
      return false;
    }
    if (reconciliation.status === "not-required") issue("INVALID_SCHEMA");
    if (reconciliation.status === "resolved") {
      if (
        reconciliation.reviewers[0] !== main.reviewer ||
        reconciliation.reviewers[1] !== record.qaReview.reviewer
      ) {
        issue("INVALID_SCHEMA");
      }
      return false;
    }
    return true;
  });
  if (hasUnresolvedQa) {
    return {
      ...ledger,
      status: "disputed",
      pendingReasons: ["QA_DISAGREEMENT"],
    };
  }
  if (ledger.status !== "accepted") {
    issue("INVALID_SCHEMA");
  }
  return { ...ledger, status: "accepted", pendingReasons: [] };
}

function validateLedgerIdentity(
  ledger: VisualReviewLedger,
  expected: VisualEvidenceIdentity,
  fixtures: Fixture[],
): void {
  if (ledger.sourceSha256 !== expected.sourceSha256) {
    issue("SOURCE_MISMATCH");
  }
  if (!sameRecord(ledger.renderer, expected.renderer)) {
    issue("RENDERER_MISMATCH");
  }
  const ids = ledger.records.map((record) => record.fixtureId);
  if (new Set(ids).size !== ids.length) issue("DUPLICATE_FIXTURE");
  const expectedIds = fixtures
    .map((fixture) => fixture.id)
    .sort(codePointCompare);
  const actualIds = [...ids].sort(codePointCompare);
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    issue("FIXTURE_SET_MISMATCH");
  }
  for (const record of ledger.records) {
    const identity = expected.artifacts[record.fixtureId];
    if (
      !sameRecord(
        record.identity.canonicalResultSha256,
        identity.canonicalResultSha256,
      )
    ) {
      issue("RESULT_MISMATCH");
    }
    if (!sameRecord(record.identity.sceneSha256, identity.sceneSha256)) {
      issue("SCENE_MISMATCH");
    }
    if (!sameRecord(record.identity.pngSha256, identity.pngSha256)) {
      issue("PNG_MISMATCH");
    }
  }
}

function hasGateRelevantDisagreement(
  fixture: Fixture,
  main: VisualReview,
  qa: Exclude<QaVisualReview, { status: "not-reviewed" }>,
): boolean {
  for (const dimension of SCORE_KEYS) {
    if ((main.armB[dimension] === 0) !== (qa.armB[dimension] === 0)) {
      return true;
    }
    if (
      !fixture.dense &&
      (main.armB[dimension] < main.armA[dimension]) !==
        (qa.armB[dimension] < qa.armA[dimension])
    ) {
      return true;
    }
  }
  const mainGroupingRejection =
    fixture.dense &&
    main.armA.primaryStory === 0 &&
    /group/i.test(main.rationale);
  const qaGroupingRejection =
    fixture.dense &&
    qa.armA.primaryStory === 0 &&
    /group/i.test(qa.rationale);
  if (mainGroupingRejection !== qaGroupingRejection) return true;
  return (
    fixture.dense &&
    qualifiesDensePreference(main) !== qualifiesDensePreference(qa)
  );
}

function qualifiesDensePreference(review: VisualReview): boolean {
  return (
    review.preference === "B" ||
    visualTotal(review.armB) > visualTotal(review.armA)
  );
}

function parseScore(value: unknown): VisualScore {
  const score = objectAt(value);
  exactKeys(score, SCORE_KEYS);
  return {
    primaryStory: scoreAt(score.primaryStory),
    groupTitles: scoreAt(score.groupTitles),
    nodeTitlesAndRoutes: scoreAt(score.nodeTitlesAndRoutes),
  };
}

function scoreAt(value: unknown): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) issue("INVALID_SCORE");
  return value;
}

function preferenceAt(value: unknown): "A" | "B" | "tie" {
  if (value !== "A" && value !== "B" && value !== "tie") {
    issue("INVALID_PREFERENCE");
  }
  return value;
}

function parseRenderer(value: unknown): Record<string, string> {
  const renderer = objectAt(value);
  exactKeys(renderer, RENDERER_KEYS);
  return Object.fromEntries(
    RENDERER_KEYS.map((key) => [key, stringAt(renderer[key])]),
  );
}

function parseHashPair(value: unknown): { A: string; B: string } {
  const pair = objectAt(value);
  exactKeys(pair, ["A", "B"]);
  return { A: shaAt(pair.A), B: shaAt(pair.B) };
}

function parseHashTriple(
  value: unknown,
): { A: string; B: string; plate: string } {
  const triple = objectAt(value);
  exactKeys(triple, ["A", "B", "plate"]);
  return {
    A: shaAt(triple.A),
    B: shaAt(triple.B),
    plate: shaAt(triple.plate),
  };
}

function sameRecord(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left).sort(codePointCompare);
  const rightKeys = Object.keys(right).sort(codePointCompare);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && left[key] === right[rightKeys[index]],
    )
  );
}

function visualTotal(score: VisualScore): number {
  return score.primaryStory + score.groupTitles + score.nodeTitlesAndRoutes;
}

function objectAt(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issue("INVALID_SCHEMA");
  }
  return value as Record<string, unknown>;
}

function arrayAt(value: unknown): unknown[] {
  if (!Array.isArray(value)) issue("INVALID_SCHEMA");
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value);
  if (
    expected.some((key) => !actual.includes(key)) ||
    actual.some((key) => !expected.includes(key))
  ) {
    issue(
      actual.some((key) => !expected.includes(key))
        ? "UNKNOWN_KEY"
        : "INVALID_SCHEMA",
    );
  }
}

function stringAt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issue("INVALID_SCHEMA");
  }
  return value;
}

function rationaleAt(value: unknown): string {
  const text = stringAt(value);
  if (text.trim().length < 12) issue("INVALID_SCHEMA");
  return text;
}

function shaAt(value: unknown): string {
  const text = stringAt(value);
  if (!/^[0-9a-f]{64}$/u.test(text)) issue("INVALID_SCHEMA");
  return text;
}

function enumAt<const T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issue("INVALID_SCHEMA");
  }
  return value as T;
}

function issue(reason: VisualPendingReason): never {
  throw new LedgerIssue(reason);
}
