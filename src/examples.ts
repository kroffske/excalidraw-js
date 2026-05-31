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

  const authoring = layout.panel(scene, 40, 112, 1120, 190, { title: "Agent authoring path" });
  const runtime = layout.panel(scene, 40, 352, 1120, 190, { title: "Package runtime path" });

  const skill = layout.iconWithLabel(scene, "prompt_template", 0, 0, { label: "Skill\nreferences/*" });
  const agent = layout.iconWithLabel(scene, "robot_agent", 0, 0, { label: "Pi / Claude\nagent" });
  const api = layout.iconWithLabel(scene, "agent_planner", 0, 0, { label: "TypeScript\nscript" });
  const sceneApi = layout.iconWithLabel(scene, "function_router", 0, 0, { label: "Scene +\nlayout" });
  const assets = layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: "AssetRegistry\nbundled()" });

  const authoringNodes = layout.distributeHorizontal(
    [skill, agent, api, sceneApi, assets],
    authoring.bounds.left + 62,
    authoring.bounds.top + 72,
    { gap: 82 },
  );

  for (let index = 0; index < authoringNodes.length - 1; index += 1) {
    layout.connect(scene, authoringNodes[index], authoringNodes[index + 1]);
  }

  const json = layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: ".excalidraw\nJSON" });
  const embeddedFiles = layout.iconWithLabel(scene, "data_lake", 0, 0, { label: "embedded\nSVG files" });
  const renderer = layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "JS renderer\nPNG" });
  const review = layout.iconWithLabel(scene, "human_review", 0, 0, { label: "visual\nreview" });

  const runtimeNodes = layout.distributeHorizontal(
    [json, embeddedFiles, renderer, review],
    runtime.bounds.left + 118,
    runtime.bounds.top + 72,
    { gap: 120 },
  );

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
