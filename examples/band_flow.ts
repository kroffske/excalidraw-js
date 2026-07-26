import { readFileSync } from "node:fs";
import { buildDiagramSpec } from "../src/index.ts";

// Two migration exemplars for `flow.band`: an acyclic pipeline and a review loop whose
// back edge is marked `feedback`. Both are plain spec objects — no coordinates, no
// routing, no manual band arithmetic.
const FIXTURES = [
  { spec: "./band_flow_spec.json", out: "examples/band-flow.excalidraw" },
  { spec: "./band_review_flow_spec.json", out: "examples/band-review-flow.excalidraw" },
];

for (const fixture of FIXTURES) {
  const document = JSON.parse(
    readFileSync(new URL(fixture.spec, import.meta.url), "utf8"),
  ) as unknown;
  const result = buildDiagramSpec(document, { seed: 42 });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.diagnostics, null, 2));
  }
  result.scene.write(fixture.out);
  console.log({
    output: fixture.out,
    elements: result.scene.elements.length,
    bands: "bands" in result.metadata ? result.metadata.bands.length : 0,
    geometryOk: result.geometry.ok,
    warnings: result.diagnostics.filter((entry) => entry.severity === "warning").length,
  });
}
