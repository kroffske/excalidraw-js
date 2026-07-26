// W3 of T-145: typed edges, fail-closed routing and native bindings for `flow.band`.
// Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.1) — S7, E5,
// E7, E8, A4, A8(e).
import { describe, expect, it } from "vitest";
import { SCENE_EPOCH, Scene } from "../src/core.js";
import { Bounds, polylineIntersectsBounds } from "../src/geometry.js";
import { validateNativeBindings } from "../src/bindings.js";
import { BandFlowSpec, validateBandFlowSpec } from "../src/semantic-band.js";
import { renderBandLayout } from "../src/semantic-band-render.js";
import { renderBandEdges } from "../src/semantic-band-edges.js";

function spec(overrides: Partial<BandFlowSpec> = {}): BandFlowSpec {
  return {
    template: "flow.band",
    title: "LIVE smoke workflow",
    lanes: [
      { id: "operator", label: "OPERATOR" },
      { id: "workflow", label: "WORKFLOW" },
      { id: "agents", label: "AGENT SESSIONS" },
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
      { from: "request", to: "check", label: "optional input" },
      { from: "check", to: "topic", label: "non-empty string" },
      { from: "topic", to: "explore", label: "prompt" },
      { from: "explore", to: "journal", kind: "provenance", label: "agent_start / agent_end" },
      { from: "explore", to: "check", kind: "feedback", label: "retry" },
    ],
    ...overrides,
  };
}

function build(input: BandFlowSpec) {
  const validation = validateBandFlowSpec(input);
  expect(validation.ok, JSON.stringify(validation.ok ? [] : validation.diagnostics)).toBe(true);
  if (!validation.ok) {
    throw new Error("spec rejected");
  }
  const scene = new Scene({ seed: 42, now: SCENE_EPOCH, assetRegistry: null });
  const layout = renderBandLayout(scene, validation.value);
  if (!layout.ok) {
    throw new Error(`layout failed: ${layout.diagnostics[0].code}`);
  }
  const edges = renderBandEdges(scene, validation.value, layout.rendered);
  return { scene, layout: layout.rendered, edges };
}

describe("renderBandEdges — relationships and bindings", () => {
  it("routes every edge and reports its geometry (R2)", () => {
    const { edges } = build(spec());
    expect(edges.ok, edges.ok ? "" : edges.diagnostics.map((d) => d.message).join("; ")).toBe(true);
    if (!edges.ok) {
      return;
    }
    expect(edges.edges).toHaveLength(5);
    expect(edges.edges.map((edge) => edge.path)).toEqual([
      "$.edges[0]",
      "$.edges[1]",
      "$.edges[2]",
      "$.edges[3]",
      "$.edges[4]",
    ]);
    for (const edge of edges.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      expect(edge.bound).toBe(true);
      expect(edge.labelBounds).toBeDefined();
    }
  });

  it("A4: every arrow is natively bound, including to the ellipse and the diamond", () => {
    const { scene } = build(spec());
    const bindings = validateNativeBindings(scene.elements);
    expect(bindings.valid, JSON.stringify(bindings.issues)).toBe(true);

    const arrows = scene.elements.filter((element) => element.type === "arrow");
    expect(arrows).toHaveLength(5);
    for (const arrow of arrows) {
      expect(arrow.startBinding).toBeTruthy();
      expect(arrow.endBinding).toBeTruthy();
    }
    const boundTypes = new Set(
      arrows.flatMap((arrow) =>
        [arrow.startBinding, arrow.endBinding].map((binding) => {
          const id = (binding as { elementId: string }).elementId;
          return scene.elements.find((element) => element.id === id)!.type;
        })
      ),
    );
    expect(boundTypes.has("ellipse")).toBe(true);
    expect(boundTypes.has("diamond")).toBe(true);
  });

  it("S7: kind drives the stroke — provenance is thin and dashed, feedback is dashed", () => {
    const { scene, edges } = build(spec());
    if (!edges.ok) {
      throw new Error("edges failed");
    }
    const arrowFor = (index: number) =>
      scene.elements.find((element) => element.id === edges.edges[index].elementIds[0])!;
    expect(arrowFor(0).strokeStyle).toBe("solid");
    expect(arrowFor(3).strokeStyle).toBe("dashed");
    expect(arrowFor(3).strokeWidth).toBe(1);
    expect(arrowFor(4).strokeStyle).toBe("dashed");
    expect(arrowFor(4).strokeWidth).toBe(2);
  });

  it("A6: edges render byte-identically across builds", () => {
    expect(build(spec()).scene.toJson()).toBe(build(spec()).scene.toJson());
  });
});

describe("renderBandEdges — fail-closed routing (E5)", () => {
  it("no rendered edge crosses a node it does not belong to", () => {
    const { layout, edges } = build(spec());
    if (!edges.ok) {
      throw new Error(edges.diagnostics[0].message);
    }
    for (const [index, edge] of edges.edges.entries()) {
      const { from, to } = spec().edges[index];
      for (const [id, bounds] of layout.nodeBounds) {
        if (id === from || id === to) {
          continue;
        }
        const inner = new Bounds(
          bounds.x + 2,
          bounds.y + 2,
          bounds.width - 4,
          bounds.height - 4,
        );
        expect(
          polylineIntersectsBounds(edge.points, inner),
          `${from} -> ${to} crosses ${id}`,
        ).toBe(false);
      }
    }
  });

  it("A8(e): when every strategy is blocked the diagram is still produced, with a warning", () => {
    // A wall spanning the whole band: no strategy can avoid it. Refusing to draw would
    // leave the author with nothing, so the least-bad route is kept and reported.
    const validation = validateBandFlowSpec(spec());
    if (!validation.ok) {
      throw new Error("spec rejected");
    }
    const scene = new Scene({ seed: 42, now: SCENE_EPOCH, assetRegistry: null });
    const layout = renderBandLayout(scene, validation.value);
    if (!layout.ok) {
      throw new Error("layout failed");
    }
    const band = layout.rendered.metadata.bands[0].bounds;
    const walled = {
      ...layout.rendered,
      nodeBounds: new Map(layout.rendered.nodeBounds).set(
        "wall",
        new Bounds(band.x, band.y, band.width, band.height),
      ),
    };
    const blocked = renderBandEdges(scene, validation.value, walled);
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) {
      return;
    }
    expect(blocked.edges).toHaveLength(5);
    expect(blocked.warnings.length).toBeGreaterThan(0);
    const first = blocked.warnings[0];
    expect(first.code).toBe("edge-through-node");
    expect(first.path).toBe("$.edges[0]");
    expect(first.message).toContain("wall");
    expect(first.message).toContain("routing strategies were tried");
    expect(first.hint).toContain("stage or lane");
    expect(first.ids).toContain("wall");
  });

  it("a clean layout produces no crossing warnings at all", () => {
    const { edges } = build(spec());
    if (!edges.ok) {
      throw new Error(edges.diagnostics[0].message);
    }
    expect(edges.warnings).toEqual([]);
  });
});
