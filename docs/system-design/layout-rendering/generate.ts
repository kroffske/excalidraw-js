import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AssetRegistry, Scene, layout } from "../../../src/index.js";

const outDir = dirname(fileURLToPath(import.meta.url));

writeSystemDiagram();
writeUserFlowDiagram();

function writeSystemDiagram(): void {
  const scene = new Scene({ seed: 20260628, assetRegistry: AssetRegistry.bundled() });
  scene.text(40, 24, "Layout Rendering System", { size: 30, width: 1280, align: "center" });
  scene.text(40, 64, "Agents describe intent as structured data; the package plans layout, routes connectors, writes Excalidraw JSON, and renders PNG proof.", {
    size: 16,
    color: "#475569",
    width: 1280,
    align: "center",
  });

  const spec = {
    root: {
      id: "intent",
      title: "Diagram intent",
      iconId: "prompt_template",
      bullets: ["prompt, spec, or Mermaid", "known domain shape"],
      children: [
        {
          id: "tree-spec",
          title: "TreeSpec / TypeScript",
          iconId: "data_catalog",
          bullets: ["root + children", "secondaryEdges", "sidecars"],
          children: [
            {
              id: "planner",
              title: "planTreeLayout",
              iconId: "agent_planner",
              bullets: ["tree", "wide-tree", "process-flow"],
              children: [
                {
                  id: "layout",
                  title: "Layout family",
                  iconId: "etl_pipeline_dag",
                  bullets: ["measured nodes", "wrapped rows", "stable gaps"],
                  children: [
                    {
                      id: "routing",
                      title: "Routing layer",
                      iconId: "function_router",
                      bullets: ["primary arrows", "outer lanes", "sidecar notes"],
                      children: [
                        {
                          id: "scene",
                          title: "Scene JSON",
                          iconId: "schema_registry",
                          bullets: ["Excalidraw elements", "embedded SVG assets"],
                          children: [
                            {
                              id: "review",
                              title: "PNG review proof",
                              iconId: "monitoring_dashboard",
                              bullets: ["rendered preview", "human visual gate"],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    secondaryEdges: [
      {
        from: "review",
        to: "planner",
        kind: "feedback" as const,
        label: "layout feedback",
        lane: "rightOuter" as const,
      },
    ],
    sidecars: [
      {
        id: "template-note",
        attachTo: "planner",
        side: "top" as const,
        title: "Template catalog",
        bullets: ["tree", "wide-tree", "process-flow", "future swimlanes"],
        width: 230,
      },
      {
        id: "review-note",
        attachTo: "review",
        side: "bottom" as const,
        title: "Acceptance",
        bullets: ["no overlapping labels", "arrows avoid panels", "shape reads without code"],
        width: 250,
      },
    ],
  };

  const plan = layout.planTreeLayout(spec, {
    x: 60,
    y: 250,
    nodeWidth: 340,
    nodeHeight: 128,
    wrapColumns: 4,
  }, "process-flow");
  layout.processFlow(scene, spec, plan.options);
  scene.write(join(outDir, "layout-rendering-system.excalidraw"));
}

function writeUserFlowDiagram(): void {
  const scene = new Scene({ seed: 20260629, assetRegistry: AssetRegistry.bundled() });
  scene.text(40, 24, "Layout Selection User Flow", { size: 30, width: 1320, align: "center" });
  scene.text(40, 64, "The user and agent compare rendered candidates before accepting a diagram or feeding the choice back into skill/eval data.", {
    size: 16,
    color: "#475569",
    width: 1320,
    align: "center",
  });

  const spec = {
    root: {
      id: "request",
      title: "User asks for a diagram",
      iconId: "chat_message",
      bullets: ["goal + source material", "readability expectation"],
      children: [
        {
          id: "classify",
          title: "Agent classifies shape",
          iconId: "agent_planner",
          bullets: ["hierarchy, process, comparison", "notes ambiguity"],
          children: [
            {
              id: "candidate-a",
              title: "Candidate A",
              iconId: "schema_registry",
              bullets: ["tree or wide-tree", "conservative default"],
              children: [
                {
                  id: "candidate-b",
                  title: "Candidate B",
                  iconId: "etl_pipeline_dag",
                  bullets: ["process-flow or custom", "alternative layout"],
                  children: [
                    {
                      id: "render",
                      title: "Render previews",
                      iconId: "monitoring_dashboard",
                      bullets: [".excalidraw", "PNG"],
                      children: [
                        {
                          id: "choose",
                          title: "Human chooses",
                          iconId: "human_review",
                          bullets: ["accept", "request revision", "compare variants"],
                          children: [
                            {
                              id: "log",
                              title: "Record outcome",
                              iconId: "audit_log",
                              bullets: ["variant id", "scenario metadata", "quality reason"],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    secondaryEdges: [
      {
        from: "choose",
        to: "classify",
        kind: "feedback" as const,
        label: "revise if unclear",
        lane: "rightOuter" as const,
      },
    ],
    sidecars: [
      {
        id: "ab-note",
        attachTo: "candidate-b",
        side: "top" as const,
        title: "A/B path",
        bullets: ["generate two variants", "user picks better one"],
        width: 220,
      },
      {
        id: "log-note",
        attachTo: "log",
        side: "bottom" as const,
        title: "Learning loop",
        bullets: ["feeds evals", "improves skill guidance"],
        width: 220,
      },
    ],
  };

  const plan = layout.planTreeLayout(spec, {
    x: 60,
    y: 130,
    nodeWidth: 340,
    nodeHeight: 128,
    wrapColumns: 4,
  }, "process-flow");
  layout.processFlow(scene, spec, plan.options);
  scene.write(join(outDir, "layout-rendering-user-flow.excalidraw"));
}
