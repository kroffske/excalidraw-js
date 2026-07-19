import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { measureText } from "../src/core.js";
import {
  type SemanticRedrawSpecDocument,
  writeSemanticRedrawDiagram,
} from "../src/index.js";

/**
 * Three columns whose middle column is full, plus edges that reach across it.
 * With the pre-0.3.11 single-bend route those long edges cut straight through
 * the middle cards; the router has to detour around them instead.
 */
function crossingSpec(): SemanticRedrawSpecDocument {
  const column = (id: string, order: number, titles: string[]) => ({
    id,
    title: `${id} column`,
    order,
    cards: titles.map((title, index) => ({
      id: `${id}-${index}`,
      title,
      figure: "card" as const,
      description: `${title} in ${id}.`,
    })),
  });
  return {
    title: "Crossing regression",
    subtitle: "Long edges must route around the middle column",
    seed: 20260720,
    sections: [
      column("left", 1, ["Intake", "Normalize", "Persist"]),
      column("middle", 2, ["Enrich", "Score", "Route", "Audit"]),
      column("right", 3, ["Publish", "Notify", "Archive"]),
    ],
    edges: [
      { from: "left-0", to: "right-0", kind: "primary", label: "hands over the prepared batch" },
      { from: "left-2", to: "right-1", kind: "primary", label: "notifies on persist" },
      { from: "right-2", to: "left-1", kind: "feedback", label: "replays archived records" },
    ],
  };
}

function write(spec: SemanticRedrawSpecDocument, name: string, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "semantic-redraw-geometry-"));
  const out = join(root, `${name}.excalidraw`);
  const result = writeSemanticRedrawDiagram(spec, out, options);
  const scene = JSON.parse(readFileSync(out, "utf8")) as {
    elements: Array<Record<string, unknown>>;
  };
  return { result, scene };
}

describe("semantic redraw geometry", () => {
  it("routes long edges around unrelated cards", () => {
    const { result } = write(crossingSpec(), "auto");
    expect(result.geometry.codes["arrow-through-block"]).toBeUndefined();
    expect(result.geometry.errors).toBe(0);
    expect(result.geometry.ok).toBe(true);
  });

  it("reports the crossings the legacy single-bend routing leaves behind", () => {
    const { result } = write(crossingSpec(), "orthogonal", { routing: "orthogonal" });
    expect(result.geometry.codes["arrow-through-block"]).toBeGreaterThan(0);
    expect(result.geometry.ok).toBe(false);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "GEOMETRY_ARROW_THROUGH_BLOCK",
      severity: "error",
    }));
  });

  it("fails the write when geometry defects are opted into as errors", () => {
    expect(() => write(crossingSpec(), "strict", {
      routing: "orthogonal",
      failOnGeometry: true,
    })).toThrow(/GEOMETRY_ARROW_THROUGH_BLOCK/);
    expect(() => write(crossingSpec(), "strict-auto", { failOnGeometry: true })).not.toThrow();
  });

  it("sizes every edge label to the text it holds so nothing is cropped on export", () => {
    const { scene } = write(crossingSpec(), "labels");
    const labels = scene.elements.filter((element) =>
      element.type === "text"
      && crossingSpec().edges!.some((edge) => edge.label === element.text));
    expect(labels).toHaveLength(3);
    for (const label of labels) {
      const needed = measureText(String(label.text), { size: 12 }).width;
      expect(Number(label.width)).toBeGreaterThanOrEqual(needed);
    }
  });
});
