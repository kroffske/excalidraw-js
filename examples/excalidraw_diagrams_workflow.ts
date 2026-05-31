import { AssetRegistry, Scene, layout } from "../src/index.ts";

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 123, assetRegistry: assets });

scene.text(40, 24, "Excalidraw Diagrams Workflow", { size: 30, width: 760 });
scene.text(42, 64, "Agent prompt -> TypeScript scene builder -> Excalidraw JSON -> optional PNG", {
  size: 16,
  color: "#475569",
  width: 760,
});

const prompt = layout.iconPanel(scene, 40, 125, 230, 260, {
  title: "Prompt",
  iconId: "prompt_template",
  bullets: ["Use skill", "Pick assets", "Generate script"],
});
const builder = layout.iconPanel(scene, 330, 125, 230, 260, {
  title: "Builder",
  iconId: "robot_agent",
  bullets: ["Scene primitives", "Layout helpers", "Embedded SVGs"],
});
const output = layout.iconPanel(scene, 620, 125, 230, 260, {
  title: "Output",
  iconId: "data_catalog",
  bullets: [".excalidraw JSON", "Reviewable diff", "PNG renderer"],
});

layout.connect(scene, prompt, builder);
layout.connect(scene, builder, output);

scene.write("examples/out/excalidraw_diagrams_workflow.excalidraw");
