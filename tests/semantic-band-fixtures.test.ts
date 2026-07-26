// W8 of T-145: the two migration exemplars are the proof the template replaces hand-placed
// coordinates. Contract: docs/system-design/flow-band/flow-band-contract.md — A1-A4.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDiagramSpec, validateNativeBindings } from "../src/index.js";

const FIXTURES = [
  { name: "band_flow_spec.json", bands: 1, lanes: 4, stages: 4, nodes: 9, edges: 8 },
  { name: "band_review_flow_spec.json", bands: 1, lanes: 4, stages: 3, nodes: 7, edges: 7 },
] as const;

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8"));
}

describe("A1: the exemplars are specs, not drawings", () => {
  it("the generator contains no low-level drawing calls", () => {
    const source = readFileSync(new URL("../examples/band_flow.ts", import.meta.url), "utf8");
    // Reading the returned scene (`result.scene.write`) is the point; *drawing* into one
    // is what this template exists to remove.
    for (const forbidden of [
      "new Scene",
      ".rect(",
      ".ellipse(",
      ".diamond(",
      ".arrow(",
      ".line(",
      ".text(",
      "layout.",
      "Bounds(",
      "routeBounds",
      "labelOffset",
    ]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
    expect(source).toContain("buildDiagramSpec");
  });

  it.each(FIXTURES)("$name declares no geometry at all", ({ name }) => {
    const raw = readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8");
    for (const forbidden of ['"x"', '"y"', '"width"', '"height"', '"points"', '"index"']) {
      expect(raw.includes(forbidden), forbidden).toBe(false);
    }
  });
});

describe("A2/A3/A4: each exemplar builds, matches its content and stays editable", () => {
  it.each(FIXTURES)("$name", (fixture) => {
    const result = buildDiagramSpec(loadFixture(fixture.name), { seed: 42 });
    expect(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    if (!result.ok || !("metadata" in result) || !("bands" in result.metadata)) {
      return;
    }

    // A2: the drawing contains exactly what the spec declared.
    expect(result.metadata.bands).toHaveLength(fixture.bands);
    expect(result.metadata.lanes).toHaveLength(fixture.lanes);
    expect(result.metadata.stages).toHaveLength(fixture.stages);
    expect(result.metadata.nodes).toHaveLength(fixture.nodes);
    expect(result.metadata.edges).toHaveLength(fixture.edges);
    expect(result.metadata.legend?.entries.length).toBeGreaterThan(0);

    // A3: zero geometry errors and a pinned (here: empty) set of readability warnings.
    expect(result.geometry.errors).toEqual([]);
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.severity === "warning")
        .map((diagnostic) => `${diagnostic.code} ${diagnostic.path}`),
    ).toEqual([]);
    expect(result.scene.bounds().width).toBeLessThanOrEqual(2700);

    // A4: every arrow keeps its native binding, so the scene stays editable by hand.
    expect(validateNativeBindings(result.scene.elements).valid).toBe(true);
  });

  it("the review exemplar carries a legal cycle through a feedback edge", () => {
    const raw = loadFixture("band_review_flow_spec.json") as {
      edges: Array<{ from: string; to: string; kind?: string }>;
    };
    const back = raw.edges.find((edge) => edge.kind === "feedback")!;
    expect(back.from).toBe("answer");
    expect(back.to).toBe("clarifier");

    // Same graph, same edge marked as ordinary flow: the cycle becomes an error. That is
    // what makes `kind` semantics rather than styling.
    const asPrimary = {
      ...(raw as object),
      edges: raw.edges.map((edge) => (edge.kind === "feedback" ? { ...edge, kind: "primary" } : edge)),
    };
    const rejected = buildDiagramSpec(asPrimary, { seed: 42 });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) {
      return;
    }
    expect(rejected.diagnostics.some((diagnostic) => diagnostic.code === "CYCLIC_FLOW")).toBe(true);
  });
});
