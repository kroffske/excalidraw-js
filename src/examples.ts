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

  const skill = layout.iconWithLabel(scene, "prompt_template", 0, 0, { label: "Skill\nreferences/*" });
  const agent = layout.iconWithLabel(scene, "robot_agent", 0, 0, { label: "Pi / Claude\nagent" });
  const api = layout.iconWithLabel(scene, "agent_planner", 0, 0, { label: "TypeScript\nscript" });
  const sceneApi = layout.iconWithLabel(scene, "function_router", 0, 0, { label: "Scene +\nlayout" });
  const assets = layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: "AssetRegistry\nbundled()" });

  const authoringNodes = layout.distributeHorizontal(
    [skill, agent, api, sceneApi, assets],
    102,
    188,
    { gap: 82 },
  );
  layout.section(scene, {
    title: "Agent authoring path",
    x: 40,
    y: 112,
    padding: 24,
    titleHeight: 44,
    headerGap: 8,
    minWidth: 1120,
    minHeight: 190,
    children: authoringNodes,
  });

  for (let index = 0; index < authoringNodes.length - 1; index += 1) {
    layout.connect(scene, authoringNodes[index], authoringNodes[index + 1]);
  }

  const json = layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: ".excalidraw\nJSON" });
  const embeddedFiles = layout.iconWithLabel(scene, "data_lake", 0, 0, { label: "embedded\nSVG files" });
  const renderer = layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "JS renderer\nPNG" });
  const review = layout.iconWithLabel(scene, "human_review", 0, 0, { label: "visual\nreview" });

  const runtimeNodes = layout.distributeHorizontal(
    [json, embeddedFiles, renderer, review],
    158,
    430,
    { gap: 120 },
  );
  layout.section(scene, {
    title: "Package runtime path",
    x: 40,
    y: 352,
    padding: 24,
    titleHeight: 44,
    headerGap: 8,
    minWidth: 1120,
    minHeight: 190,
    children: runtimeNodes,
  });

  for (let index = 0; index < runtimeNodes.length - 1; index += 1) {
    layout.connect(scene, runtimeNodes[index], runtimeNodes[index + 1]);
  }

  scene.arrow(
    [
      [assets.bounds.centerX, assets.bounds.bottom],
      [json.bounds.centerX, json.bounds.top],
    ],
    { color: "#2563eb", strokeWidth: 2 },
  );

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
  const CARD_W = 250;
  const CARD_H = 96;
  const CARD_ICON = 44;
  const CARD_GAP = 24;
  const COL = { intent: 250, source: 570, delivery: 890, quality: 1210 } as const;
  const BAND_Y = 662;

  const skillCard = (title: string, iconId: string, bullet: string): layout.PlacedBlock =>
    layout.iconPanel(scene, 0, 0, CARD_W, CARD_H, { title, iconId, bullets: [bullet], iconSize: CARD_ICON });

  const phaseColumn = (title: string, x: number, cards: layout.PlacedBlock[]): layout.PlacedBlock =>
    layout.section(scene, {
      title,
      x,
      y: PHASE_Y,
      padding: 24,
      titleHeight: 40,
      headerGap: 8,
      minWidth: 300,
      minHeight: COL_HEIGHT,
      children: cards,
    });

  const actor = layout.iconPanel(scene, 40, 178, 200, 150, {
    title: "User / maintainer",
    iconId: "human_review",
    bullets: ["asks", "accepts", "compares"],
    iconSize: 46,
  });

  const intentCards = layout.distributeVertical(
    [
      skillCard("$locus-prompt-goal", "prompt_template", "whole outcome"),
      skillCard("$locus-owner", "confidence_meter", "direction constraints"),
    ],
    0,
    0,
    { gap: CARD_GAP },
  );
  const [promptGoal, owner] = intentCards;
  phaseColumn("1. Intent", COL.intent, intentCards);

  const sourceCards = layout.distributeVertical(
    [
      skillCard("$locus-spec", "data_catalog", "requirements"),
      skillCard("$locus-sdd", "semantic_graph", "slice architecture"),
      skillCard("$c4-diagrams", "data_lineage", "C4-PlantUML"),
    ],
    0,
    0,
    { gap: CARD_GAP },
  );
  const [spec, sdd, c4] = sourceCards;
  phaseColumn("2. Source truth", COL.source, sourceCards);

  const deliveryCards = layout.distributeVertical(
    [
      skillCard("$locus-plan", "agent_planner", "task contract"),
      skillCard("$locus-pm", "multi_agent_orchestrator", "routing"),
      skillCard("$locus-dev", "sandbox_executor", "bounded slice"),
    ],
    0,
    0,
    { gap: CARD_GAP },
  );
  const [plan, pm, dev] = deliveryCards;
  phaseColumn("3. Delivery", COL.delivery, deliveryCards);

  const qualityCards = layout.distributeVertical(
    [
      skillCard("$locus-code-review", "signal_quality_magnifier", "shape + quality"),
      skillCard("$locus-qa", "model_validation", "evidence verdict"),
      skillCard("$locus-ship", "model_deployment", "closure proof"),
    ],
    0,
    0,
    { gap: CARD_GAP },
  );
  const [review, qa, ship] = qualityCards;
  phaseColumn("4. Quality / ship", COL.quality, qualityCards);

  // Primary flow: left to right across the top row, vertical within columns.
  layout.connect(scene, actor, promptGoal, { direction: "left-to-right", path: "orthogonal" });
  layout.connect(scene, promptGoal, owner, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, promptGoal, spec, { direction: "left-to-right", path: "orthogonal" });
  layout.connect(scene, spec, sdd, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, sdd, c4, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, spec, plan, { direction: "left-to-right", path: "orthogonal" });
  layout.connect(scene, plan, pm, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, pm, dev, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, plan, review, { direction: "left-to-right", path: "orthogonal" });
  layout.connect(scene, review, qa, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, qa, ship, { direction: "top-down", path: "orthogonal" });

  const bandNodes = layout.distributeHorizontal(
    [
      layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: "skill sources", iconSize: 56, labelWidth: 150 }),
      layout.iconWithLabel(scene, "news_document", 0, 0, { label: "docs pages", iconSize: 56, labelWidth: 150 }),
      layout.iconWithLabel(scene, "historical_database", 0, 0, { label: ".tasks evidence", iconSize: 56, labelWidth: 150 }),
      layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "runtime payload", iconSize: 56, labelWidth: 150 }),
      layout.iconWithLabel(scene, "cloud_data", 0, 0, { label: "Codex / Claude", iconSize: 56, labelWidth: 150 }),
    ],
    0,
    0,
    { gap: 115 },
  );
  const [, docs, tasks, payload] = bandNodes;
  layout.section(scene, {
    title: "Durable state and runtime surfaces",
    x: COL.intent,
    y: BAND_Y,
    padding: 24,
    titleHeight: 40,
    headerGap: 8,
    minWidth: 1260,
    minHeight: 178,
    children: bandNodes,
  });
  for (let index = 0; index < bandNodes.length - 1; index += 1) {
    layout.connect(scene, bandNodes[index], bandNodes[index + 1], { direction: "left-to-right", path: "orthogonal" });
  }

  // Long down-links from the producing skills to where their output lives.
  layout.connect(scene, c4, docs, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, dev, tasks, { direction: "top-down", path: "orthogonal" });
  layout.connect(scene, ship, payload, { direction: "top-down", path: "orthogonal" });

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
