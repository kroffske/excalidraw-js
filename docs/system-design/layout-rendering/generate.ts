import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AssetRegistry, Scene, layout } from "../../../src/index.js";

const outDir = dirname(fileURLToPath(import.meta.url));

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

function writeSequenceDiagram(): void {
  const scene = new Scene({ seed: 20260629, assetRegistry: AssetRegistry.bundled() });
  scene.text(40, 24, "Layout Selection Sequence", { size: 30, width: 1320, align: "center" });
  scene.text(40, 64, "A request moves through the user, agent, layout API, renderer, human review, and learning metadata over time.", {
    size: 16,
    color: "#475569",
    width: 1320,
    align: "center",
  });

  const participants = [
    { id: "user", label: "User", x: 82 },
    { id: "agent", label: "Agent\nskill", x: 302 },
    { id: "layout", label: "Layout\nAPI", x: 522 },
    { id: "renderer", label: "Renderer", x: 742 },
    { id: "review", label: "Human\nreview", x: 962 },
    { id: "metadata", label: "Eval\nmetadata", x: 1182 },
  ];
  const lifelines: Record<string, number> = {};
  for (const participant of participants) {
    lifelines[participant.id] = drawParticipant(scene, participant.label, participant.x);
  }

  drawActivation(scene, lifelines.agent, 235, 614);
  drawActivation(scene, lifelines.layout, 287, 346);
  drawActivation(scene, lifelines.renderer, 391, 450);
  drawActivation(scene, lifelines.review, 443, 510);
  drawActivation(scene, lifelines.metadata, 547, 606);

  const messages = [
    ["user", "agent", 244, "Request diagram + source context"],
    ["agent", "layout", 300, "Select layout family and build structured spec"],
    ["layout", "agent", 356, "Return plan + Excalidraw JSON", true],
    ["agent", "renderer", 412, "Render PNG preview"],
    ["renderer", "review", 468, "Deliver reviewable PNG proof"],
    ["review", "agent", 524, "Accept or send revision notes", true],
    ["agent", "metadata", 580, "Record variant id + quality reason"],
    ["metadata", "agent", 636, "Learning signal for next run", true],
  ] as const;
  for (const [from, to, y, label, dashed] of messages) {
    drawMessage(scene, lifelines[from], lifelines[to], y, label, dashed ?? false);
  }

  const note = scene.rect(910, 680, 360, 92, { color: "#64748b", strokeWidth: 1, dashed: true });
  const noteTitle = scene.text(930, 697, "Human gate", { size: 16, color: "#0b1fb3", width: 320, align: "center" });
  const noteText = scene.text(930, 726, "Acceptance stays human-reviewed\nbefore outcomes feed future evals.", {
    size: 13,
    color: "#475569",
    width: 320,
    align: "center",
  });
  scene.group([note, noteTitle, noteText]);

  scene.write(join(outDir, "layout-rendering-sequence.excalidraw"));
}

const PARTICIPANT_Y = 128;
const PARTICIPANT_WIDTH = 156;
const PARTICIPANT_HEIGHT = 60;
const LIFELINE_BOTTOM = 660;

function drawParticipant(scene: Scene, label: string, x: number): number {
  const box = scene.rect(x, PARTICIPANT_Y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT, { strokeWidth: 2 });
  const text = scene.text(x + 12, PARTICIPANT_Y + 14, label, {
    size: 15,
    width: PARTICIPANT_WIDTH - 24,
    align: "center",
  });
  const lifelineX = x + PARTICIPANT_WIDTH / 2;
  const lifeline = scene.line([[lifelineX, PARTICIPANT_Y + PARTICIPANT_HEIGHT], [lifelineX, LIFELINE_BOTTOM]], {
    color: "#94a3b8",
    strokeWidth: 1,
    dashed: true,
  });
  scene.group([box, text, lifeline]);
  return lifelineX;
}

function drawActivation(scene: Scene, lifelineX: number, y1: number, y2: number): void {
  scene.rect(lifelineX - 6, y1, 12, y2 - y1, { color: "#64748b", strokeWidth: 1 });
}

function drawMessage(scene: Scene, fromX: number, toX: number, y: number, label: string, dashed: boolean): void {
  const leftToRight = fromX <= toX;
  const startX = leftToRight ? fromX + 8 : fromX - 8;
  const endX = leftToRight ? toX - 8 : toX + 8;
  const color = dashed ? "#64748b" : "#0b1fb3";
  scene.arrow([[startX, y], [endX, y]], { color, strokeWidth: dashed ? 1.5 : 2, dashed });
  scene.text(Math.min(startX, endX) + 12, y - 28, label, {
    size: 13,
    color,
    width: Math.max(120, Math.abs(endX - startX) - 24),
    align: "center",
  });
}

writeSystemDiagram();
writeSequenceDiagram();
