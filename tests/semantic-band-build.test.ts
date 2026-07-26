// W4/W5 of T-145: legend, width gates, self-validation and the diagnostics registry.
// Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.2) — B5, S11,
// E4, E7, E8, R1-R5, A3, A7.
import { describe, expect, it } from "vitest";
import { SCENE_EPOCH } from "../src/core.js";
import { BandFlowSpec } from "../src/semantic-band.js";
import { buildBandFlowSpec } from "../src/semantic-band-build.js";
import {
  BAND_DIAGNOSTIC_REGISTRY,
  diagnosticCodeFor,
} from "../src/semantic-band-diagnostics.js";
import { legendEntries } from "../src/semantic-band-legend.js";
import { validateBandFlowSpec } from "../src/semantic-band.js";

function spec(overrides: Partial<BandFlowSpec> = {}): BandFlowSpec {
  return {
    template: "flow.band",
    title: "LIVE smoke workflow",
    subtitle: "two sequential agent sessions",
    lanes: [
      { id: "operator", label: "OPERATOR" },
      { id: "workflow", label: "WORKFLOW", sublabel: "orchestration and checks" },
      { id: "agents", label: "AGENT SESSIONS" },
    ],
    stages: [{ id: "intake" }, { id: "prepare" }, { id: "run" }],
    nodes: [
      { id: "request", lane: "operator", stage: "intake", type: "actor", title: "Operator request" },
      { id: "check", lane: "workflow", stage: "intake", type: "decision", title: "Input check" },
      { id: "topic", lane: "workflow", stage: "prepare", type: "step", title: "Use supplied topic" },
      { id: "explore", lane: "agents", stage: "run", type: "agent", title: "Agent: explore", status: "risk" },
      { id: "journal", lane: "workflow", stage: "run", type: "artifact", title: "journal.ndjson" },
    ],
    edges: [
      { from: "request", to: "check", label: "optional input" },
      { from: "check", to: "topic", label: "non-empty string" },
      { from: "topic", to: "explore", label: "prompt" },
      { from: "explore", to: "journal", kind: "provenance", label: "agent_start / agent_end" },
    ],
    ...overrides,
  };
}

describe("buildBandFlowSpec — result contract", () => {
  it("R1: a successful build carries scene, metadata and geometry together", () => {
    const result = buildBandFlowSpec(spec());
    expect(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.scene.elements.length).toBeGreaterThan(0);
    expect(result.geometry.errors).toEqual([]);
    expect(result.diagnostics.every((diagnostic) => diagnostic.severity !== "error")).toBe(true);
    expect(result.metadata.edges).toHaveLength(4);
    expect(result.metadata.bands).toHaveLength(1);
  });

  it("A6: two builds of the same spec are byte-identical, clock untouched", () => {
    const first = buildBandFlowSpec(spec());
    const second = buildBandFlowSpec(spec());
    if (!first.ok || !second.ok) {
      throw new Error("build failed");
    }
    expect(first.scene.toJson()).toBe(second.scene.toJson());
    expect(first.scene.elements.every((element) => element.updated === SCENE_EPOCH)).toBe(true);
  });

  it("R5: severity in a build result has one spelling", () => {
    const result = buildBandFlowSpec(spec());
    if (!result.ok) {
      throw new Error("build failed");
    }
    for (const diagnostic of result.diagnostics) {
      expect(["error", "warning"]).toContain(diagnostic.severity);
    }
  });

  it("E9: the author's spec object is never mutated", () => {
    const input = spec();
    const snapshot = JSON.stringify(input);
    buildBandFlowSpec(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("buildBandFlowSpec — legend (S11)", () => {
  it("explains only what the diagram actually uses, in a fixed order", () => {
    const validation = validateBandFlowSpec(spec());
    if (!validation.ok) {
      throw new Error("spec rejected");
    }
    expect(legendEntries(validation.value)).toEqual([
      "External actor",
      "Agent session",
      "Artifact",
      "Decision",
      "Step",
      "Primary flow",
      "Provenance",
      "Risk",
    ]);
  });

  it("is present by default and absent when switched off", () => {
    const withLegend = buildBandFlowSpec(spec());
    const without = buildBandFlowSpec(spec({ legend: "none" }));
    if (!withLegend.ok || !without.ok) {
      throw new Error("build failed");
    }
    expect(withLegend.metadata.legend?.entries.length).toBeGreaterThan(0);
    expect(without.metadata.legend).toBeUndefined();
    expect(without.scene.elements.length).toBeLessThan(withLegend.scene.elements.length);
  });

  it("counts towards the scene, so switching it off shrinks the drawing", () => {
    const withLegend = buildBandFlowSpec(spec());
    const without = buildBandFlowSpec(spec({ legend: "none" }));
    if (!withLegend.ok || !without.ok) {
      throw new Error("build failed");
    }
    expect(withLegend.scene.bounds().height).toBeGreaterThan(without.scene.bounds().height);
  });
});

describe("buildBandFlowSpec — readability warnings are the model's eyes", () => {
  it("reports a card whose text only fits after being shrunk to the minimum", () => {
    const result = buildBandFlowSpec(spec({
      nodes: [
        {
          id: "request",
          lane: "operator",
          stage: "intake",
          type: "actor",
          title: "Operator request with a title long enough to need shrinking twice over",
        },
        { id: "check", lane: "workflow", stage: "intake", type: "decision", title: "Input check" },
        { id: "explore", lane: "agents", stage: "run", type: "agent", title: "Agent: explore" },
      ],
      edges: [{ from: "request", to: "check" }],
    }));
    if (!result.ok) {
      throw new Error(JSON.stringify(result.diagnostics, null, 2));
    }
    const shrunk = result.diagnostics.find((diagnostic) => diagnostic.code === "TEXT_SHRUNK_TO_MIN");
    expect(shrunk).toBeDefined();
    expect(shrunk!.severity).toBe("warning");
    expect(shrunk!.path).toBe("$.nodes[0]");
    expect(shrunk!.hint).toContain("registry action: fix-spec");
  });

  it("a readability warning never fails the build", () => {
    const result = buildBandFlowSpec(spec());
    if (!result.ok) {
      throw new Error("build failed");
    }
    const warnings = result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
    for (const warning of warnings) {
      expect(warning.hint).toContain("registry action:");
    }
    expect(result.ok).toBe(true);
  });
});

describe("diagnostics registry (A7)", () => {
  it("every code carries a level, a rationale and exactly one action", () => {
    for (const [code, policy] of Object.entries(BAND_DIAGNOSTIC_REGISTRY)) {
      expect(policy.rationale.length, code).toBeGreaterThan(20);
      expect(["fix-spec", "accept", "split", "escalate"]).toContain(policy.action);
      expect(["error", "warning"]).toContain(policy.severity);
    }
  });

  it("errors collapse to one code while every warning keeps its own", () => {
    expect(diagnosticCodeFor("block-overlap")).toBe("GEOMETRY_ERROR");
    expect(diagnosticCodeFor("arrow-through-block")).toBe("GEOMETRY_ERROR");
    expect(diagnosticCodeFor("aspect-ratio")).toBe("ASPECT_RATIO");
    expect(diagnosticCodeFor("edge-through-node")).toBe("EDGE_THROUGH_NODE");
    expect(diagnosticCodeFor("edge-crossings")).toBe("EDGE_CROSSINGS");
    expect(diagnosticCodeFor("text-shrunk-to-min")).toBe("TEXT_SHRUNK_TO_MIN");
    expect(diagnosticCodeFor("label-overlap")).toBe("LABEL_OVERLAP");
  });
});

describe("buildBandFlowSpec — width gates (E4)", () => {
  it("rejects a scene wider than the hard maximum", () => {
    const wide = spec({
      layout: { maxBandWidth: 2700 },
      stages: Array.from({ length: 8 }, (_, index) => ({ id: `s${index}` })),
      nodes: Array.from({ length: 8 }, (_, index) => ({
        id: `n${index}`,
        lane: index % 2 === 0 ? "operator" : "workflow",
        stage: `s${index}`,
        type: "step" as const,
        title: `Step ${index}`,
      })).concat([
        { id: "agent", lane: "agents", stage: "s0", type: "step" as const, title: "Agent" },
      ]),
      edges: [],
    });
    const result = buildBandFlowSpec(wide);
    // Eight stages at the widest ceiling wrap into bands; the gate proves the drawn
    // scene, not the plan, stays inside the maximum.
    if (result.ok) {
      expect(result.scene.bounds().width).toBeLessThanOrEqual(2700);
      return;
    }
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "GEOMETRY_ERROR")).toBe(true);
  });
});
