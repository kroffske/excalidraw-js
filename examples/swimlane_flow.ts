import { readFileSync } from "node:fs";
import { buildDiagramSpec } from "../src/index.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./swimlane_flow_spec.json", import.meta.url), "utf8"),
) as unknown;
const result = buildDiagramSpec(fixture, { seed: 42 });

if (!result.ok) {
  throw new Error(JSON.stringify(result.diagnostics, null, 2));
}

for (const element of result.scene.elements) {
  element.updated = 0;
}
result.scene.write("examples/swimlane-flow.excalidraw");
console.log({
  elements: result.scene.elements.length,
  lanes: result.metadata.template === "flow.swimlane"
    ? result.metadata.lanes.length
    : 0,
  activities: result.metadata.template === "flow.swimlane"
    ? result.metadata.activities.length
    : 0,
  transitions: result.metadata.template === "flow.swimlane"
    ? result.metadata.transitions.length
    : 0,
  geometryOk: result.geometry.ok,
});
