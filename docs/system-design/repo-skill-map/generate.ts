import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AssetRegistry, Scene, boundsFor, layout } from "../../../src/index.ts";

const OUT_DIR = "docs/system-design/repo-skill-map/resources";
mkdirSync(OUT_DIR, { recursive: true });

const scene = new Scene({ seed: 20260629, assetRegistry: AssetRegistry.bundled(), background: "#ffffff" });

scene.text(40, 24, "Excalidraw Diagrams skill and rendering ecosystem", {
  size: 31,
  width: 1720,
  align: "center",
});
scene.text(40, 68, "A semantic redraw of the repository: C4 source, agent skill guidance, TypeScript graph/layout APIs, Excalidraw JSON, renderer, docs, and verification gates.", {
  size: 16,
  color: "#475569",
  width: 1720,
  align: "center",
});

const card = (title: string, iconId: string, bullets: string[], w = 272, h = 120): layout.PlacedBlock =>
  layout.iconPanel(scene, 0, 0, w, h, { title, iconId, bullets, iconSize: 46, titleSize: 16, bulletSize: 12 });

const sourceCards = layout.distributeVertical([
  card("Coding agent / maintainer", "human_review", ["asks for a diagram", "accepts output"], 278, 120),
  card("c4-diagrams skill", "data_lineage", ["C4 source contract", "PlantUML SVG"], 278, 120),
  card("excalidraw-diagrams skill", "prompt_template", ["preflight and examples", "semantic redraw path"], 278, 120),
], 0, 0, { gap: 26 });
const promptSection = layout.section(scene, {
  title: "1. Prompt and skill boundary",
  x: 40,
  y: 124,
  minWidth: 330,
  minHeight: 502,
  padding: 24,
  titleHeight: 42,
  headerGap: 8,
  children: sourceCards,
});

const authoringCards = layout.distributeVertical([
  card("C4 source + SVG", "news_document", ["durable .puml", "README-friendly SVG"], 286, 120),
  card("TypeScript generator", "agent_planner", ["Scene script", "named graph or layout"], 286, 120),
  card("Package API", "function_router", ["Scene, diagram.flow", "layout and validation"], 286, 120),
], 0, 0, { gap: 26 });
const authoringSection = layout.section(scene, {
  title: "2. Source truth and generators",
  x: 450,
  y: 124,
  minWidth: 340,
  minHeight: 502,
  padding: 24,
  titleHeight: 42,
  headerGap: 8,
  children: authoringCards,
});

const runtimeCards = layout.distributeVertical([
  card("Layout and graph helpers", "semantic_graph", ["sections, cards, trees", "measured labels"], 292, 120),
  card("Bundled SVG assets", "data_catalog", ["agents + data packs", "embedded files"], 292, 120),
  card("Renderer CLI", "model_deployment", ["browser runtime", "reader-facing image"], 292, 120),
], 0, 0, { gap: 26 });
const runtimeSection = layout.section(scene, {
  title: "3. Rendering core",
  x: 865,
  y: 124,
  minWidth: 348,
  minHeight: 502,
  padding: 24,
  titleHeight: 42,
  headerGap: 8,
  children: runtimeCards,
});

const outputCards = layout.distributeVertical([
  card(".excalidraw artifact", "data_lake", ["editable scene JSON", "embedded icon files"], 292, 120),
  card("README / docs / examples", "monitoring_dashboard", ["reader surface", "operator guidance"], 292, 120),
  card("Build and Vitest gates", "model_validation", ["API and CLI tests", "example smoke proof"], 292, 120),
], 0, 0, { gap: 26 });
const outputSection = layout.section(scene, {
  title: "4. Durable outputs and proof",
  x: 1285,
  y: 124,
  minWidth: 365,
  minHeight: 502,
  padding: 24,
  titleHeight: 42,
  headerGap: 8,
  children: outputCards,
});

const [
  actor,
  c4Skill,
  excalidrawSkill,
] = sourceCards;
const [
  c4Source,
  generator,
  packageApi,
] = authoringCards;
const [
  layoutHelpers,
  assetRegistry,
  renderer,
] = runtimeCards;
const [
  editableJson,
  docs,
  tests,
] = outputCards;

const mainSections = [promptSection, authoringSection, runtimeSection, outputSection];
const mainBounds = boundsFor(mainSections.flatMap((section) => section.elements));
const cardObstacles = [...sourceCards, ...authoringCards, ...runtimeCards, ...outputCards];

const connect = (from: layout.PlacedBlock, to: layout.PlacedBlock, options: layout.ConnectOptions = {}) => {
  layout.connectRouted(scene, from, to, {
    direction: "left-to-right",
    path: "auto",
    obstacles: cardObstacles,
    ...options,
  });
};

const connectDown = (from: layout.PlacedBlock, to: layout.PlacedBlock, options: layout.ConnectOptions = {}) => {
  layout.connectRouted(scene, from, to, {
    direction: "top-down",
    path: "auto",
    obstacles: cardObstacles,
    ...options,
  });
};

connectDown(actor, c4Skill, { label: "structural map", labelWidth: 118 });
connectDown(c4Skill, excalidrawSkill, { dashed: true, label: "editable redraw request", labelWidth: 172 });

connect(c4Skill, c4Source, { label: "writes .puml + SVG", labelWidth: 132 });
connect(excalidrawSkill, generator, { label: "chooses generator", labelWidth: 132 });
connectDown(generator, packageApi, { label: "imports public API", labelWidth: 136 });

connect(packageApi, layoutHelpers);
connectDown(layoutHelpers, assetRegistry);

connect(layoutHelpers, editableJson, { label: "writes scene model", labelWidth: 128 });
connect(assetRegistry, editableJson);
connect(editableJson, renderer, {
  direction: "right-to-left",
  path: "outer",
  from: "right",
  to: "bottom",
  outerSide: "bottom",
  outerGap: 22,
  routeBounds: mainBounds,
});
connect(renderer, docs, { label: "exports visual asset", labelWidth: 132 });

connect(c4Source, docs, {
  dashed: true,
  path: "outer",
  from: "right",
  to: "left",
  outerSide: "bottom",
  outerGap: 38,
  routeBounds: mainBounds,
});
connect(docs, excalidrawSkill, {
  dashed: true,
  direction: "right-to-left",
  path: "outer",
  from: "right",
  to: "bottom",
  outerSide: "bottom",
  outerGap: 54,
  routeBounds: mainBounds,
});
connect(tests, packageApi, {
  dashed: true,
  direction: "right-to-left",
  path: "outer",
  from: "bottom",
  to: "bottom",
  outerSide: "bottom",
  outerGap: 70,
  routeBounds: mainBounds,
});

const connectionNotes = layout.bulletList(scene, 0, 0, [
  "Solid arrows: production flow",
  "Dashed arrows: source/docs/proof feedback",
  "C4 skill writes .puml + SVG",
  "Excalidraw skill chooses generator layer",
  "Package API delegates layout and assets",
  "Renderer loads JSON and exports image",
  "Docs and tests feed back into the skill/API",
], { width: 270, textSize: 12, lineGap: 20 });
layout.section(scene, {
  title: "Connection labels",
  x: 40,
  y: 760,
  minWidth: 330,
  minHeight: 150,
  padding: 22,
  titleHeight: 38,
  headerGap: 6,
  children: [connectionNotes],
});

const legend = layout.distributeHorizontal([
  layout.iconWithLabel(scene, "prompt_template", 0, 0, { label: "skill contract", iconSize: 42, labelWidth: 120 }),
  layout.iconWithLabel(scene, "semantic_graph", 0, 0, { label: "editable Excalidraw", iconSize: 42, labelWidth: 138 }),
  layout.iconWithLabel(scene, "news_document", 0, 0, { label: "reader docs", iconSize: 42, labelWidth: 120 }),
  layout.iconWithLabel(scene, "model_validation", 0, 0, { label: "verification gate", iconSize: 42, labelWidth: 138 }),
], 0, 0, { gap: 86 });
layout.section(scene, {
  title: "How to read the postcard",
  x: 450,
  y: 760,
  minWidth: 980,
  minHeight: 150,
  padding: 22,
  titleHeight: 38,
  headerGap: 6,
  children: legend,
});

const excalidrawPath = join(OUT_DIR, "excalidraw-js-skill-map.excalidraw");
scene.write(excalidrawPath);

const data = JSON.parse(readFileSync(excalidrawPath, "utf8"));
console.log(JSON.stringify({
  excalidrawPath,
  elements: data.elements.length,
  files: Object.keys(data.files ?? {}).length,
}, null, 2));
