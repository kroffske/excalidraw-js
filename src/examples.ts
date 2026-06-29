import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AssetRegistry } from "./assets.js";
import { Scene } from "./core.js";
import * as layout from "./layout.js";

export interface ExampleResult {
  excalidrawPath: string;
  elements: number;
  files: number;
}

export function writeExcalidrawJsArchitecture(outDir = "examples/out/baseline"): ExampleResult {
  mkdirSync(outDir, { recursive: true });

  const scene = new Scene({ seed: 20260601, assetRegistry: AssetRegistry.bundled() });

  scene.text(40, 24, "excalidraw-js baseline architecture", { size: 30, width: 1120, align: "center" });
  scene.text(40, 64, "Agent skill guidance, TypeScript APIs, bundled assets, JSON output, and the JS renderer stay on one npm path.", {
    size: 16,
    color: "#475569",
    width: 1120,
    align: "center",
  });

  const authoringNodes = layout.row({
    skill: layout.iconWithLabel(scene, "prompt_template", 0, 0, { label: "Skill\nreferences/*" }),
    agent: layout.iconWithLabel(scene, "robot_agent", 0, 0, { label: "Pi / Claude\nagent" }),
    script: layout.iconWithLabel(scene, "agent_planner", 0, 0, { label: "TypeScript\nscript" }),
    sceneApi: layout.iconWithLabel(scene, "function_router", 0, 0, { label: "Scene +\nlayout" }),
    assets: layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: "AssetRegistry\nbundled()" }),
  }, { gap: 82, align: "center" });
  layout.section(scene, {
    title: "Agent authoring path",
    x: 40,
    y: 112,
    padding: 24,
    titleHeight: 44,
    headerGap: 8,
    minWidth: 1120,
    minHeight: 190,
    children: [authoringNodes],
  });

  layout.connect(scene, authoringNodes.skill, authoringNodes.agent);
  layout.connect(scene, authoringNodes.agent, authoringNodes.script);
  layout.connect(scene, authoringNodes.script, authoringNodes.sceneApi);
  layout.connect(scene, authoringNodes.sceneApi, authoringNodes.assets);

  const runtimeNodes = layout.row({
    json: layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: ".excalidraw\nJSON" }),
    embeddedFiles: layout.iconWithLabel(scene, "data_lake", 0, 0, { label: "embedded\nSVG files" }),
    renderer: layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "JS renderer\nPNG" }),
    review: layout.iconWithLabel(scene, "human_review", 0, 0, { label: "visual\nreview" }),
  }, { gap: 120, align: "center" });
  layout.section(scene, {
    title: "Package runtime path",
    x: 40,
    y: 352,
    padding: 24,
    titleHeight: 44,
    headerGap: 8,
    minWidth: 1120,
    minHeight: 190,
    children: [runtimeNodes],
  });

  layout.connect(scene, runtimeNodes.json, runtimeNodes.embeddedFiles);
  layout.connect(scene, runtimeNodes.embeddedFiles, runtimeNodes.renderer);
  layout.connect(scene, runtimeNodes.renderer, runtimeNodes.review);
  layout.connect(scene, authoringNodes.assets, runtimeNodes.json);

  scene.text(70, 575, "Do not use Python, uv pip, .venv, site-packages, AssetRegistry.keys(), or AssetRegistry.size.", {
    size: 16,
    color: "#b91c1c",
    width: 1040,
    align: "center",
  });

  const excalidrawPath = join(outDir, "excalidraw-js-architecture.excalidraw");
  scene.write(excalidrawPath);

  return validateExampleDiagram(excalidrawPath);
}

export function writeArchitectureSemanticRedraw(outDir = "examples/out/architecture-semantic-redraw"): ExampleResult {
  mkdirSync(outDir, { recursive: true });

  const scene = new Scene({ seed: 20260628, assetRegistry: AssetRegistry.bundled(), background: "#ffffff" });

  scene.text(40, 24, "Locus skill chain semantic redraw", { size: 30, width: 1480, align: "center" });
  scene.text(40, 66, "Extract the real Locus skill architecture from a C4 / PlantUML source and redraw it as editable phase sections, skill components, and durable surfaces.", {
    size: 16,
    color: "#475569",
    width: 1480,
    align: "center",
  });

  // Layout grid: a left actor, four phase columns across the top, a wide
  // durable-surfaces band underneath. Columns share a fixed height so the
  // top-row flow stays level and the down-links land cleanly on the band.
  const PHASE_Y = 120;
  const COL_HEIGHT = 486;
  const CARD_GAP = 24;
  const COL = { intent: 250, source: 570, delivery: 890, quality: 1210 } as const;
  const BAND_Y = 662;

  const skillCard = (title: string, iconId: string, bullet: string): layout.PlacedBlock =>
    layout.node(scene, { title, iconId, bullets: [bullet] });

  const phaseColumn = (title: string, x: number, cards: layout.PlacedBlock): layout.PlacedBlock =>
    layout.section(scene, {
      title,
      x,
      y: PHASE_Y,
      padding: 24,
      titleHeight: 40,
      headerGap: 8,
      minWidth: 300,
      minHeight: COL_HEIGHT,
      children: [cards],
    });

  const actor = layout.iconPanel(scene, 40, 178, 200, 150, {
    title: "User / maintainer",
    iconId: "human_review",
    bullets: ["asks", "accepts", "compares"],
    iconSize: 46,
  });

  const intent = layout.column({
    promptGoal: skillCard("$locus-prompt-goal", "prompt_template", "whole outcome"),
    owner: skillCard("$locus-owner", "confidence_meter", "direction constraints"),
  }, { gap: CARD_GAP });
  phaseColumn("1. Intent", COL.intent, intent);

  const source = layout.column({
    spec: skillCard("$locus-spec", "data_catalog", "requirements"),
    sdd: skillCard("$locus-sdd", "semantic_graph", "slice architecture"),
    c4: skillCard("$c4-diagrams", "data_lineage", "C4-PlantUML"),
  }, { gap: CARD_GAP });
  phaseColumn("2. Source truth", COL.source, source);

  const delivery = layout.column({
    plan: skillCard("$locus-plan", "agent_planner", "task contract"),
    pm: skillCard("$locus-pm", "multi_agent_orchestrator", "routing"),
    dev: skillCard("$locus-dev", "sandbox_executor", "bounded slice"),
  }, { gap: CARD_GAP });
  phaseColumn("3. Delivery", COL.delivery, delivery);

  const quality = layout.column({
    review: skillCard("$locus-code-review", "signal_quality_magnifier", "shape + quality"),
    qa: skillCard("$locus-qa", "model_validation", "evidence verdict"),
    ship: skillCard("$locus-ship", "model_deployment", "closure proof"),
  }, { gap: CARD_GAP });
  phaseColumn("4. Quality / ship", COL.quality, quality);

  // Primary flow: left to right across the top row, vertical within columns.
  layout.connect(scene, actor, intent.promptGoal);
  layout.connect(scene, intent.promptGoal, intent.owner);
  layout.connect(scene, intent.promptGoal, source.spec);
  layout.connect(scene, source.spec, source.sdd);
  layout.connect(scene, source.sdd, source.c4);
  layout.connect(scene, source.spec, delivery.plan);
  layout.connect(scene, delivery.plan, delivery.pm);
  layout.connect(scene, delivery.pm, delivery.dev);
  layout.connect(scene, delivery.plan, quality.review);
  layout.connect(scene, quality.review, quality.qa);
  layout.connect(scene, quality.qa, quality.ship);

  const bandNodes = layout.row({
    skillSources: layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: "skill sources", iconSize: 56, labelWidth: 150 }),
    docs: layout.iconWithLabel(scene, "news_document", 0, 0, { label: "docs pages", iconSize: 56, labelWidth: 150 }),
    tasks: layout.iconWithLabel(scene, "historical_database", 0, 0, { label: ".tasks evidence", iconSize: 56, labelWidth: 150 }),
    payload: layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "runtime payload", iconSize: 56, labelWidth: 150 }),
    codexClaude: layout.iconWithLabel(scene, "cloud_data", 0, 0, { label: "Codex / Claude", iconSize: 56, labelWidth: 150 }),
  }, { gap: 115, align: "center" });
  layout.section(scene, {
    title: "Durable state and runtime surfaces",
    x: COL.intent,
    y: BAND_Y,
    padding: 24,
    titleHeight: 40,
    headerGap: 8,
    minWidth: 1260,
    minHeight: 178,
    children: [bandNodes],
  });
  layout.connect(scene, bandNodes.skillSources, bandNodes.docs);
  layout.connect(scene, bandNodes.docs, bandNodes.tasks);
  layout.connect(scene, bandNodes.tasks, bandNodes.payload);
  layout.connect(scene, bandNodes.payload, bandNodes.codexClaude);

  // Long down-links from the producing skills to where their output lives.
  layout.connect(scene, source.c4, bandNodes.docs);
  layout.connect(scene, delivery.dev, bandNodes.tasks);
  layout.connect(scene, quality.ship, bandNodes.payload);

  scene.text(40, BAND_Y + 196, "Semantic redraw keeps the real Locus skill chain editable: phase sections, skill components, and durable surfaces, not a literal copy of every C4 relationship.", {
    size: 16,
    color: "#475569",
    width: 1480,
    align: "center",
  });

  const excalidrawPath = join(outDir, "architecture-semantic-redraw.excalidraw");
  scene.write(excalidrawPath);

  return validateExampleDiagram(excalidrawPath);
}

function validateExampleDiagram(excalidrawPath: string): ExampleResult {
  const data = JSON.parse(readFileSync(excalidrawPath, "utf8")) as {
    type?: string;
    elements?: unknown[];
    files?: Record<string, unknown>;
  };
  const elements = data.elements?.length ?? 0;
  const fileCount = Object.keys(data.files ?? {}).length;

  if (data.type !== "excalidraw" || elements === 0 || fileCount === 0) {
    throw new Error(`Invalid baseline diagram: ${excalidrawPath}`);
  }

  return { excalidrawPath, elements, files: fileCount };
}
