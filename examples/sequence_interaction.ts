import { readFileSync } from "node:fs";
import { buildDiagramSpec } from "../src/index.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("./sequence_interaction_spec.json", import.meta.url),
    "utf8",
  ),
) as unknown;
const result = buildDiagramSpec(fixture, { seed: 42 });

if (!result.ok) {
  throw new Error(JSON.stringify(result.diagnostics, null, 2));
}

result.scene.write("examples/out/sequence-interaction.excalidraw");
console.log({
  elements: result.scene.elements.length,
  participants: result.metadata.template === "sequence.interaction"
    ? result.metadata.participants.length
    : 0,
  messages: result.metadata.template === "sequence.interaction"
    ? result.metadata.messages.length
    : 0,
  geometryOk: result.geometry.ok,
});
