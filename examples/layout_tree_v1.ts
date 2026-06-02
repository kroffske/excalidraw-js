import { mkdirSync, readFileSync } from "node:fs";
import { AssetRegistry, Scene, layout } from "../src/index.ts";

const outDir = "examples/out/layout-v1";
mkdirSync(outDir, { recursive: true });

const scene = new Scene({ seed: 20260602, assetRegistry: AssetRegistry.bundled() });

scene.text(40, 24, "Measured layout.tree v1", {
  size: 28,
  width: 980,
  align: "center",
});
scene.text(40, 60, "The tree helper measures auto-grown icon panels before placing child rows.", {
  size: 15,
  color: "#475569",
  width: 980,
  align: "center",
});

layout.tree(scene, {
  root: {
    id: "session",
    title: "Pi session sharedState",
    iconId: "memory_database",
    bullets: ["goal", "plan", "loop", "todos", "agents", "toolPreset"],
    children: [
      {
        id: "plan",
        title: "plan mode",
        iconId: "agent_planner",
        bullets: ["read-only gate", "executionApproved", "tasks[]", "raw plan text"],
        children: [
          {
            id: "parser",
            title: "extractPlanTasks",
            iconId: "filter_funnel",
            bullets: ["checkbox", "numbered", "bullet"],
          },
        ],
      },
      {
        id: "todos",
        title: "todos view",
        iconId: "tool_call",
        bullets: ["renders checklist", "pending", "in_progress", "done", "blocked"],
      },
      {
        id: "loop",
        title: "loop state",
        iconId: "model_refresh",
        bullets: ["maxTurns", "maxMinutes", "maxToolCalls", "stopRegex"],
      },
    ],
  },
  sidecars: [
    {
      id: "session-hook-note",
      attachTo: "loop",
      side: "right",
      title: "session hooks",
      bullets: ["restore loop state", "prefer note over reverse arrow"],
    },
  ],
}, {
  x: 80,
  y: 120,
  nodeWidth: 270,
  nodeHeight: 120,
  levelGap: 86,
  siblingGap: 54,
});

const outPath = `${outDir}/layout-tree-v1.excalidraw`;
scene.write(outPath);

const data = JSON.parse(readFileSync(outPath, "utf8")) as { type?: string; elements?: unknown[] };
if (data.type !== "excalidraw" || !data.elements?.length) {
  throw new Error(`Invalid tree proof diagram: ${outPath}`);
}

console.log(JSON.stringify({ outPath, elements: data.elements.length }, null, 2));
