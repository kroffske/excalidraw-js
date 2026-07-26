// Machine-readable registry of every geometry finding a `flow.band` build can report.
// Contract: docs/system-design/flow-band/flow-band-contract.md §6 (registry), R5, A7, A12.
// A warning is not technical debt — it is how a model that cannot look at the PNG learns
// the drawing is bad. So every code carries the one action its author should take.
import type { DiagramDiagnosticCode } from "./semantic-schema.js";
import type { ValidationCode } from "./validate.js";

/** The single action an authoring model should take. Closed set on purpose (D3). */
export type DiagnosticAction = "fix-spec" | "accept" | "split" | "escalate";

/** Codes the band compiler computes itself, on top of the shared geometry validator. */
export type BandOnlyCode =
  | "aspect-ratio"
  | "edge-crossings"
  | "text-shrunk-to-min"
  | "edge-through-node";

export type BandGeometryCode = ValidationCode | BandOnlyCode;

export interface DiagnosticPolicy {
  severity: "error" | "warning";
  /** Why this level and not the other — the argument, not a restatement of the code. */
  rationale: string;
  action: DiagnosticAction;
}

/**
 * Exhaustive by construction: a new `ValidationCode` or band code without a row here
 * fails typecheck, which is what keeps the registry from drifting out of date.
 */
export const BAND_DIAGNOSTIC_REGISTRY: Record<BandGeometryCode, DiagnosticPolicy> = {
  "text-overflow": {
    severity: "error",
    rationale: "text is lost, which is a hard guarantee rather than a readability goal",
    action: "fix-spec",
  },
  "text-outside-frame": {
    severity: "error",
    rationale: "text detached from its card reads as belonging to nothing",
    action: "fix-spec",
  },
  "block-overlap": {
    severity: "error",
    rationale: "two independent meanings drawn on top of each other cannot be read apart",
    action: "split",
  },
  "arrow-through-block": {
    severity: "error",
    rationale: "an arrow crossing a card it does not touch is attributed to that card",
    action: "fix-spec",
  },
  "output-clipped": {
    severity: "error",
    rationale: "part of the result is missing from the produced scene",
    action: "escalate",
  },
  "label-overlap": {
    severity: "warning",
    rationale: "the post-pass separated the labels as far as their lines allow; the rest is cosmetic",
    action: "fix-spec",
  },
  "aspect-ratio": {
    severity: "warning",
    rationale: "a very wide or very tall scene is hard to read at fit-to-window, but it is not wrong",
    action: "accept",
  },
  "edge-crossings": {
    severity: "warning",
    rationale: "edges crossing each other are the main way a valid scene becomes unreadable",
    action: "fix-spec",
  },
  "edge-through-node": {
    severity: "warning",
    rationale:
      "every routing strategy was tried and the crossing is unavoidable; refusing to draw"
      + " would leave the author with nothing instead of a named defect",
    action: "fix-spec",
  },
  "text-shrunk-to-min": {
    severity: "warning",
    rationale: "the text fits only because it was shrunk to the minimum size, silently",
    action: "fix-spec",
  },
};

export function diagnosticPolicy(code: BandGeometryCode): DiagnosticPolicy {
  return BAND_DIAGNOSTIC_REGISTRY[code];
}

/**
 * Geometry findings are named in kebab-case by the shared validator; the diagnostics
 * channel uses the package-wide SCREAMING_SNAKE codes. Errors all collapse into
 * `GEOMETRY_ERROR` (R4) — a failed build points at the scene, not at a taxonomy — while
 * every warning keeps its own code, because that code is what an author repairs by.
 */
export function diagnosticCodeFor(code: BandGeometryCode): DiagramDiagnosticCode {
  if (BAND_DIAGNOSTIC_REGISTRY[code].severity === "error") {
    return "GEOMETRY_ERROR";
  }
  switch (code) {
    case "label-overlap":
      return "LABEL_OVERLAP";
    case "aspect-ratio":
      return "ASPECT_RATIO";
    case "edge-crossings":
      return "EDGE_CROSSINGS";
    case "edge-through-node":
      return "EDGE_THROUGH_NODE";
    case "text-shrunk-to-min":
      return "TEXT_SHRUNK_TO_MIN";
    default:
      return "GEOMETRY_ERROR";
  }
}
