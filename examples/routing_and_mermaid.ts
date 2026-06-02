import { mkdirSync, readFileSync } from "node:fs";
import { AssetRegistry, Scene, layout } from "../src/index.ts";

const outDir = "examples/out/routing-and-mermaid";
mkdirSync(outDir, { recursive: true });

const scene = new Scene({ seed: 20260602, assetRegistry: AssetRegistry.bundled() });

scene.text(40, 24, "Routing and Mermaid tree proof", { size: 28, width: 980, align: "center" });
scene.text(40, 60, "Top-down arrows attach bottom-to-top; Mermaid tree scenarios route secondary links outside the main flow.", {
  size: 15,
  color: "#475569",
  width: 980,
  align: "center",
});

const root = layout.iconPanel(scene, 120, 120, 230, 110, {
  title: "Root",
  iconId: "agent_planner",
  bullets: ["Source block", "Tree parent"],
});
const left = layout.iconPanel(scene, 40, 330, 230, 120, {
  title: "Left child",
  iconId: "tool_call",
  bullets: ["Arrow enters top", "No title crossing"],
});
const right = layout.iconPanel(scene, 300, 330, 230, 120, {
  title: "Right child",
  iconId: "memory_database",
  bullets: ["Orthogonal route", "Clear level gap"],
});

layout.connect(scene, root, left, { direction: "top-down", path: "orthogonal" });
layout.connect(scene, root, right, { direction: "top-down", path: "orthogonal" });

layout.fromMermaid(scene, [
  "graph TD",
  "Session[\"Mermaid session\"] --> Plan[\"Plan branch\"]",
  "Session --> Todo[\"Todo branch\"]",
  "Plan --> Parser[\"Regex parser\"]",
  "Todo --> State[\"Shared state\"]",
  "State -. restores .-> Plan",
].join("\n"), {
  scenario: "tree",
  x: 760,
  y: 130,
  nodeWidth: 230,
  nodeHeight: 120,
  levelGap: 78,
  siblingGap: 42,
  icons: {
    Session: "memory_database",
    Plan: "agent_planner",
    Todo: "tool_call",
    Parser: "filter_funnel",
    State: "historical_database",
  },
});

const outPath = outDir + "/routing-and-mermaid.excalidraw";
scene.write(outPath);

const data = JSON.parse(readFileSync(outPath, "utf8")) as {
  type?: string;
  elements?: unknown[];
  files?: Record<string, unknown>;
};

if (data.type !== "excalidraw" || !data.elements?.length) {
  throw new Error("Invalid proof diagram: " + outPath);
}

console.log(JSON.stringify({ outPath, elements: data.elements.length, files: Object.keys(data.files ?? {}).length }, null, 2));
