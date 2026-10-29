import { describe, expect, it, vi } from "vitest";
import { AssetRegistry, Colors, Scene, diagram } from "../src/index.js";
import { elementBounds } from "../src/geometry.js";
import { GraphDefinitionError, type GraphEdgeSpec, type GraphNodeSpec, type GraphSpec } from "../src/graph-definition.js";

describe("diagram.flow GraphSpec API", () => {
  it("builds a Reaper-like two-row flow from named nodes, rows, notes, edges, and overrides", () => {
    const scene = new Scene({ seed: 20260629, assetRegistry: AssetRegistry.bundled() });
    const g = diagram.flow(scene, {
      title: "Reaper integration - one supervised-loop tick",
      subtitle: "Signal claim then advisory risk resize for OPEN-intent only.",
      theme: diagram.theme({
        base: "mono-blue",
        accents: { risk: "#b45309", changed: "#7c3aed" },
      }),
      defaults: {
        node: { width: 300, strict: true },
        edge: { label: { width: 160, maxLines: 2, overflow: "ellipsis" } },
        layout: { preset: "two-row-flow", columnGap: 84, rowGap: 104 },
      },
    });

    g.node("dataContext", {
      title: "DataContext",
      bullets: ["per instrument / aso"],
    });
    g.node("reaperSignalProvider", {
      title: "ReaperSignalProvider",
      bullets: ["async_generate", "impolite scan"],
    });
    g.node("algoInsightSignal", {
      title: "generate_algoinsight_signal",
      bullets: ["external -> signal"],
    });
    g.node("executionIntent", {
      title: "ExecutionIntent",
      bullets: ["OPEN or CLOSE", "pref risk"],
    });
    g.node("approveBatch", {
      title: "approve_batch_with_optional_reaper",
      role: "changed",
      bullets: ["OPEN -> resize to cap", "max_position_size"],
    });
    g.node("portfolioRiskCoordinator", {
      title: "PortfolioRiskCoordinator",
      role: "risk",
      bullets: ["single writer", "native risk"],
    });

    g.row("claim", ["dataContext", "reaperSignalProvider", "algoInsightSignal"]);
    g.row("execution", ["portfolioRiskCoordinator", "approveBatch", "executionIntent"]);
    g.edge("dataContext", "reaperSignalProvider", { label: "context" });
    g.edge("reaperSignalProvider", "algoInsightSignal", { label: "async generate" });
    g.edge("algoInsightSignal", "executionIntent", { label: "signal input", direction: "top-down" });
    g.edge("executionIntent", "approveBatch", { label: "OPEN intent", direction: "right-to-left" });
    g.edge("approveBatch", "portfolioRiskCoordinator", {
      label: "reduced size",
      kind: "risk",
      direction: "right-to-left",
    });
    g.note("openOnly", {
      title: "OPEN-only",
      bullets: ["CLOSE passes straight to native risk", "resize < min qty -> reject"],
      width: 300,
    }).attachTo("approveBatch", { side: "bottom", dx: 36 });
    g.note("provenance", {
      title: "provenance",
      bullets: ["reaper in RiskDecision.attributes", "provider run status"],
      width: 290,
    }).attachTo("portfolioRiskCoordinator", { side: "bottom", dx: -36 });
    g.annotation("annotation", {
      items: [
        { text: "normal flow", role: "default" },
        { text: "changed integration", role: "changed" },
        { text: "native risk", role: "risk" },
        { text: "notes and provenance", role: "note" },
      ],
    });
    g.applyOverrides({
      nodes: {
        approveBatch: { width: 340 },
        provenance: { dy: 12 },
      },
      edges: {
        "approveBatch->portfolioRiskCoordinator": {
          labelOffset: { dx: -12 },
        },
      },
    });

    const result = g.layout();
    const health = g.assertHealthy();

    expect(health.ok).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
    expect(Object.keys(result.nodes)).toEqual([
      "dataContext",
      "reaperSignalProvider",
      "algoInsightSignal",
      "portfolioRiskCoordinator",
      "approveBatch",
      "executionIntent",
    ]);
    expect(Object.keys(result.notes)).toEqual(["openOnly", "provenance", "annotation"]);
    expect(result.noteConnectors).toHaveLength(2);
    expect(result.nodes.approveBatch.bounds.width).toBe(340);
    expect(result.notes.annotation.bounds.left).toBeGreaterThan(result.notes.provenance.bounds.left);
    expect(result.notes.annotation.bounds.width).toBeLessThanOrEqual(190);
    expect(result.notes.annotation.bounds.height).toBeLessThanOrEqual(110);
    expect(result.notes.openOnly.block.elements.filter((element) => element.type === "line")).toHaveLength(3);
    expect(result.notes.provenance.block.elements.filter((element) => element.type === "line")).toHaveLength(3);
    expect(result.notes.annotation.block.elements.some((element) => element.type === "line")).toBe(false);
    expect(result.edges.map((edge) => edge.id)).toContain("approveBatch->portfolioRiskCoordinator");
    expect(scene.elements.some((element) => element.type === "text" && String(element.text).includes("OPEN"))).toBe(true);
    expect(scene.elements.some((element) => element.type === "text" && String(element.text).includes(" - normal flow"))).toBe(false);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "normal flow" && element.strokeColor === Colors.default)).toBe(true);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "changed integration" && element.strokeColor === Colors.changed)).toBe(true);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "native risk" && element.strokeColor === Colors.risk)).toBe(true);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "normal flow" && element.fontSize === 11)).toBe(true);
  });

  it("accepts a data-only GraphSpec and auto-splits two-row-flow nodes", () => {
    const scene = new Scene({ seed: 20260630 });
    const result = diagram.flow(scene, {
      defaults: {
        node: { width: 260 },
        layout: { preset: "two-row-flow", columnGap: 64, rowGap: 84 },
      },
      nodes: {
        a: { title: "Source", bullets: ["input"] },
        b: { title: "Transform", bullets: ["normalize"] },
        c: { title: "Validate", bullets: ["risk gate"] },
        d: { title: "Sink", bullets: ["output"] },
      },
      edges: [
        { from: "a", to: "b", label: "feed" },
        { from: "b", to: "c", label: "check" },
        { from: "c", to: "d", label: "write" },
      ],
      notes: {
        n1: { title: "note", bullets: ["attached by id"], attachTo: "c", side: "right" },
      },
    }).layout();

    expect(result.validation.ok).toBe(true);
    expect(Object.keys(result.nodes)).toEqual(["a", "b", "c", "d"]);
    expect(result.nodes.c.bounds.top).toBeGreaterThan(result.nodes.a.bounds.bottom);
    expect(result.notes.n1.bounds.left).toBeGreaterThan(result.nodes.c.bounds.right);
    expect(result.noteConnectors).toHaveLength(1);
    expect(result.edges).toHaveLength(3);
  });

  it("keeps short annotation rows single-line and uses a compact frame", () => {
    const scene = new Scene({ seed: 20260701 });
    const result = diagram.flow(scene, {
      nodes: {
        source: { title: "Source", bullets: ["small node"] },
      },
      annotations: {
        annotation: {
          title: "legend",
          items: [
            { text: "normal flow", role: "default" },
            { text: "changed path", role: "changed" },
          ],
        },
      },
    }).layout();

    const annotation = result.notes.annotation;
    const rowTexts = annotation.texts
      .map((element) => String(element.text ?? ""))
      .filter((text) => text !== "legend");

    expect(result.validation.ok).toBe(true);
    expect(annotation.bounds.width).toBeLessThan(190);
    expect(rowTexts).toEqual(["normal flow", "changed path"]);
    expect(rowTexts.some((text) => text.includes("\n"))).toBe(false);
    for (const text of annotation.texts) {
      const bounds = elementBounds(text);
      expect(bounds.right).toBeLessThanOrEqual(annotation.bounds.right + 1);
      expect(bounds.bottom).toBeLessThanOrEqual(annotation.bounds.bottom + 1);
    }
  });

  it("wraps long annotation rows and grows height without escaping the frame", () => {
    const scene = new Scene({ seed: 20260702 });
    const result = diagram.flow(scene, {
      defaults: { layout: { strictNoOverlap: false } },
      nodes: {
        source: { title: "Source", bullets: ["small node"] },
      },
      annotations: {
        annotation: {
          title: "review",
          maxWidth: 180,
          items: [
            {
              text: "CLOSE passes straight to native risk while OPEN advisory resize keeps provenance attached",
              role: "note",
            },
          ],
        },
      },
    }).layout();

    const annotation = result.notes.annotation;
    const longRow = annotation.texts.find((element) => String(element.text ?? "").includes("CLOSE"));

    expect(result.validation.errors).toHaveLength(0);
    expect(annotation.bounds.width).toBeLessThanOrEqual(180);
    expect(annotation.bounds.height).toBeGreaterThan(70);
    expect(String(longRow?.text ?? "")).toContain("\n");
    for (const text of annotation.texts) {
      const bounds = elementBounds(text);
      expect(bounds.left).toBeGreaterThanOrEqual(annotation.bounds.left - 1);
      expect(bounds.right).toBeLessThanOrEqual(annotation.bounds.right + 1);
      expect(bounds.bottom).toBeLessThanOrEqual(annotation.bounds.bottom + 1);
    }
  });

  it("honors explicit annotation width", () => {
    const scene = new Scene({ seed: 20260703 });
    const result = diagram.flow(scene, {
      nodes: {
        source: { title: "Source", bullets: ["small node"] },
      },
      annotations: {
        annotation: {
          width: 260,
          items: ["explicit width"],
        },
      },
    }).layout();

    expect(result.validation.ok).toBe(true);
    expect(result.notes.annotation.bounds.width).toBe(260);
  });

  it("throws a strict error when annotation content cannot fit the max height", () => {
    const scene = new Scene({ seed: 20260704 });
    const g = diagram.flow(scene, {
      nodes: {
        source: { title: "Source", bullets: ["small node"] },
      },
      annotations: {
        annotation: {
          maxWidth: 140,
          maxHeight: 40,
          strict: true,
          items: [
            "this intentionally long annotation must wrap into more rows than the strict height allows",
          ],
        },
      },
    });

    expect(() => g.layout()).toThrowError(/annotation/);
  });
});


describe("diagram.flow declaration snapshot", () => {
  it("takes an independent snapshot without calling layout or emitting native elements", () => {
    const scene = new Scene({ seed: 76 });
    const graph = diagram.flow(scene);
    graph.edge("source", "sink", { id: "send", label: "Sends", data: { condition: "ready", evidence: ["source.ts"] } });
    graph.node("sink", { title: "Sink" }).node("source", { title: "Source" });
    const layout = vi.spyOn(graph, "layout");
    const snapshot = graph.snapshot();
    expect(layout).not.toHaveBeenCalled();
    expect(scene.elements).toEqual([]);
    snapshot.nodes[0].spec.title = "Exported copy";
    expect(graph.snapshot().nodes[0].spec.title).toBe("Sink");
    const declared = graph.snapshot();
    graph.layout();
    const elementCount = scene.elements.length;
    expect(graph.snapshot()).toEqual(declared);
    expect(scene.elements).toHaveLength(elementCount);
    expect(graph.layout()).toBe(graph.layout());
    expect(() => graph.node("late", { title: "Too late" })).toThrow(/already been laid out/);
  });

  it("retains node/note/options references, shallow edge copies and copied rows before layout", () => {
    const scene = new Scene({ seed: 77 });
    const options: GraphSpec = { title: "Original title", defaults: { node: { width: 260 } } };
    const graph = diagram.flow(scene, options);
    const source: GraphNodeSpec = { title: "Original source", bullets: ["Original responsibility"] };
    const edge: Omit<GraphEdgeSpec, "from" | "to"> = { id: "send", label: "Original label", data: { revision: 1 } };
    const note = { title: "Original note", bullets: ["Original evidence"] };
    const row = ["a", "b"];
    graph.node("a", source).node("b", { title: "Sink" });
    graph.edge("a", "b", edge);
    graph.row("main", row);
    graph.note("review", note).attachTo("a", { side: "bottom" });
    graph.note("loose", note);
    const before = graph.snapshot();
    source.title = "Changed source";
    source.bullets!.push("Later responsibility");
    edge.label = "Changed caller label";
    (edge.data as { revision: number }).revision = 2;
    note.title = "Changed caller note";
    note.bullets.push("Later evidence");
    row.reverse();
    options.title = "Changed title";
    options.defaults!.node!.width = 280;
    const declared = graph.snapshot();
    expect(before.nodes[0].spec.title).toBe("Original source");
    expect(declared.edges[0]).toMatchObject({ label: "Original label", data: { revision: 2 } });
    expect(declared.rows).toEqual([{ id: "main", nodes: ["a", "b"] }]);
    expect(declared.notes[0].spec.title).toBe("Original note"); // attachTo made the same shallow copy as legacy.
    expect(declared.notes[1].spec.title).toBe("Changed caller note");
    const result = graph.layout();
    expect(Object.keys(result.nodes)).toEqual(["a", "b"]);
    expect(result.nodes.a.bounds.width).toBe(280);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "Changed source")).toBe(true);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "Changed title")).toBe(true);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "Original label")).toBe(true);
    expect(scene.elements.some((element) => element.type === "text" && element.text === "Changed caller label")).toBe(false);
  });

  it("does not impose snapshot JSON/parallel-edge rules on existing layout callers", () => {
    const scene = new Scene({ seed: 78 });
    const graph = diagram.flow(scene);
    graph.node("a", { title: "A", data: { ignoredByLayout: undefined } as any }).node("b", { title: "B" });
    graph.edge("a", "b").edge("a", "b");
    expect(() => graph.snapshot()).toThrow(GraphDefinitionError);
    const result = graph.layout();
    expect(result.edges.map(({ id }) => id)).toEqual(["a->b", "a->b"]);
    expect(result.nodes.a.bounds.width).toBe(320);
  });

  it("retains previous node overrides when a later optional override is undefined", () => {
    const graph = diagram.flow(new Scene({ seed: 79 }));
    graph.node("a", { title: "A" });
    graph.applyOverrides({ nodes: { a: { width: 280 } } });
    graph.applyOverrides({ nodes: undefined, edges: {} });
    expect(graph.layout().nodes.a.bounds.width).toBe(280);
  });
});


describe("legacy constructor accessor contract", () => {
  it("reads a nodes accessor during construction exactly once and never again for snapshot/layout", () => {
    const events: string[] = ["before constructor"];
    const source = { get nodes() { events.push("nodes getter"); return { a: { title: "A" } }; } };
    const scene = new Scene({ seed: 80 });
    const graph = diagram.flow(scene, source);
    events.push("after constructor");
    expect(events).toEqual(["before constructor", "nodes getter", "after constructor"]);
    expect(scene.elements).toEqual([]);
    expect(() => graph.snapshot()).toThrow(GraphDefinitionError);
    expect(events).toEqual(["before constructor", "nodes getter", "after constructor"]);
    expect(Object.keys(graph.layout().nodes)).toEqual(["a"]);
    expect(events).toEqual(["before constructor", "nodes getter", "after constructor"]);
  });

  it("preserves eager collection/member reads in the original constructor order", () => {
    const events: string[] = [];
    const graph = diagram.flow(new Scene({ seed: 81 }), {
      get nodes() { events.push("nodes"); return { get a() { events.push("node a"); return { title: "A" }; } }; },
      get rows() { events.push("rows"); return { main: ["a"] }; },
      get edges() { events.push("edges"); return []; },
      get notes() { events.push("notes"); return {}; },
      get annotations() { events.push("annotations"); return {}; },
      get overrides() { events.push("overrides"); return {}; },
    });
    expect(events).toEqual(["nodes", "node a", "rows", "edges", "notes", "annotations", "overrides", "overrides"]);
    expect(() => graph.snapshot()).toThrow(GraphDefinitionError);
    expect(Object.keys(graph.layout().nodes)).toEqual(["a"]);
    expect(events).toEqual(["nodes", "node a", "rows", "edges", "notes", "annotations", "overrides", "overrides"]);
  });
});


describe("legacy nullish constructor collections", () => {
  it.each(["nodes", "rows", "edges", "notes", "annotations", "overrides"] as const)(
    "keeps nullish %s valid for legacy layout while refusing its snapshot", (key) => {
      for (const value of [undefined, null]) {
        const graph = diagram.flow(new Scene({ seed: 82 }), { [key]: value } as any);
        expect(() => graph.snapshot()).toThrow(GraphDefinitionError);
        expect(Object.keys(graph.layout().nodes)).toEqual([]);
      }
    },
  );

  it("keeps the original constructor failure for sparse legacy edges", () => {
    expect(() => diagram.flow(new Scene({ seed: 83 }), { edges: new Array(2) })).toThrow(TypeError);
  });
});
