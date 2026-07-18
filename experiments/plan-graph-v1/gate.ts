import type { Fixture } from "./fixture.js";
import type {
  GateResult,
  PlanGraphResult,
  TimedArmResult,
  VisualReviewLedger,
} from "./model.js";

export function evaluateGate(
  fixtures: Fixture[],
  results: PlanGraphResult[],
  timings: TimedArmResult[],
  visual: VisualReviewLedger,
  deterministic: Record<string, boolean>,
): GateResult {
  const failures: string[] = [];
  const result = (fixtureId: string, arm: "A" | "B") => {
    const found = results.find(
      (candidate) =>
        candidate.fixtureId === fixtureId && candidate.arm === arm,
    );
    if (!found) throw new Error(`missing result ${fixtureId}/${arm}`);
    return found;
  };
  const timing = (fixtureId: string, arm: "A" | "B") => {
    const found = timings.find(
      (candidate) =>
        candidate.fixtureId === fixtureId && candidate.arm === arm,
    );
    if (!found) throw new Error(`missing timing ${fixtureId}/${arm}`);
    return found;
  };

  for (const fixture of fixtures) {
    const a = result(fixture.id, "A");
    const b = result(fixture.id, "B");
    if (b.structuralIssues.length > 0) {
      failures.push(`${fixture.id}: B has structural errors`);
    }
    if (!deterministic[`${fixture.id}:A`] || !deterministic[`${fixture.id}:B`]) {
      failures.push(`${fixture.id}: fresh-process hash mismatch`);
    }
    if (
      timing(fixture.id, "B").p95Ms >
      Math.max(25, 2 * timing(fixture.id, "A").p95Ms)
    ) {
      failures.push(`${fixture.id}: B latency exceeds general gate`);
    }
    if (!fixture.dense && timing(fixture.id, "B").p95Ms >
      Math.max(
        timing(fixture.id, "A").p95Ms + 1,
        1.25 * timing(fixture.id, "A").p95Ms,
      )) {
      failures.push(`${fixture.id}: B control latency regression`);
    }
    if (b.score.normalizedLength > 1.2 * a.score.normalizedLength) {
      failures.push(`${fixture.id}: B normalized length regression`);
    }
    if (b.score.normalizedArea > 1.3 * a.score.normalizedArea) {
      failures.push(`${fixture.id}: B normalized area regression`);
    }
    if (
      b.routeDiagnostics.nonSharedOverlapLength >
      a.routeDiagnostics.nonSharedOverlapLength
    ) {
      failures.push(`${fixture.id}: B route-overlap regression`);
    }
  }

  const dense = fixtures.filter((fixture) => fixture.dense);
  const improvedDense = dense.filter((fixture) => {
    const a = result(fixture.id, "A").score.crossings;
    const b = result(fixture.id, "B").score.crossings;
    return a - b >= Math.max(1, Math.ceil(a * 0.25));
  });
  if (improvedDense.length < 2) {
    failures.push("B lacks per-fixture crossing benefit on two dense fixtures");
  }
  const denseA = dense.reduce(
    (total, fixture) => total + result(fixture.id, "A").score.crossings,
    0,
  );
  const denseB = dense.reduce(
    (total, fixture) => total + result(fixture.id, "B").score.crossings,
    0,
  );
  if (denseA === 0 || denseA - denseB < Math.ceil(denseA * 0.25)) {
    failures.push("B lacks 25% dense-set crossing benefit");
  }

  if (visual.status !== "accepted") {
    return {
      decision: "pending",
      final: false,
      internalPlannerPassed: null,
      elkEligible: null,
      failures,
      pendingReasons: visual.pendingReasons,
    };
  }

  let densePreferences = 0;
  for (const record of visual.records) {
    const fixture = fixtures.find(
      (candidate) => candidate.id === record.fixtureId,
    );
    if (!fixture) {
      failures.push(`${record.fixtureId}: unknown visual fixture`);
      continue;
    }
    const review = record.mainReview;
    if (!review) {
      throw new Error(`accepted visual ledger lacks main review: ${record.fixtureId}`);
    }
    if (Object.values(review.armB).some((score) => score === 0)) {
      failures.push(`${record.fixtureId}: B has failed visual dimension`);
    }
    if (
      !fixture.dense &&
      (review.armB.primaryStory < review.armA.primaryStory ||
        review.armB.groupTitles < review.armA.groupTitles ||
        review.armB.nodeTitlesAndRoutes < review.armA.nodeTitlesAndRoutes)
    ) {
      failures.push(`${record.fixtureId}: B control visual regression`);
    }
    if (
      fixture.dense &&
      (review.preference === "B" ||
        visualTotal(review.armB) > visualTotal(review.armA))
    ) {
      densePreferences += 1;
    }
  }
  if (densePreferences < 2) {
    failures.push("B lacks visual preference on two dense fixtures");
  }

  const internalPlannerPassed = failures.length === 0;
  const bSound = fixtures.every((fixture) => {
    const b = result(fixture.id, "B");
    return (
      b.structuralIssues.length === 0 &&
      deterministic[`${fixture.id}:B`] &&
      b.routeDiagnostics.nonSharedOverlapLength <=
        result(fixture.id, "A").routeDiagnostics.nonSharedOverlapLength
    );
  });
  const aGroupingProblem =
    dense.filter((fixture) => result(fixture.id, "A").score.crossings >= 4)
      .length >= 2 ||
    visual.records.some(
        (record) =>
          fixtures.find((fixture) => fixture.id === record.fixtureId)?.dense &&
          record.mainReview?.armA.primaryStory === 0 &&
          /group/i.test(record.mainReview.rationale),
      );
  const elkEligible = !internalPlannerPassed && bSound && aGroupingProblem;
  return {
    decision: internalPlannerPassed
      ? "internal-planner"
      : elkEligible
        ? "elk-experiment"
        : "retain-current-layouts",
    internalPlannerPassed,
    elkEligible,
    failures,
    final: true,
    pendingReasons: [],
  };
}

function visualTotal(scores: {
  primaryStory: number;
  groupTitles: number;
  nodeTitlesAndRoutes: number;
}): number {
  return scores.primaryStory + scores.groupTitles + scores.nodeTitlesAndRoutes;
}
