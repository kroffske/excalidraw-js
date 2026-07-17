import { readFileSync } from "node:fs";
import { buildDiagramSpec } from "../src/index.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./c4_container_spec.json", import.meta.url), "utf8"),
) as unknown;
const result = buildDiagramSpec(fixture, { seed: 42 });

if (!result.ok) {
  throw new Error(JSON.stringify(result.diagnostics, null, 2));
}

result.scene.write("examples/out/c4-container.excalidraw");
console.log({
  elements: result.scene.elements.length,
  containers: result.metadata.containers.length,
  relationships: result.metadata.relationships.length,
  geometryOk: result.geometry.ok,
});
