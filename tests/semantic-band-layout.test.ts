// W2 of T-145: layout compiler for `flow.band` — measurement, band wrapping, placement.
// Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.1) — S8, S10,
// R3, A8 (a)-(e), A6.
import { describe, expect, it } from "vitest";
import { SCENE_EPOCH, Scene } from "../src/core.js";
import { BandFlowSpec, validateBandFlowSpec } from "../src/semantic-band.js";
import { renderBandLayout } from "../src/semantic-band-render.js";

function spec(overrides: Partial<BandFlowSpec> = {}): BandFlowSpec {
  return {
    template: "flow.band",
    title: "LIVE smoke workflow",
    lanes: [
      { id: "operator", label: "OPERATOR" },
      { id: "workflow", label: "WORKFLOW", sublabel: "orchestration and checks" },
      { id: "agents", label: "FULL AGENT SESSIONS" },
    ],
    stages: [{ id: "intake" }, { id: "prepare" }, { id: "run" }],
    nodes: [
      { id: "request", lane: "operator", stage: "intake", type: "actor", title: "Operator request" },
      { id: "check", lane: "workflow", stage: "intake", type: "decision", title: "Input check" },
      { id: "topic", lane: "workflow", stage: "prepare", type: "step", title: "Use supplied topic" },
      { id: "explore", lane: "agents", stage: "run", type: "agent", title: "Agent: explore" },
      { id: "journal", lane: "workflow", stage: "run", type: "artifact", title: "journal.ndjson" },
    ],
    edges: [
      { from: "request", to: "check" },
      { from: "check", to: "topic" },
      { from: "topic", to: "explore" },
    ],
    ...overrides,
  };
}

function render(input: BandFlowSpec) {
  const validation = validateBandFlowSpec(input);
  expect(validation.ok, JSON.stringify(validation.ok ? [] : validation.diagnostics)).toBe(true);
  if (!validation.ok) {
    throw new Error("spec rejected");
  }
  const scene = new Scene({ seed: 42, now: SCENE_EPOCH, assetRegistry: null });
  const result = renderBandLayout(scene, validation.value);
  return { scene, result };
}

describe("renderBandLayout — placement and metadata", () => {
  it("places every node and reports its band, bounds and elements (R2/R3)", () => {
    const { result } = render(spec());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { metadata } = result.rendered;
    expect(metadata.nodes).toHaveLength(5);
    for (const node of metadata.nodes) {
      expect(node.band).toBe(0);
      expect(node.elementIds.length).toBeGreaterThan(0);
      expect(node.bounds.width).toBeGreaterThan(0);
      expect(node.bounds.height).toBeGreaterThan(0);
    }
    expect(metadata.nodes.map((node) => node.path)).toEqual([
      "$.nodes[0]",
      "$.nodes[1]",
      "$.nodes[2]",
      "$.nodes[3]",
      "$.nodes[4]",
    ]);
    expect(metadata.stages.map((stage) => stage.id)).toEqual(["intake", "prepare", "run"]);
  });

  it("A8(a): a ribbon that fits stays a single band", () => {
    const { result } = render(spec());
    if (!result.ok) {
      throw new Error("render failed");
    }
    expect(result.rendered.metadata.bands).toHaveLength(1);
    expect(result.rendered.metadata.bands[0].stageIds).toEqual(["intake", "prepare", "run"]);
  });

  it("A8(b): a narrower ceiling wraps the same ribbon into a second band", () => {
    const { result } = render(spec({ layout: { maxBandWidth: 900 } }));
    if (!result.ok) {
      throw new Error("render failed");
    }
    const { bands, nodes } = result.rendered.metadata;
    expect(bands.length).toBeGreaterThan(1);
    expect(bands.flatMap((band) => band.stageIds)).toEqual(["intake", "prepare", "run"]);
    // The second band starts below the first — the wrap is vertical, not a wider scene.
    expect(bands[1].bounds.y).toBeGreaterThan(bands[0].bounds.y + bands[0].bounds.height - 1);
    expect(nodes.find((node) => node.id === "explore")!.band).toBe(bands.length - 1);
  });

  it("S10: a lane with no nodes in a band is not drawn in that band", () => {
    const { result } = render(spec({ layout: { maxBandWidth: 900 } }));
    if (!result.ok) {
      throw new Error("render failed");
    }
    const operator = result.rendered.metadata.lanes.find((lane) => lane.id === "operator")!;
    // `operator` only holds a node in the first stage, so it appears in one band only.
    expect(operator.instances.map((instance) => instance.band)).toEqual([0]);
    const workflow = result.rendered.metadata.lanes.find((lane) => lane.id === "workflow")!;
    expect(workflow.instances.length).toBeGreaterThan(1);
  });

  it("A8(d): a ribbon needing more than three bands is rejected", () => {
    const wide = spec({
      stages: Array.from({ length: 12 }, (_, index) => ({ id: `s${index}` })),
      nodes: Array.from({ length: 12 }, (_, index) => ({
        id: `n${index}`,
        lane: index % 2 === 0 ? "operator" : "workflow",
        stage: `s${index}`,
        type: "step" as const,
        title: `Step ${index}`,
      })).concat([
        { id: "agent", lane: "agents", stage: "s0", type: "step" as const, title: "Agent" },
      ]),
      edges: [],
      layout: { maxBandWidth: 900 },
    });
    const validation = validateBandFlowSpec(wide);
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }
    const scene = new Scene({ seed: 42, now: SCENE_EPOCH, assetRegistry: null });
    const result = renderBandLayout(scene, validation.value);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics[0].code).toBe("BAND_COUNT_EXCEEDED");
    expect(result.diagnostics[0].hint).toContain("Split the flow into views");
  });

  it("A8(c): a ceiling too small for one column reports STAGE_TOO_WIDE", () => {
    const validation = validateBandFlowSpec(spec({ layout: { maxBandWidth: 800 } }));
    if (!validation.ok) {
      throw new Error("spec rejected");
    }
    const narrow = { ...validation.value, layout: { maxBandWidth: 400 } };
    const scene = new Scene({ seed: 42, now: SCENE_EPOCH, assetRegistry: null });
    const result = renderBandLayout(scene, narrow);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics[0].code).toBe("STAGE_TOO_WIDE");
  });
});

describe("renderBandLayout — shapes and determinism", () => {
  it("S6: actor is an ellipse, decision a diamond, the rest stay editable cards", () => {
    const { scene, result } = render(spec());
    if (!result.ok) {
      throw new Error("render failed");
    }
    const frameType = (id: string) => result.rendered.nodeFrames.get(id)!.type;
    expect(frameType("request")).toBe("ellipse");
    expect(frameType("check")).toBe("diamond");
    expect(frameType("topic")).toBe("rectangle");
    expect(frameType("journal")).toBe("rectangle");
    // Every element stays a real Excalidraw element, never a flattened image of a card.
    expect(scene.elements.every((element) => typeof element.type === "string")).toBe(true);
  });

  it("A6: the same spec renders byte-identically without freezing the clock", () => {
    const first = render(spec());
    const second = render(spec());
    expect(first.scene.toJson()).toBe(second.scene.toJson());
    expect(first.scene.elements.every((element) => element.updated === SCENE_EPOCH)).toBe(true);
  });

  it("text measured for the shape stays inside it", () => {
    const { result } = render(spec());
    if (!result.ok) {
      throw new Error("render failed");
    }
    const actor = result.rendered.metadata.nodes.find((node) => node.id === "request")!;
    const decision = result.rendered.metadata.nodes.find((node) => node.id === "check")!;
    // A diamond needs twice the box it contains, an ellipse √2 — so the same title
    // yields a taller diamond than ellipse.
    expect(decision.bounds.height).toBeGreaterThan(actor.bounds.height);
  });
});
