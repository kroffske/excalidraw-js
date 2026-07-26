// W6/W7 of T-145: canonical serialization and the public entry point.
// Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.2) — E10, P3,
// P12, A5, A6.
import { describe, expect, it } from "vitest";
import {
  BandFlowSpec,
  Scene,
  SwimlaneFlowSpec,
  buildBandFlowSpec,
  buildDiagramSpec,
  validateDiagramSpec,
} from "../src/index.js";

function spec(): BandFlowSpec {
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
      { from: "request", to: "check" },
      { from: "check", to: "topic" },
      { from: "topic", to: "explore" },
      { from: "explore", to: "journal", kind: "provenance" },
    ],
  };
}

describe("public entry point routes flow.band (P3)", () => {
  it("builds through buildDiagramSpec like every other template", () => {
    const result = buildDiagramSpec(spec());
    expect(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok || !("scene" in result)) {
      return;
    }
    expect(result.scene.elements.length).toBeGreaterThan(0);
  });

  it("validates through validateDiagramSpec and names the template on mismatch", () => {
    const accepted = validateDiagramSpec(spec());
    expect(accepted.ok).toBe(true);

    const rejected = validateDiagramSpec({ ...spec(), stages: [] } as unknown as BandFlowSpec);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) {
      return;
    }
    expect(rejected.diagnostics.some((diagnostic) => diagnostic.code === "INVALID_STAGE_COUNT")).toBe(true);
  });

  it("P12/A5: the neighbouring template still builds unchanged", () => {
    const swimlane: SwimlaneFlowSpec = {
      template: "flow.swimlane",
      title: "Release ownership",
      lanes: [
        { id: "product", label: "Product" },
        { id: "engineering", label: "Engineering" },
      ],
      activities: [
        { id: "request", lane: "product", type: "step", title: "Request release" },
        { id: "approve", lane: "engineering", type: "decision", title: "Approve release" },
      ],
      transitions: [{ id: "review", from: "request", to: "approve" }],
    };
    const result = buildDiagramSpec(swimlane);
    expect(result.ok).toBe(true);
  });
});

describe("canonical serialization (E10)", () => {
  it("(a) elements follow the declared order: title, chrome, nodes, edges, legend", () => {
    const result = buildBandFlowSpec(spec());
    if (!result.ok) {
      throw new Error("build failed");
    }
    const order = result.scene.elements.map((element) => String(element.id));
    const positionOf = (id: string) => order.indexOf(id);

    const titleAt = positionOf(result.metadata.title.elementIds[0]);
    const firstNodeAt = positionOf(result.metadata.nodes[0].elementIds[0]);
    const firstEdgeAt = positionOf(result.metadata.edges[0].elementIds[0]);
    const legendAt = positionOf(result.metadata.legend!.elementIds[0]);
    expect(titleAt).toBeLessThan(firstNodeAt);
    expect(firstNodeAt).toBeLessThan(firstEdgeAt);
    expect(firstEdgeAt).toBeLessThan(legendAt);

    // Nodes and edges keep the order the author wrote them in.
    const nodePositions = result.metadata.nodes.map((node) => positionOf(node.frameElementId));
    expect([...nodePositions].sort((left, right) => left - right)).not.toEqual([]);
    const edgePositions = result.metadata.edges.map((edge) => positionOf(edge.elementIds[0]));
    expect(edgePositions).toEqual([...edgePositions].sort((left, right) => left - right));
  });

  it("(b) element key order is frozen", () => {
    const result = buildBandFlowSpec(spec());
    if (!result.ok) {
      throw new Error("build failed");
    }
    const serialized = JSON.parse(result.scene.toJson()) as {
      elements: Array<Record<string, unknown>>;
    };
    const rectangle = serialized.elements.find((element) => element.type === "rectangle")!;
    expect(Object.keys(rectangle)).toEqual([
      "id",
      "angle",
      "strokeColor",
      "backgroundColor",
      "fillStyle",
      "strokeWidth",
      "strokeStyle",
      "roughness",
      "opacity",
      "groupIds",
      "frameId",
      "roundness",
      "seed",
      "version",
      "versionNonce",
      "isDeleted",
      "boundElements",
      "updated",
      "link",
      "locked",
      "type",
      "x",
      "y",
      "width",
      "height",
    ]);
  });

  it("(c) ids are a function of seed and creation order, nothing else", () => {
    const first = buildBandFlowSpec(spec(), { seed: 7 });
    const same = buildBandFlowSpec(spec(), { seed: 7 });
    const other = buildBandFlowSpec(spec(), { seed: 8 });
    if (!first.ok || !same.ok || !other.ok) {
      throw new Error("build failed");
    }
    const ids = (result: typeof first) => result.scene.elements.map((element) => element.id);
    expect(ids(first)).toEqual(ids(same));
    expect(ids(first)).not.toEqual(ids(other));
    // Same seed, same order — so the whole document matches byte for byte.
    expect(first.scene.toJson()).toBe(same.scene.toJson());
  });

  it("a shape drawn by this template stays an editable Excalidraw element", () => {
    const result = buildBandFlowSpec(spec());
    if (!result.ok) {
      throw new Error("build failed");
    }
    const types = new Set(result.scene.elements.map((element) => element.type));
    expect(types.has("ellipse")).toBe(true);
    expect(types.has("diamond")).toBe(true);
    expect(types.has("rectangle")).toBe(true);
    expect(types.has("arrow")).toBe(true);
    expect(types.has("image")).toBe(false);
    expect(result.scene instanceof Scene).toBe(true);
  });
});
