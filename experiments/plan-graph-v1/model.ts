import type { Fixture } from "./fixture.js";

export type Arm = "A" | "B";
export type EdgeKind = "primary" | "support" | "feedback";
export type Point = [number, number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MeasuredNode {
  id: string;
  group: string;
  title: string;
  width: number;
  height: number;
  titleX: number;
  titleY: number;
  titleWidth: number;
  titleSize: number;
  titleLineHeight: number;
  titleText: string;
}

export interface MeasuredGroup {
  id: string;
  label: string;
  members: string[];
  padding: number;
  titleHeight: number;
  headerGap: number;
}

export interface GroupMeasurementPolicy {
  owner: "src/layout.ts#section";
  padding: 24;
  titleHeight: 40;
  headerGap: 8;
  sectionGap: 40;
  sectionMinWidth: 360;
  sectionMinHeight: 390;
}

export interface MeasuredFixture {
  fixture: Fixture;
  nodes: Record<string, MeasuredNode>;
  groups: Record<string, MeasuredGroup>;
  measurementPolicy: {
    owner: "src/card.ts#fitCard";
    width: 300;
    minHeight: 112;
    padding: 16;
    titleSize: 17;
    titleMinSize: 13;
    titleMaxLines: 2;
    rows: [];
    iconId: null;
  };
  groupPolicy: GroupMeasurementPolicy;
}

export interface Placement {
  ranks: Record<string, number>;
  order: Record<string, number>;
  nodeBounds: Record<string, Rect>;
  groupBounds: Record<string, Rect>;
}

export type StructuralReason =
  | "CHILD_OUTSIDE_GROUP"
  | "GROUP_INTERSECTION"
  | "INCOMPLETE_EDGE_SET"
  | "INCOMPLETE_GROUP_SET"
  | "INCOMPLETE_NODE_SET"
  | "NODE_GAP"
  | "PRIMARY_RANK_REVERSAL"
  | "ROUTE_ENDPOINT"
  | "ROUTE_THROUGH_GROUP"
  | "ROUTE_THROUGH_NODE"
  | "ROUTE_THROUGH_TITLE";

export type PlannerReason =
  | "BEFORE_CONFLICT"
  | "DUPLICATE_CONSTRAINT_MEMBER"
  | "RANKING_CYCLE"
  | "RANKING_EDGE_WITHIN_SAME_RANK"
  | "UNKNOWN_CONSTRAINT_REFERENCE";

export interface StructuralIssue {
  code: StructuralReason;
  ids: string[];
  message: string;
}

export interface RouteDiagnostics {
  nearMisses: Array<{ edge: string; obstacle: string; distanceBand: "0-6px" }>;
  nonSharedTouches: number;
  nonSharedOverlapLength: number;
}

export interface Score {
  crossings: number;
  bends: number;
  normalizedLength: number;
  normalizedArea: number;
}

export interface PlanGraphResult extends Placement {
  fixtureId: string;
  arm: Arm;
  routes: Record<string, Point[]>;
  score: Score;
  reasons: StructuralReason[];
  structuralIssues: StructuralIssue[];
  routeDiagnostics: RouteDiagnostics;
  canonicalSha256: string;
}

export interface TimedArmResult {
  fixtureId: string;
  arm: Arm;
  samplesMs: number[];
  p95Ms: number;
}

export interface VisualScore {
  primaryStory: 0 | 1 | 2;
  groupTitles: 0 | 1 | 2;
  nodeTitlesAndRoutes: 0 | 1 | 2;
}

export interface VisualReview {
  reviewer: string;
  armA: VisualScore;
  armB: VisualScore;
  preference: "A" | "B" | "tie";
  rationale: string;
}

export interface VisualReviewIdentity {
  canonicalResultSha256: { A: string; B: string };
  sceneSha256: { A: string; B: string; plate: string };
  pngSha256: { A: string; B: string; plate: string };
}

export type QaVisualReview =
  | { status: "not-reviewed" }
  | ({ status: "agreed" | "disagreed" } & VisualReview);

export type VisualReconciliation =
  | { status: "not-required" | "pending" }
  | {
      status: "resolved";
      rationale: string;
      reviewers: [string, string];
    };

export interface VisualReviewRecord {
  fixtureId: string;
  identity: VisualReviewIdentity;
  mainReview: VisualReview | null;
  qaReview: QaVisualReview;
  reconciliation: VisualReconciliation;
}

export type VisualPendingReason =
  | "INVALID_JSON"
  | "UNKNOWN_KEY"
  | "INVALID_SCHEMA"
  | "SOURCE_MISMATCH"
  | "RENDERER_MISMATCH"
  | "FIXTURE_SET_MISMATCH"
  | "DUPLICATE_FIXTURE"
  | "RESULT_MISMATCH"
  | "SCENE_MISMATCH"
  | "PNG_MISMATCH"
  | "INCOMPLETE_MAIN_REVIEW"
  | "INVALID_SCORE"
  | "INVALID_PREFERENCE"
  | "QA_DISAGREEMENT";

export interface VisualReviewLedger {
  schemaVersion: 1;
  status: "pending" | "accepted" | "disputed";
  pendingReasons: VisualPendingReason[];
  sourceSha256: string;
  renderer: Record<string, string>;
  records: VisualReviewRecord[];
}

export interface PendingGateResult {
  decision: "pending";
  final: false;
  internalPlannerPassed: null;
  elkEligible: null;
  failures: string[];
  pendingReasons: VisualPendingReason[];
}

export interface FinalGateResult {
  decision: "internal-planner" | "elk-experiment" | "retain-current-layouts";
  final: true;
  internalPlannerPassed: boolean;
  elkEligible: boolean;
  failures: string[];
  pendingReasons: [];
}

export type GateResult = PendingGateResult | FinalGateResult;
