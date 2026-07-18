import { canonicalHash, canonicalizeGeometry } from "./canonical.js";
import { placeArmA } from "./arm-a.js";
import { placeArmB } from "./arm-b.js";
import { primaryRankIssues, scoreGeometry } from "./metrics.js";
import type {
  Arm,
  MeasuredFixture,
  Placement,
  PlanGraphResult,
  Point,
} from "./model.js";
import { routePlacement } from "./routing.js";

export interface MeasuredLayout {
  placement: Placement;
  routes: Record<string, Point[]>;
}

export function layoutMeasuredFixture(
  measured: MeasuredFixture,
  arm: Arm,
): MeasuredLayout {
  const placement = arm === "A" ? placeArmA(measured) : placeArmB(measured);
  const routes = routePlacement(measured, placement);
  return { placement, routes };
}

export function planFixture(
  measured: MeasuredFixture,
  arm: Arm,
): PlanGraphResult {
  const { fixture } = measured;
  const { placement, routes } = layoutMeasuredFixture(measured, arm);
  const canonical = canonicalizeGeometry(fixture, placement, routes);
  const metrics = scoreGeometry(
    measured,
    canonical.nodeBounds,
    canonical.groupBounds,
    canonical.routes,
  );
  const structuralIssues = [
    ...primaryRankIssues(fixture, canonical.ranks),
    ...metrics.structuralIssues,
  ].sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.ids.join("\0").localeCompare(right.ids.join("\0")),
  );
  const reasons = [...new Set(structuralIssues.map((issue) => issue.code))].sort();
  const routeDiagnostics = {
    ...metrics.routeDiagnostics,
    nearMisses: [...metrics.routeDiagnostics.nearMisses].sort(
      (left, right) =>
        left.edge.localeCompare(right.edge) ||
        left.obstacle.localeCompare(right.obstacle),
    ),
  };
  const resultWithoutHash = {
    fixtureId: fixture.id,
    arm,
    ...canonical,
    score: metrics.score,
    reasons,
    structuralIssues,
    routeDiagnostics,
  };
  return {
    ...resultWithoutHash,
    canonicalSha256: canonicalHash(resultWithoutHash),
  };
}
