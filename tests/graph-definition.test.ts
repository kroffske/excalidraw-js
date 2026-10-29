import { describe, expect, it } from "vitest";
import { GraphDefinition, GraphDefinitionError, type GraphNodeSpec, type JsonValue } from "../src/graph-definition.js";

function graphWithData(data: unknown): GraphDefinition {
  return new GraphDefinition().node("a", { title: "A", data: data as JsonValue });
}

function refusal(run: () => unknown, code: string, path?: string): void {
  try {
    run();
    expect.fail("Expected a graph declaration refusal");
  } catch (error) {
    expect(error).toBeInstanceOf(GraphDefinitionError);
    expect(error).toMatchObject({ name: "GraphDefinitionError", code, ...(path ? { path } : {}) });
  }
}

describe("GraphDefinition declarations", () => {
  it("exports the whole graph before layout, preserving order, payload and missing fields", () => {
    const records = {
      a: { id: "a", label: "Source", body: ["First", "Second"], technical: { language: "TS" }, status: "current" },
      b: { id: "b", label: "Worker", evidence: [{ path: "worker.ts", lines: [1, 3] }] },
      c: { id: "c", label: "Sink", parent: "a" },
    };
    const edge = { id: "ab", from: "a", to: "b", label: "Sends", condition: "ready", evidence: ["first", "second"] };
    const graph = new GraphDefinition();
    graph.edge("a", "b", { id: "ab", label: "Sends", data: edge });
    graph.edge("a", "b", { id: "ab-alternate", label: "Retries", data: { status: "proposed" } });
    graph.edge("a", "c", { id: "ac", label: "Branches" });
    graph.edge("b", "c", { id: "bc", label: "Merges" });
    graph.edge("c", "a", { id: "ca", label: "Feedback" });
    for (const id of ["c", "a", "b"] as const) graph.node(id, { title: records[id].label, data: records[id] });
    const snapshot = graph.snapshot();
    expect(snapshot).toEqual({
      format: "excalidraw-flow", version: 1,
      nodes: ["c", "a", "b"].map((id) => ({ id, spec: { title: records[id as keyof typeof records].label, data: records[id as keyof typeof records] } })),
      edges: [
        { from: "a", to: "b", id: "ab", label: "Sends", data: edge },
        { from: "a", to: "b", id: "ab-alternate", label: "Retries", data: { status: "proposed" } },
        { from: "a", to: "c", id: "ac", label: "Branches" },
        { from: "b", to: "c", id: "bc", label: "Merges" },
        { from: "c", to: "a", id: "ca", label: "Feedback" },
      ], rows: [], notes: [], options: {},
    });
    expect(Object.hasOwn(snapshot.nodes[0].spec, "body")).toBe(false);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("isolates each snapshot from input mutations and from other snapshots", () => {
    const data = { id: "a", nested: { values: ["original"] } };
    const node: GraphNodeSpec = { title: "Original", data };
    const graph = new GraphDefinition().node("a", node);
    const first = graph.snapshot();
    node.title = "Changed before the next snapshot";
    data.nested.values.push("later");
    const second = graph.snapshot();
    expect(first.nodes[0].spec).toEqual({ title: "Original", data: { id: "a", nested: { values: ["original"] } } });
    second.nodes[0].spec.title = "Changed exported copy";
    (second.nodes[0].spec.data as typeof data).nested.values.length = 0;
    expect(graph.snapshot().nodes[0].spec).toEqual(node);
    expect(graph.snapshot()).not.toBe(first);
  });

  it("preserves full rows, notes, options and merged overrides without layout defaults", () => {
    const graph = new GraphDefinition({ title: "Declared title", defaults: { layout: { rowGap: 90 } } });
    graph.node("a", { title: "A", ports: { out: { side: "right", slot: 0.25 } } });
    graph.row("one", ["a"]);
    graph.note("review", { title: "Review", bullets: ["Evidence"], width: 200 }).attachTo("a", { side: "left", dx: 10 });
    graph.annotation("legend", { items: [{ text: "New", role: "added" }] });
    graph.applyOverrides({ nodes: { a: { width: 280 } } });
    graph.applyOverrides({ edges: { future: { lane: "outer" } } });
    expect(graph.snapshot()).toMatchObject({
      rows: [{ id: "one", nodes: ["a"] }],
      notes: [
        { id: "review", spec: { title: "Review", bullets: ["Evidence"], width: 200, attachTo: "a", side: "left", dx: 10 } },
        { id: "legend", spec: { placement: "bottom-right", color: "note", items: [{ text: "New", role: "added" }] } },
      ],
      options: { title: "Declared title", defaults: { layout: { rowGap: 90 } }, overrides: {
        nodes: { a: { width: 280 } }, edges: { future: { lane: "outer" } },
      } },
    });
    expect(graph.snapshot().options).not.toHaveProperty("layout");
    expect(graph.snapshot().options.overrides).not.toHaveProperty("lanes");
    expect(new GraphDefinition({ layout: {}, custom: { retained: true } } as any).snapshot().options)
      .toEqual({ layout: {}, custom: { retained: true } });
  });

  it("defers endpoint admission until declarations are complete", () => {
    const graph = new GraphDefinition().edge("later", "last", { id: "future" });
    refusal(() => graph.snapshot(), "UNKNOWN_ENDPOINT", "$/edges/0/from");
    graph.node("last", { title: "Last" }).node("later", { title: "Later" });
    expect(graph.snapshot().edges).toEqual([{ id: "future", from: "later", to: "last" }]);
  });

  it("refuses duplicate node IDs, duplicate edge IDs and ambiguous parallel identities", () => {
    const graph = new GraphDefinition().node("a", { title: "A" }).node("b", { title: "B" });
    refusal(() => graph.node("a", { title: "Different" }), "DUPLICATE_NODE_ID");
    graph.edge("a", "b", { id: "same" }).edge("b", "a", { id: "same" });
    refusal(() => graph.snapshot(), "DUPLICATE_EDGE_ID", "$/edges/1/id");
    const parallel = new GraphDefinition({ nodes: { a: { title: "A" }, b: { title: "B" } } });
    parallel.edge("a", "b").edge("a", "b", { id: "explicit" });
    refusal(() => parallel.snapshot(), "PARALLEL_EDGE_ID_REQUIRED", "$/edges/1");
  });
});

describe("strict JSON snapshot admission", () => {
  it.each([
    ["undefined", undefined], ["function", () => 1], ["symbol", Symbol("value")], ["bigint", 1n],
    ["NaN", NaN], ["Infinity", Infinity], ["date", new Date(0)], ["map", new Map()],
    ["set", new Set()], ["typed array", new Uint8Array([1])], ["class", new (class Payload { value = 1; })()],
  ])("refuses nested %s without silently losing data", (_name, value) => {
    refusal(() => graphWithData({ nested: { value } }).snapshot(), "INVALID_JSON", "$/nodes/0/spec/data/nested/value");
  });

  it("refuses cycles but permits shared JSON values as detached copies", () => {
    const cyclic: any = { value: true }; cyclic.self = cyclic;
    refusal(() => graphWithData(cyclic).snapshot(), "INVALID_JSON", "$/nodes/0/spec/data/self");
    const common = { values: [1] };
    const data = graphWithData({ first: common, second: common }).snapshot().nodes[0].spec.data as any;
    expect(data).toEqual({ first: common, second: common });
    expect(data.first).not.toBe(data.second);
  });

  it("refuses accessors and toJSON without calling them in construction or snapshot", () => {
    let calls = 0;
    const accessor = { get secret() { calls++; throw new Error("Getter must not run"); } };
    const graph = graphWithData(accessor);
    refusal(() => graph.snapshot(), "INVALID_JSON", "$/nodes/0/spec/data/secret");
    const edge = new GraphDefinition().node("a", { title: "A" });
    edge.edge("a", "a", { get label() { calls++; return "Unsafe"; } });
    refusal(() => edge.snapshot(), "INVALID_JSON", "$/edges/0/label");
    const options = new GraphDefinition({ get title() { calls++; return "Unsafe"; } });
    refusal(() => options.snapshot(), "INVALID_JSON", "$/options/title");
    const collection = new GraphDefinition({ get nodes() { calls++; return {}; } });
    refusal(() => collection.snapshot(), "INVALID_JSON");
    refusal(() => graphWithData({ toJSON() { calls++; return {}; } }).snapshot(), "INVALID_JSON");
    expect(calls).toBe(0);
  });

  it("refuses sparse arrays, extra array properties, symbol keys and hidden fields", () => {
    const sparse = new Array(2); sparse[1] = 3;
    const extra = Object.assign([1], { note: "would be lost" });
    for (const value of [sparse, extra, { [Symbol("hidden")]: 1 }, Object.defineProperty({}, "hidden", { value: 1 })]) {
      refusal(() => graphWithData(value).snapshot(), "INVALID_JSON");
    }
  });

  it("preserves own __proto__ keys as ordinary JSON data", () => {
    const data = JSON.parse('{"__proto__":{"label":"safe"}}');
    const snapshot = graphWithData(data).snapshot();
    expect(JSON.parse(JSON.stringify(snapshot.nodes[0].spec.data))).toEqual(data);
    expect(Object.getPrototypeOf(snapshot.nodes[0].spec.data)).toBe(Object.prototype);
    expect(Object.hasOwn(snapshot.nodes[0].spec.data!, "__proto__")).toBe(true);
  });
});


describe("constructor collection snapshot boundary", () => {
  it.each(["nodes", "rows", "edges", "notes", "annotations", "overrides"] as const)(
    "distinguishes an omitted %s collection from present undefined or null", (key) => {
      expect(new GraphDefinition().snapshot()).toEqual({
        format: "excalidraw-flow", version: 1, nodes: [], edges: [], rows: [], notes: [], options: {},
      });
      for (const value of [undefined, null]) {
        const graph = new GraphDefinition({ [key]: value } as any);
        refusal(() => graph.snapshot(), "INVALID_JSON", `$/options/${key}`);
      }
    },
  );

  it("rejects holes in constructor edges instead of compacting declarations", () => {
    for (const edges of [new Array(2), Object.assign(new Array(2), { 1: { from: "a", to: "b", id: "later" } })]) {
      const graph = new GraphDefinition({ nodes: { a: { title: "A" }, b: { title: "B" } }, edges });
      refusal(() => graph.snapshot(), "INVALID_JSON", "$/options/edges");
      expect(Object.hasOwn(edges, 0)).toBe(false);
      expect(edges).toHaveLength(2);
    }
  });

  it("does not execute collection, member or edge getters in the pure constructor/snapshot", () => {
    const events: string[] = [];
    const graph = new GraphDefinition({
      nodes: { get a() { events.push("member"); return { title: "A" }; } },
      edges: [{ get from() { events.push("from"); return "a"; }, to: "a" }],
    });
    refusal(() => graph.snapshot(), "INVALID_JSON");
    const accessor = new GraphDefinition({ get nodes() { events.push("collection"); return { a: { title: "A" } }; } });
    refusal(() => accessor.snapshot(), "INVALID_JSON", "$/options/nodes");
    expect(events).toEqual([]);
  });
});


describe("raw constructor declaration checks", () => {
  it.each(["nodes", "rows", "edges", "notes", "annotations", "overrides"] as const)(
    "never invokes a pure constructor %s accessor", (key) => {
      let calls = 0;
      const spec = Object.defineProperty({}, key, { enumerable: true, get() { calls++; return key === "edges" ? [] : {}; } });
      const graph = new GraphDefinition(spec);
      expect(calls).toBe(0);
      refusal(() => graph.snapshot(), "INVALID_JSON", `$/options/${key}`);
      expect(calls).toBe(0);
    },
  );

  it("accepts explicit empty collections and keeps a declared empty overrides object", () => {
    const snapshot = new GraphDefinition({ nodes: {}, rows: {}, edges: [], notes: {}, annotations: {}, overrides: {} }).snapshot();
    expect(snapshot).toEqual({ format: "excalidraw-flow", version: 1,
      nodes: [], edges: [], rows: [], notes: [], options: { overrides: {} } });
  });

  it("retains builder mutability after ingesting a frozen edges array", () => {
    const edges = Object.freeze([{ from: "a", to: "b", id: "first" }]);
    const graph = new GraphDefinition({ nodes: { a: { title: "A" }, b: { title: "B" } }, edges: edges as any });
    graph.edge("b", "a", { id: "second" });
    expect(graph.snapshot().edges.map(({ id }) => id)).toEqual(["first", "second"]);
  });

  it.each([null, 3, "edge"])("gives a structured refusal for a malformed edge declaration (%s)", (edge) => {
    const graph = new GraphDefinition({ edges: [edge] } as any);
    refusal(() => graph.snapshot(), "INVALID_DECLARATION", "$/edges/0");
  });
});
