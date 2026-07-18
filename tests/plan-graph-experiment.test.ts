import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  barycenterOrder,
  bucketBarycenterScore,
} from "../experiments/plan-graph-v1/arm-b.js";
import * as canonicalOwner from "../experiments/plan-graph-v1/canonical.js";
import {
  canonicalizeGeometry,
  stripRoute,
} from "../experiments/plan-graph-v1/canonical.js";
import {
  EXPECTED_FIXTURE_HASHES,
  loadFixtures,
  validateFixture,
  type Fixture,
} from "../experiments/plan-graph-v1/fixture.js";
import { evaluateGate } from "../experiments/plan-graph-v1/gate.js";
import { measureFixture } from "../experiments/plan-graph-v1/measure.js";
import * as metricsOwner from "../experiments/plan-graph-v1/metrics.js";
import {
  crossingMetrics,
  structuralChecks,
} from "../experiments/plan-graph-v1/metrics.js";
import type {
  PlanGraphResult,
  StructuralIssue,
  TimedArmResult,
  VisualPendingReason,
  VisualReview,
  VisualReviewLedger,
} from "../experiments/plan-graph-v1/model.js";
import {
  layoutMeasuredFixture,
  planFixture,
} from "../experiments/plan-graph-v1/plan.js";
import { rankFixture } from "../experiments/plan-graph-v1/rank.js";
import * as renderOwner from "../experiments/plan-graph-v1/render.js";
import {
  parseRunOptions,
  prepareMeasuredCatalog,
  timeMeasuredArm,
} from "../experiments/plan-graph-v1/run.js";
import * as runOwner from "../experiments/plan-graph-v1/run.js";
import {
  parseVisualReviewLedger,
  pendingVisualReview,
  type VisualEvidenceIdentity,
} from "../experiments/plan-graph-v1/visual-review.js";
import { rendererBrowserReady, rendererReady } from "../src/render.js";

const fixtures = loadFixtures();
const measuredFixtures = fixtures.map(measureFixture);
const baselineResults = measuredFixtures.flatMap((measured) =>
  (["A", "B"] as const).map((arm) => planFixture(measured, arm)),
);
const visualIdentity = evidenceIdentity(fixtures);

describe("bounded grouped planGraph experiment", () => {
  it("loads exactly the byte-frozen five-fixture catalog", () => {
    expect(fixtures.map((fixture) => `${fixture.id}.json`).sort()).toEqual(
      Object.keys(EXPECTED_FIXTURE_HASHES).sort(),
    );
  });

  it("rejects unknown fixture keys and arm hints", () => {
    const fixture = structuredClone(fixtures[0]) as unknown as Record<
      string,
      unknown
    >;
    fixture.arm = "B";
    expect(() => validateFixture(fixture)).toThrow(/unknown=\[arm\]/);
  });

  it("rejects catalog drift before parsing fixture semantics", () => {
    const root = mkdtempSync(join(tmpdir(), "plan-graph-fixtures-"));
    for (const [name] of Object.entries(EXPECTED_FIXTURE_HASHES)) {
      const source = new URL(
        `../experiments/plan-graph-v1/fixtures/${name}`,
        import.meta.url,
      );
      writeFileSync(join(root, name), readFileSync(source));
    }
    writeFileSync(join(root, "extra.json"), "{}");
    expect(() => loadFixtures(root)).toThrow(/extra=\[extra.json\]/);
  });

  it("measures each catalog fixture once before both arms", () => {
    const measure = vi.fn(measureFixture);
    const measured = prepareMeasuredCatalog(fixtures, measure);
    expect(measure).toHaveBeenCalledTimes(5);
    expect(measure.mock.calls.map(([fixture]) => fixture.id).sort()).toEqual(
      fixtures.map((fixture) => fixture.id).sort(),
    );

    for (const entry of measured) {
      const armA = planFixture(entry, "A");
      const armB = planFixture(entry, "B");
      expect(armA.fixtureId).toBe(entry.fixture.id);
      expect(armB.fixtureId).toBe(entry.fixture.id);
      expect(entry.groupPolicy).toEqual({
        owner: "src/layout.ts#section",
        padding: 24,
        titleHeight: 40,
        headerGap: 8,
        sectionGap: 40,
        sectionMinWidth: 360,
        sectionMinHeight: 390,
      });
    }
    expect(measure).toHaveBeenCalledTimes(5);
  });

  it("times only measured placement and shared routing", () => {
    const canonicalize = vi.spyOn(
      canonicalOwner,
      "canonicalizeGeometry",
    );
    const score = vi.spyOn(metricsOwner, "scoreGeometry");
    const structural = vi.spyOn(metricsOwner, "structuralChecks");
    const renderResult = vi.spyOn(renderOwner, "writeResultScene");
    const renderPlate = vi.spyOn(renderOwner, "writeComparisonScene");
    const diskIo = vi.spyOn(runOwner, "writeJson");
    const reporting = vi.spyOn(runOwner, "decisionMarkdown");
    const layout = vi.fn(layoutMeasuredFixture);

    const timing = timeMeasuredArm(
      measuredFixtures[0],
      "B",
      2,
      3,
      layout,
    );

    expect(layout).toHaveBeenCalledTimes(5);
    expect(timing.samplesMs).toHaveLength(3);
    expect(canonicalize).not.toHaveBeenCalled();
    expect(score).not.toHaveBeenCalled();
    expect(structural).not.toHaveBeenCalled();
    expect(renderResult).not.toHaveBeenCalled();
    expect(renderPlate).not.toHaveBeenCalled();
    expect(diskIo).not.toHaveBeenCalled();
    expect(reporting).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("accepts only the exact 10/30/5 verification protocol", () => {
    expect(
      parseRunOptions([
        "--verify",
        "--warmups",
        "10",
        "--iterations",
        "30",
        "--fresh-processes",
        "5",
      ]),
    ).toEqual({
      mode: "verify",
      warmups: 10,
      iterations: 30,
      freshProcesses: 5,
    });
    expect(parseRunOptions(["--verify"])).toEqual({
      mode: "verify",
      warmups: 10,
      iterations: 30,
      freshProcesses: 5,
    });
    for (const args of [
      ["--verify", "--warmups", "9"],
      ["--verify", "--iterations", "29"],
      ["--verify", "--fresh-processes", "4"],
    ]) {
      expect(() => parseRunOptions(args)).toThrow(
        /VERIFY_PROTOCOL_MISMATCH:required=10\/30\/5/,
      );
    }
  });

  it("canonicalizes translation, negative zero, and collinear routes", () => {
    const fixture = fixtures[0];
    const placement = planFixture(measuredFixtures[0], "A");
    const shifted = {
      ranks: placement.ranks,
      order: placement.order,
      nodeBounds: Object.fromEntries(
        Object.entries(placement.nodeBounds).map(([id, rect]) => [
          id,
          { ...rect, x: rect.x - 0.004 + 17, y: rect.y + 23 },
        ]),
      ),
      groupBounds: Object.fromEntries(
        Object.entries(placement.groupBounds).map(([id, rect]) => [
          id,
          { ...rect, x: rect.x - 0.004 + 17, y: rect.y + 23 },
        ]),
      ),
    };
    const routes = Object.fromEntries(
      Object.entries(placement.routes).map(([id, points]) => [
        id,
        points.map(([x, y]) => [x - 0.004 + 17, y + 23] as [number, number]),
      ]),
    );
    const canonical = canonicalizeGeometry(fixture, shifted, routes);
    expect(
      Math.min(
        ...Object.values(canonical.groupBounds).map((rect) => rect.x),
      ),
    ).toBe(0);
    expect(JSON.stringify(canonical)).not.toContain("-0");
    expect(
      stripRoute([
        [0, 0],
        [10, 0],
        [20, 0],
        [20, 10],
      ]),
    ).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
    ]);
    expect(
      stripRoute([
        [0, 0],
        [10, 0],
        [5, 0],
        [5, 10],
      ]),
    ).toEqual([
      [0, 0],
      [10, 0],
      [5, 0],
      [5, 10],
    ]);
    expect(() =>
      canonicalizeGeometry(fixture, shifted, {}),
    ).toThrow(/INCOMPLETE_EDGE_SET/);
  });

  it("counts proper crossings separately from touches and overlap", () => {
    const fixture = {
      ...fixtures[0],
      edges: [
        {
          id: "one",
          from: "request",
          to: "scene",
          kind: "primary" as const,
        },
        {
          id: "two",
          from: "context",
          to: "png",
          kind: "primary" as const,
        },
      ],
    };
    expect(
      crossingMetrics(fixture, {
        one: [
          [0, 5],
          [10, 5],
        ],
        two: [
          [5, 0],
          [5, 10],
        ],
      }),
    ).toEqual({ crossings: 1, touches: 0, overlapLength: 0 });
    expect(
      crossingMetrics(fixture, {
        one: [
          [0, 0],
          [10, 0],
        ],
        two: [
          [5, 0],
          [15, 0],
        ],
      }),
    ).toEqual({ crossings: 0, touches: 0, overlapLength: 5 });
  });

  it("fails closed on ranking cycles and same-rank conflicts", () => {
    const fixture = rankingFixture();
    fixture.edges.push({
      id: "back",
      from: "b",
      to: "a",
      kind: "support",
    });
    expect(() => rankFixture(fixture)).toThrow("RANKING_CYCLE");

    const sameRank = rankingFixture();
    sameRank.constraints.push({
      kind: "sameRank",
      nodes: ["a", "b"],
      reason: "adversarial conflict",
    });
    expect(() => rankFixture(sameRank)).toThrow(
      /RANKING_EDGE_WITHIN_SAME_RANK/,
    );

    const beforeConflict = rankingFixture();
    beforeConflict.edges = [];
    beforeConflict.constraints = [
      {
        kind: "sameRank",
        nodes: ["a", "b"],
        reason: "forced equality",
      },
      {
        kind: "before",
        from: "g1",
        to: "g2",
        reason: "conflicting strict order",
      },
    ];
    expect(() => rankFixture(beforeConflict)).toThrow(/BEFORE_CONFLICT/);
  });

  it("enforces sameRank and expanded group-before constraints", () => {
    const fixture = rankingFixture();
    fixture.nodes.push({ id: "a2", group: "g1", title: "A2" });
    fixture.groups[0].members.push("a2");
    fixture.edges = [];
    fixture.constraints = [
      {
        kind: "sameRank",
        nodes: ["a", "a2"],
        reason: "paired inputs",
      },
      {
        kind: "before",
        from: "g1",
        to: "g2",
        reason: "phase order",
      },
    ];
    const { ranks } = rankFixture(fixture);
    expect(ranks.a).toBe(ranks.a2);
    expect(Math.max(ranks.a, ranks.a2)).toBeLessThan(ranks.b);
  });

  it("includes connected and retained members in bucket barycenters", () => {
    const members = ["connected", "retained-one", "retained-two"];
    const previous = new Map([
      ["connected", 2],
      ["retained-one", 0],
      ["retained-two", 1],
    ]);
    const barycenters = new Map<string, number>([["connected", 4]]);
    expect(
      bucketBarycenterScore(
        members,
        (id) => barycenters.get(id) ?? null,
        previous,
      ),
    ).toBeCloseTo((4 + 0 + 1) / 3);
  });

  it("uses only adjacent real edges during four barycenter sweeps", () => {
    const fixture = rankingFixture();
    fixture.nodes.push({ id: "c", group: "g2", title: "C" });
    fixture.groups[1].members.push("c");
    fixture.edges.push(
      { id: "skip", from: "a", to: "c", kind: "feedback" },
    );
    const ranks = { a: 0, b: 1, c: 2 };
    const ordered = barycenterOrder(fixture, ranks);
    expect([...ordered.keys()].sort()).toEqual([0, 1, 2]);
    expect([...ordered.values()].flat().sort()).toEqual(["a", "b", "c"]);
  });

  it("reports routes through unrelated group frames and title bands", () => {
    const fixture = structuralFixture();
    const nodeBounds = {
      source: { x: 24, y: 72, width: 20, height: 20 },
      obstacle: { x: 144, y: 72, width: 20, height: 20 },
      target: { x: 264, y: 72, width: 20, height: 20 },
    };
    const groupBounds = {
      sourceGroup: { x: 0, y: 0, width: 100, height: 140 },
      obstacleGroup: { x: 120, y: 0, width: 100, height: 140 },
      targetGroup: { x: 240, y: 0, width: 100, height: 140 },
    };
    const issues = structuralChecks(
      measureFixture(fixture),
      nodeBounds,
      groupBounds,
      {
        edge: [
          [44, 82],
          [110, 82],
          [110, 30],
          [230, 30],
          [230, 82],
          [264, 82],
        ],
      },
    );
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ROUTE_THROUGH_GROUP",
        "ROUTE_THROUGH_TITLE",
      ]),
    );
  });

  it("is invariant to fixture array order and frozen rename", () => {
    for (const fixture of fixtures) {
      const original = planFixture(measureFixture(fixture), "B");
      const reversed = {
        ...fixture,
        groups: [...fixture.groups].reverse(),
        nodes: [...fixture.nodes].reverse(),
        edges: [...fixture.edges].reverse(),
        constraints: [...fixture.constraints].reverse(),
      };
      expect(
        planFixture(measureFixture(reversed), "B").canonicalSha256,
      ).toBe(original.canonicalSha256);
      const renamedResult = planFixture(
        measureFixture(renameFixture(fixture)),
        "B",
      );
      expect(mapResultIdsBack(renamedResult)).toEqual(
        mapResultIdsBack(original),
      );
    }
  });

  it("produces stable same-process hashes and complete results", () => {
    for (const measured of measuredFixtures) {
      for (const arm of ["A", "B"] as const) {
        const first = planFixture(measured, arm);
        const second = planFixture(measured, arm);
        expect(second.canonicalSha256).toBe(first.canonicalSha256);
        expect(Object.keys(first.nodeBounds).sort()).toEqual(
          measured.fixture.nodes.map((node) => node.id).sort(),
        );
        expect(Object.keys(first.routes).sort()).toEqual(
          measured.fixture.edges.map((edge) => edge.id).sort(),
        );
      }
    }
  });

  it("returns stable pending reasons for every strict ledger failure", () => {
    expectPendingLedger("{", "INVALID_JSON");
    expectPendingMutation(
      (ledger) => Object.assign(ledger, { unexpected: true }),
      "UNKNOWN_KEY",
    );
    for (const mutate of [
      (ledger: VisualReviewLedger) =>
        Object.assign(ledger.renderer, { unexpected: true }),
      (ledger: VisualReviewLedger) =>
        Object.assign(ledger.records[0], { unexpected: true }),
      (ledger: VisualReviewLedger) =>
        Object.assign(ledger.records[0].identity, { unexpected: true }),
      (ledger: VisualReviewLedger) =>
        Object.assign(ledger.records[0].mainReview!, { unexpected: true }),
      (ledger: VisualReviewLedger) =>
        Object.assign(ledger.records[0].qaReview, { unexpected: true }),
      (ledger: VisualReviewLedger) =>
        Object.assign(ledger.records[0].reconciliation, {
          unexpected: true,
        }),
    ]) {
      expectPendingMutation(mutate, "UNKNOWN_KEY");
    }
    expectPendingMutation(
      (ledger) => {
        ledger.schemaVersion = 2 as 1;
      },
      "INVALID_SCHEMA",
    );
    expectPendingMutation(
      (ledger) => ledger.records.pop(),
      "FIXTURE_SET_MISMATCH",
    );
    expectPendingMutation(
      (ledger) => ledger.records[1].fixtureId = ledger.records[0].fixtureId,
      "DUPLICATE_FIXTURE",
    );
    expectPendingMutation(
      (ledger) => ledger.sourceSha256 = sha("stale-source"),
      "SOURCE_MISMATCH",
    );
    expectPendingMutation(
      (ledger) => ledger.renderer.browser = "other browser",
      "RENDERER_MISMATCH",
    );
    expectPendingMutation(
      (ledger) =>
        ledger.records[0].identity.canonicalResultSha256.A =
          sha("stale-result"),
      "RESULT_MISMATCH",
    );
    expectPendingMutation(
      (ledger) =>
        ledger.records[0].identity.sceneSha256.A = sha("stale-scene"),
      "SCENE_MISMATCH",
    );
    expectPendingMutation(
      (ledger) =>
        ledger.records[0].identity.pngSha256.A = sha("stale-png"),
      "PNG_MISMATCH",
    );
    expectPendingMutation(
      (ledger) => ledger.records[0].mainReview = null,
      "INCOMPLETE_MAIN_REVIEW",
    );
    expectPendingMutation(
      (ledger) => {
        ledger.records[0].mainReview!.armB.primaryStory = 3 as 2;
      },
      "INVALID_SCORE",
    );
    expectPendingMutation(
      (ledger) => {
        ledger.records[0].mainReview!.preference = "other" as "B";
      },
      "INVALID_PREFERENCE",
    );
  });

  it("keeps unresolved QA disagreement pending and validates reconciliation", () => {
    const ledger = acceptedVisualLedger();
    const record = ledger.records.find(
      (candidate) => fixtures.find(
        (fixture) => fixture.id === candidate.fixtureId,
      )?.dense,
    )!;
    record.qaReview = {
      status: "disagreed",
      reviewer: "independent-qa",
      armA: score(2),
      armB: { ...score(2), primaryStory: 0 },
      preference: "A",
      rationale: "Independent reviewer sees a failed primary story.",
    };
    record.reconciliation = { status: "pending" };
    const parsed = parseVisualReviewLedger(
      JSON.stringify(ledger),
      visualIdentity,
      fixtures,
    );
    expect(parsed.status).toBe("disputed");
    expect(parsed.pendingReasons).toEqual(["QA_DISAGREEMENT"]);
    expect(evaluateGate(
      fixtures,
      passingResults(),
      passingTimings(),
      parsed,
      deterministicEvidence(),
    )).toMatchObject({
      decision: "pending",
      final: false,
      pendingReasons: ["QA_DISAGREEMENT"],
    });

    record.reconciliation = {
      status: "resolved",
      reviewers: ["wrong-main", "independent-qa"],
      rationale: "Both reviewers reconciled the scoring rationale.",
    };
    expect(
      parseVisualReviewLedger(
        JSON.stringify(ledger),
        visualIdentity,
        fixtures,
      ).pendingReasons,
    ).toEqual(["INVALID_SCHEMA"]);

    const incompatible = acceptedVisualLedger();
    incompatible.records[0].qaReview = {
      status: "agreed",
      reviewer: "independent-qa",
      armA: score(1),
      armB: score(2),
      preference: "B",
      rationale: "Independent reviewer agrees with the complete main review.",
    };
    incompatible.records[0].reconciliation = { status: "pending" };
    expect(
      parseVisualReviewLedger(
        JSON.stringify(incompatible),
        visualIdentity,
        fixtures,
      ).pendingReasons,
    ).toEqual(["INVALID_SCHEMA"]);
  });

  it("disputes QA changes to the Arm A grouping rejection used by ELK eligibility", () => {
    const ledger = acceptedVisualLedger();
    const record = ledger.records.find(
      (candidate) => fixtures.find(
        (fixture) => fixture.id === candidate.fixtureId,
      )?.dense,
    )!;
    record.mainReview = {
      reviewer: "main-orchestrator",
      armA: { ...score(2), primaryStory: 0 },
      armB: score(1),
      preference: "A",
      rationale: "Arm A fails because grouping obscures the primary story.",
    };
    record.qaReview = {
      status: "disagreed",
      reviewer: "independent-qa",
      armA: score(2),
      armB: score(1),
      preference: "A",
      rationale: "Arm A grouping remains readable to the independent reviewer.",
    };
    record.reconciliation = { status: "pending" };

    const parsed = parseVisualReviewLedger(
      JSON.stringify(ledger),
      visualIdentity,
      fixtures,
    );
    expect(parsed).toMatchObject({
      status: "disputed",
      pendingReasons: ["QA_DISAGREEMENT"],
    });
    expect(
      evaluateGate(
        fixtures,
        passingResults(),
        passingTimings(),
        parsed,
        deterministicEvidence(),
      ),
    ).toMatchObject({
      decision: "pending",
      final: false,
      pendingReasons: ["QA_DISAGREEMENT"],
    });
  });

  it("applies exact internal, ELK, stop, and pending precedence", () => {
    const visual = parseVisualReviewLedger(
      JSON.stringify(acceptedVisualLedger()),
      visualIdentity,
      fixtures,
    );
    const timings = passingTimings();
    const deterministic = deterministicEvidence();

    expect(
      evaluateGate(
        fixtures,
        passingResults(),
        timings,
        visual,
        deterministic,
      ),
    ).toMatchObject({
      decision: "internal-planner",
      final: true,
      internalPlannerPassed: true,
      elkEligible: false,
    });

    const noBenefit = passingResults().map((result) => ({
      ...result,
      score: {
        ...result.score,
        crossings:
          result.arm === "B"
            ? resultFor(passingResults(), result.fixtureId, "A").score.crossings
            : result.score.crossings,
      },
    }));
    expect(
      evaluateGate(fixtures, noBenefit, timings, visual, deterministic),
    ).toMatchObject({
      decision: "elk-experiment",
      final: true,
      internalPlannerPassed: false,
      elkEligible: true,
    });

    const noGroupingProblem = noBenefit.map((result) => ({
      ...result,
      score: { ...result.score, crossings: 0 },
    }));
    expect(
      evaluateGate(
        fixtures,
        noGroupingProblem,
        timings,
        visual,
        deterministic,
      ),
    ).toMatchObject({
      decision: "retain-current-layouts",
      final: true,
      elkEligible: false,
    });

    const unsound = passingResults();
    resultFor(unsound, fixtures.find((fixture) => fixture.dense)!.id, "B")
      .structuralIssues = [
        structuralIssue("ROUTE_THROUGH_GROUP"),
      ];
    expect(
      evaluateGate(fixtures, unsound, timings, visual, deterministic),
    ).toMatchObject({
      decision: "retain-current-layouts",
      final: true,
      elkEligible: false,
    });

    const pending = pendingVisualReview(
      visualIdentity,
      fixtures,
      "INCOMPLETE_MAIN_REVIEW",
    );
    expect(
      evaluateGate(
        fixtures,
        noGroupingProblem,
        timings,
        pending,
        deterministic,
      ),
    ).toMatchObject({
      decision: "pending",
      final: false,
      internalPlannerPassed: null,
      elkEligible: null,
      pendingReasons: ["INCOMPLETE_MAIN_REVIEW"],
    });
  });

  it("keeps experiment and milestone registries out of npm tarball", () => {
    const output = execFileSync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      { encoding: "utf8" },
    );
    const [{ files }] = JSON.parse(output) as Array<{
      files: Array<{ path: string }>;
    }>;
    const paths = files.map((file) => file.path);
    expect(
      paths.some((path) => path.startsWith("experiments/plan-graph-v1/")),
    ).toBe(false);
    expect(paths).not.toContain("governance/milestones.md");
    expect(paths).not.toContain("docs/milestones.md");
  });

  it("fails renderer readiness in an empty explicit cache", () => {
    const root = mkdtempSync(join(tmpdir(), "plan-graph-renderer-"));
    expect(rendererReady(root)).toBe(false);
    expect(rendererBrowserReady(root)).toBe(false);
  });
});

function rankingFixture(): Fixture {
  return {
    version: 1,
    id: "ranking",
    title: "Ranking fixture",
    dense: true,
    source: "test",
    groups: [
      { id: "g1", label: "One", members: ["a"] },
      { id: "g2", label: "Two", members: ["b"] },
    ],
    nodes: [
      { id: "a", group: "g1", title: "A" },
      { id: "b", group: "g2", title: "B" },
    ],
    edges: [{ id: "forward", from: "a", to: "b", kind: "primary" }],
    constraints: [],
  };
}

function structuralFixture(): Fixture {
  return {
    version: 1,
    id: "structural",
    title: "Structural fixture",
    dense: true,
    source: "test",
    groups: [
      { id: "sourceGroup", label: "Source", members: ["source"] },
      {
        id: "obstacleGroup",
        label: "Obstacle",
        members: ["obstacle"],
      },
      { id: "targetGroup", label: "Target", members: ["target"] },
    ],
    nodes: [
      { id: "source", group: "sourceGroup", title: "Source" },
      { id: "obstacle", group: "obstacleGroup", title: "Obstacle" },
      { id: "target", group: "targetGroup", title: "Target" },
    ],
    edges: [
      { id: "edge", from: "source", to: "target", kind: "primary" },
    ],
    constraints: [],
  };
}

function evidenceIdentity(catalog: Fixture[]): VisualEvidenceIdentity {
  return {
    sourceSha256: sha("source"),
    renderer: {
      rendererVersion: "0.1.0",
      playwrightVersion: "1.52.0",
      browser: "Chromium test",
      font: "Excalifont:renderer-bundle",
      os: "test-os",
    },
    artifacts: Object.fromEntries(
      catalog.map((fixture) => [
        fixture.id,
        {
          canonicalResultSha256: {
            A: sha(`${fixture.id}:result:A`),
            B: sha(`${fixture.id}:result:B`),
          },
          sceneSha256: {
            A: sha(`${fixture.id}:scene:A`),
            B: sha(`${fixture.id}:scene:B`),
            plate: sha(`${fixture.id}:scene:plate`),
          },
          pngSha256: {
            A: sha(`${fixture.id}:png:A`),
            B: sha(`${fixture.id}:png:B`),
            plate: sha(`${fixture.id}:png:plate`),
          },
        },
      ]),
    ),
  };
}

function acceptedVisualLedger(): VisualReviewLedger {
  const ledger = pendingVisualReview(visualIdentity, fixtures);
  ledger.status = "accepted";
  ledger.pendingReasons = [];
  for (const record of ledger.records) {
    record.mainReview = {
      reviewer: "main-orchestrator",
      armA: score(1),
      armB: score(2),
      preference: "B",
      rationale: "Arm B is clearer on every directly reviewed dimension.",
    };
  }
  return ledger;
}

function score(value: 0 | 1 | 2): VisualReview["armA"] {
  return {
    primaryStory: value,
    groupTitles: value,
    nodeTitlesAndRoutes: value,
  };
}

function expectPendingMutation(
  mutate: (ledger: VisualReviewLedger) => void,
  reason: VisualPendingReason,
): void {
  const ledger = acceptedVisualLedger();
  mutate(ledger);
  expectPendingLedger(JSON.stringify(ledger), reason);
}

function expectPendingLedger(
  text: string,
  reason: VisualPendingReason,
): void {
  const ledger = parseVisualReviewLedger(text, visualIdentity, fixtures);
  expect(ledger.status).not.toBe("accepted");
  expect(ledger.pendingReasons).toEqual([reason]);
  expect(
    evaluateGate(
      fixtures,
      passingResults(),
      passingTimings(),
      ledger,
      deterministicEvidence(),
    ),
  ).toMatchObject({
    decision: "pending",
    final: false,
    pendingReasons: [reason],
  });
}

function passingResults(): PlanGraphResult[] {
  return baselineResults.map((result) => {
    const dense = fixtures.find(
      (fixture) => fixture.id === result.fixtureId,
    )!.dense;
    return {
      ...structuredClone(result),
      score: {
        crossings: dense && result.arm === "A" ? 8 : 0,
        bends: 0,
        normalizedLength: 1,
        normalizedArea: 1,
      },
      reasons: [],
      structuralIssues: [],
      routeDiagnostics: {
        nearMisses: [],
        nonSharedTouches: 0,
        nonSharedOverlapLength: 0,
      },
    };
  });
}

function passingTimings(): TimedArmResult[] {
  return fixtures.flatMap((fixture) =>
    (["A", "B"] as const).map((arm) => ({
      fixtureId: fixture.id,
      arm,
      samplesMs: [1],
      p95Ms: 1,
    })),
  );
}

function deterministicEvidence(): Record<string, boolean> {
  return Object.fromEntries(
    fixtures.flatMap((fixture) =>
      (["A", "B"] as const).map((arm) => [
        `${fixture.id}:${arm}`,
        true,
      ]),
    ),
  );
}

function resultFor(
  results: PlanGraphResult[],
  fixtureId: string,
  arm: "A" | "B",
): PlanGraphResult {
  return results.find(
    (result) => result.fixtureId === fixtureId && result.arm === arm,
  )!;
}

function structuralIssue(
  code: StructuralIssue["code"],
): StructuralIssue {
  return { code, ids: ["test"], message: "test structural issue" };
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function renameFixture(fixture: Fixture): Fixture {
  const rename = (id: string) => `__renamed__${id}`;
  return {
    ...fixture,
    id: rename(fixture.id),
    groups: fixture.groups.map((group) => ({
      ...group,
      id: rename(group.id),
      members: group.members.map(rename),
    })),
    nodes: fixture.nodes.map((node) => ({
      ...node,
      id: rename(node.id),
      group: rename(node.group),
    })),
    edges: fixture.edges.map((edge) => ({
      ...edge,
      id: rename(edge.id),
      from: rename(edge.from),
      to: rename(edge.to),
    })),
    constraints: fixture.constraints.map((constraint) =>
      constraint.kind === "sameRank"
        ? { ...constraint, nodes: constraint.nodes.map(rename) }
        : {
            ...constraint,
            from: rename(constraint.from),
            to: rename(constraint.to),
          },
    ),
  };
}

function mapResultIdsBack(result: PlanGraphResult): unknown {
  const unprefix = (id: string) => id.replace(/^__renamed__/u, "");
  const mapRecord = <T>(record: Record<string, T>) =>
    Object.fromEntries(
      Object.entries(record)
        .map(([id, value]) => [unprefix(id), value] as [string, T])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  return {
    ...result,
    fixtureId: unprefix(result.fixtureId),
    ranks: mapRecord(result.ranks),
    order: mapRecord(result.order),
    nodeBounds: mapRecord(result.nodeBounds),
    groupBounds: mapRecord(result.groupBounds),
    routes: mapRecord(result.routes),
    structuralIssues: result.structuralIssues.map((issue) => ({
      ...issue,
      ids: issue.ids.map(unprefix),
    })),
    routeDiagnostics: {
      ...result.routeDiagnostics,
      nearMisses: result.routeDiagnostics.nearMisses.map((nearMiss) => ({
        ...nearMiss,
        edge: unprefix(nearMiss.edge),
        obstacle: unprefix(nearMiss.obstacle),
      })),
    },
    canonicalSha256: undefined,
  };
}
