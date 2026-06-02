import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { AssetRegistry, Scene, layout } from "../src/index.ts";
import { Bounds, PlacedBlock } from "../src/geometry.ts";
import { defaultCacheDir, renderMain, rendererReady, setupRenderer } from "../src/render.ts";

interface ScenarioSet {
  artifact_root: string;
  runner_contract: {
    required_outputs: string[];
    rules: string[];
  };
  review_rubric: Record<string, string>;
  scenarios: ScenarioDefinition[];
}

interface ScenarioDefinition {
  id: string;
  title: string;
  difficulty: string;
  prompt: string;
  expected_output: {
    pack: "core" | "trading";
    required_asset_aliases: {
      core: string[];
      trading: string[];
    };
    layout: string;
    required_structure: string[];
    manual_review_focus: string[];
  };
}

interface RunOptions {
  artifactRoot: string;
  reportPath: string;
  render: boolean;
  setupRenderer: boolean;
}

interface ScenarioResult {
  scenario: ScenarioDefinition;
  excalidrawPath: string;
  pngPath: string;
  status: "pass" | "fail";
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

const ROOT = process.cwd();
const SCENARIO_FILE = join(ROOT, "evals", "agent-diagram-scenarios.json");

function main(argv = process.argv.slice(2)): number {
  const scenarioSet = JSON.parse(readFileSync(SCENARIO_FILE, "utf8")) as ScenarioSet;
  const options = parseArgs(argv, scenarioSet.artifact_root);

  if (options.setupRenderer) {
    setupRenderer(null);
  }
  if (options.render && !rendererReady()) {
    throw new Error(
      `Renderer is not installed in ${defaultCacheDir()}. Run npm run render:setup or npm run eval:agent-diagrams:setup.`,
    );
  }

  const artifactRoot = resolve(options.artifactRoot);
  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });

  const results = scenarioSet.scenarios.map((scenario) => runScenario(scenario, artifactRoot, options.render));
  writeReport(scenarioSet, results, resolve(options.reportPath), options);

  const failed = results.filter((result) => result.status === "fail");
  console.log(`Wrote ${results.length} scenario artifacts to ${artifactRoot}`);
  console.log(`Wrote HTML report to ${resolve(options.reportPath)}`);

  if (failed.length > 0) {
    console.error(`Failed scenarios: ${failed.map((result) => result.scenario.id).join(", ")}`);
    return 1;
  }
  return 0;
}

function parseArgs(argv: string[], defaultArtifactRoot: string): RunOptions {
  const options: RunOptions = {
    artifactRoot: defaultArtifactRoot,
    reportPath: join(defaultArtifactRoot, "report.html"),
    render: true,
    setupRenderer: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact-root") {
      options.artifactRoot = argv[++index] ?? options.artifactRoot;
      options.reportPath = join(options.artifactRoot, "report.html");
    } else if (arg === "--report") {
      options.reportPath = argv[++index] ?? options.reportPath;
    } else if (arg === "--skip-render") {
      options.render = false;
    } else if (arg === "--setup-renderer") {
      options.setupRenderer = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function runScenario(scenario: ScenarioDefinition, artifactRoot: string, render: boolean): ScenarioResult {
  const scene = buildScenario(scenario.id);
  const excalidrawPath = join(artifactRoot, `${scenario.id}.excalidraw`);
  const pngPath = join(artifactRoot, `${scenario.id}.png`);
  scene.write(excalidrawPath);

  if (render) {
    const status = renderMain([excalidrawPath, pngPath]);
    if (status !== 0) {
      throw new Error(`Rendering failed for ${scenario.id}`);
    }
  }

  const checks = validateScenarioOutput(scenario, excalidrawPath, pngPath, render);
  return {
    scenario,
    excalidrawPath,
    pngPath,
    status: checks.every((check) => check.ok) ? "pass" : "fail",
    checks,
  };
}

function buildScenario(id: string): Scene {
  switch (id) {
    case "basic-service-flow":
      return basicServiceFlow();
    case "rag-answer-trace":
      return ragAnswerTrace();
    case "trading-risk-gate":
      return tradingRiskGate();
    case "model-training-feedback-loop":
      return modelTrainingFeedbackLoop();
    case "plan-todo-session-tree":
      return planTodoSessionTree();
    case "agent-evaluation-harness":
      return agentEvaluationHarness();
    default:
      throw new Error(`No scenario builder registered for ${id}`);
  }
}

function basicServiceFlow(): Scene {
  const scene = new Scene({ seed: 101, assetRegistry: AssetRegistry.bundled() });
  scene.text(40, 24, "Basic Service Flow", { size: 30, width: 760, align: "center" });
  scene.text(40, 64, "Request intake, agent work, guardrail acceptance, and durable storage.", {
    size: 16,
    color: "#475569",
    width: 760,
    align: "center",
  });

  const api = icon(scene, "api_connector", 40, 150, "API\nconnector");
  const worker = icon(scene, "robot_agent", 240, 150, "Agent\nworker");
  const guard = icon(scene, "guardrails", 440, 150, "Guardrail\ncheck");
  const database = icon(scene, "historical_database", 640, 150, "Historical\ndatabase");

  connectWithLabel(scene, api, worker, "request");
  connectWithLabel(scene, worker, guard, "evaluate");
  connectWithLabel(scene, guard, database, "accepted");
  return scene;
}

function ragAnswerTrace(): Scene {
  const scene = new Scene({ seed: 202, assetRegistry: AssetRegistry.bundled() });
  scene.text(40, 24, "RAG Answer Trace", { size: 30, width: 860, align: "center" });
  scene.text(40, 64, "The answer path retrieves context before the LLM responds, while audit and review stay off the main path.", {
    size: 16,
    color: "#475569",
    width: 860,
    align: "center",
  });

  const prompt = icon(scene, "chat_message", 30, 150, "User\nprompt");
  const template = icon(scene, "prompt_template", 205, 150, "Prompt\ntemplate");
  const retriever = icon(scene, "rag_retriever", 380, 150, "Retriever");
  const vector = icon(scene, "vector_database", 380, 335, "Vector\ndatabase");
  const llm = icon(scene, "llm_chat", 575, 150, "LLM\nanswer");
  const audit = icon(scene, "audit_log", 745, 70, "Audit\nlog");
  const review = icon(scene, "human_review", 745, 270, "Human\nreview");

  connectWithLabel(scene, prompt, template, "input");
  connectWithLabel(scene, template, retriever, "query");
  arrowWithLabel(scene, [
    [retriever.bounds.centerX, retriever.bounds.bottom],
    [vector.bounds.centerX, vector.bounds.top],
  ], "retrieve");
  arrowWithLabel(scene, [
    [vector.bounds.right, vector.bounds.centerY],
    [llm.bounds.left, llm.bounds.centerY],
  ], "context");
  connectWithLabel(scene, retriever, llm, "prompt + context");
  arrowWithLabel(scene, [
    [llm.bounds.right, llm.bounds.top + 16],
    [audit.bounds.left, audit.bounds.centerY],
  ], "log");
  arrowWithLabel(scene, [
    [llm.bounds.right, llm.bounds.bottom - 16],
    [review.bounds.left, review.bounds.centerY],
  ], "optional");
  return scene;
}

function tradingRiskGate(): Scene {
  const scene = new Scene({ seed: 303, assetRegistry: AssetRegistry.bundled("trading") });
  scene.text(40, 24, "Trading Risk Gate", { size: 30, width: 860, align: "center" });
  scene.text(40, 64, "Approved trades continue to sizing and the book; rejected trades stop on the blocked branch.", {
    size: 16,
    color: "#475569",
    width: 860,
    align: "center",
  });

  const candles = icon(scene, "candles_price", 35, 175, "Market\ncandles");
  const signal = icon(scene, "target_signal", 225, 175, "Target\nsignal");
  const gate = icon(scene, "risk_gate_shield_lock", 415, 175, "Locked\nrisk gate");
  const size = icon(scene, "position_size", 610, 110, "Position\nsizing");
  const book = icon(scene, "order_book", 780, 110, "Order\nbook");
  const stop = icon(scene, "stop_loss", 610, 305, "Blocked /\nstop-loss");

  connectWithLabel(scene, candles, signal, "features");
  connectWithLabel(scene, signal, gate, "candidate");
  arrowWithLabel(scene, [
    [gate.bounds.right, gate.bounds.centerY - 18],
    [size.bounds.left, size.bounds.centerY],
  ], "pass");
  connectWithLabel(scene, size, book, "approved");
  arrowWithLabel(scene, [
    [gate.bounds.right, gate.bounds.centerY + 22],
    [stop.bounds.left, stop.bounds.centerY],
  ], "reject");
  return scene;
}

function modelTrainingFeedbackLoop(): Scene {
  const scene = new Scene({ seed: 404, assetRegistry: AssetRegistry.bundled() });
  scene.text(30, 24, "Model Training Feedback Loop", { size: 30, width: 1040, align: "center" });
  scene.text(30, 64, "A production ML path with drift-triggered refresh back into training.", {
    size: 16,
    color: "#475569",
    width: 1040,
    align: "center",
  });

  const lake = icon(scene, "data_lake", 25, 145, "Data\nlake", 58);
  const features = icon(scene, "feature_engineering", 165, 145, "Feature\nengineering", 58);
  const split = icon(scene, "train_test_split", 330, 145, "Train/test\nsplit", 58);
  const training = icon(scene, "model_training", 495, 145, "Model\ntraining", 58);
  const validation = icon(scene, "model_validation", 660, 145, "Model\nvalidation", 58);
  const registry = icon(scene, "model_registry", 825, 145, "Model\nregistry", 58);
  const deploy = icon(scene, "model_deployment", 990, 145, "Deploy", 58);
  const monitor = icon(scene, "monitoring_dashboard", 990, 340, "Monitoring", 58);
  const drift = icon(scene, "model_drift_alarm", 660, 340, "Drift\nalarm", 58);
  const refresh = icon(scene, "model_refresh", 495, 340, "Model\nrefresh", 58);

  const path = [lake, features, split, training, validation, registry, deploy];
  for (let index = 0; index < path.length - 1; index += 1) {
    connectWithLabel(scene, path[index], path[index + 1], index === 0 ? "raw" : "next");
  }
  arrowWithLabel(scene, [
    [deploy.bounds.centerX, deploy.bounds.bottom],
    [monitor.bounds.centerX, monitor.bounds.top],
  ], "observe");
  connectWithLabel(scene, drift, refresh, "refresh");
  arrowWithLabel(scene, [
    [monitor.bounds.left, monitor.bounds.centerY],
    [drift.bounds.right, drift.bounds.centerY],
  ], "drift");
  arrowWithLabel(scene, [
    [refresh.bounds.centerX, refresh.bounds.top],
    [training.bounds.centerX, training.bounds.bottom],
  ], "retrain", { dashed: true });
  return scene;
}

function planTodoSessionTree(): Scene {
  const scene = new Scene({ seed: 606, assetRegistry: AssetRegistry.bundled() });
  scene.text(40, 24, "Plan/Todo Session Tree", { size: 30, width: 1120, align: "center" });
  scene.text(40, 64, "A measured tree for shared session state, with noisy cross-links routed or moved into sidecar notes.", {
    size: 16,
    color: "#475569",
    width: 1120,
    align: "center",
  });

  layout.tree(scene, {
    root: {
      id: "session",
      title: "Session sharedState",
      iconId: "memory_database",
      bullets: ["goal", "plan", "loop", "todos", "agents", "toolPreset"],
      children: [
        {
          id: "plan",
          title: "plan (PlanState)",
          iconId: "agent_planner",
          bullets: ["active", "executionApproved", "tasks[]", "raw text"],
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
          title: "todos renderer",
          iconId: "tool_call",
          bullets: ["pending", "in_progress", "done", "blocked"],
        },
        {
          id: "persistence",
          title: "Pi persistence",
          iconId: "historical_database",
          bullets: ["goal-state", "loop-state", "restore on start"],
        },
        {
          id: "loop",
          title: "loop (LoopState)",
          iconId: "model_refresh",
          bullets: ["maxTurns", "maxMinutes", "toolCalls", "stopRegex"],
        },
      ],
    },
    secondaryEdges: [
      { from: "persistence", to: "plan", kind: "feedback", label: "restore", lane: "rightOuter" },
    ],
    sidecars: [
      {
        id: "hook-note",
        attachTo: "loop",
        side: "right",
        title: "session_start hook",
        bullets: ["loads saved loop state", "prefer note over reverse arrow"],
      },
    ],
  }, {
    x: 80,
    y: 130,
    nodeWidth: 265,
    nodeHeight: 122,
    levelGap: 78,
    siblingGap: 48,
  });

  return scene;
}

function agentEvaluationHarness(): Scene {
  const scene = new Scene({ seed: 505, assetRegistry: AssetRegistry.bundled() });
  scene.text(40, 24, "Agent Evaluation Harness", { size: 30, width: 980, align: "center" });
  scene.text(40, 64, "Scenario prompts drive an agent runner that saves reviewable Excalidraw and PNG artifacts.", {
    size: 16,
    color: "#475569",
    width: 980,
    align: "center",
  });

  const prompt = icon(scene, "prompt_template", 40, 160, "Scenario\nprompt");
  const planner = icon(scene, "agent_planner", 220, 160, "Agent\nplanner");
  const sandbox = icon(scene, "sandbox_executor", 400, 160, "Sandbox\nexecutor");
  const json = icon(scene, "data_catalog", 580, 105, ".excalidraw\nartifact");
  const renderer = icon(scene, "monitoring_dashboard", 580, 285, "PNG\nrenderer");
  const png = icon(scene, "data_catalog", 760, 285, "PNG\nartifact");
  const review = icon(scene, "human_review", 940, 285, "Human\nreview");

  connectWithLabel(scene, prompt, planner, "prompt");
  connectWithLabel(scene, planner, sandbox, "plan");
  arrowWithLabel(scene, [
    [sandbox.bounds.right, sandbox.bounds.top + 18],
    [json.bounds.left, json.bounds.centerY],
  ], "writes");
  arrowWithLabel(scene, [
    [sandbox.bounds.right, sandbox.bounds.bottom - 18],
    [renderer.bounds.left, renderer.bounds.centerY],
  ], "renders");
  connectWithLabel(scene, renderer, png, "examples/out/...png");
  connectWithLabel(scene, png, review, "review");
  scene.text(json.bounds.left - 10, json.bounds.bottom + 8, "examples/out/agent-evals/*.excalidraw", {
    size: 13,
    color: "#475569",
    width: 230,
    align: "center",
  });
  scene.text(png.bounds.left - 10, png.bounds.bottom + 8, "examples/out/agent-evals/*.png", {
    size: 13,
    color: "#475569",
    width: 200,
    align: "center",
  });
  return scene;
}

function icon(scene: Scene, iconId: string, x: number, y: number, label: string, iconSize = 68): PlacedBlock {
  return layout.iconWithLabel(scene, iconId, x, y, {
    label,
    iconSize,
    labelSize: 14,
    labelWidth: Math.max(iconSize * 1.7, 96),
  });
}

function connectWithLabel(scene: Scene, source: PlacedBlock, target: PlacedBlock, label: string): void {
  arrowWithLabel(scene, [
    [source.bounds.right, source.bounds.centerY],
    [target.bounds.left, target.bounds.centerY],
  ], label);
}

function arrowWithLabel(
  scene: Scene,
  points: Array<[number, number]>,
  label: string,
  options: { dashed?: boolean } = {},
): void {
  scene.arrow(points, { dashed: options.dashed ?? false });
  const midpoint = points[Math.floor((points.length - 1) / 2)];
  const next = points[Math.min(points.length - 1, Math.floor((points.length - 1) / 2) + 1)];
  const x = (midpoint[0] + next[0]) / 2;
  const y = (midpoint[1] + next[1]) / 2;
  scene.text(x - 46, y - 24, label, {
    size: 12,
    color: "#475569",
    width: 92,
    align: "center",
  });
}

function validateScenarioOutput(
  scenario: ScenarioDefinition,
  excalidrawPath: string,
  pngPath: string,
  render: boolean,
): Array<{ name: string; ok: boolean; detail: string }> {
  const scene = JSON.parse(readFileSync(excalidrawPath, "utf8")) as {
    type?: string;
    elements?: Array<Record<string, unknown>>;
    files?: Record<string, unknown>;
  };
  const requiredAliases = [
    ...scenario.expected_output.required_asset_aliases.core,
    ...scenario.expected_output.required_asset_aliases.trading,
  ];
  const imageCount = scene.elements?.filter((element) => element.type === "image").length ?? 0;
  const fileCount = Object.keys(scene.files ?? {}).length;
  const bounds = boundsForJson(scene.elements ?? []);
  const png = render && existsSync(pngPath) ? readFileSync(pngPath) : Buffer.alloc(0);

  return [
    {
      name: "valid Excalidraw JSON",
      ok: scene.type === "excalidraw" && (scene.elements?.length ?? 0) > 0,
      detail: `${scene.elements?.length ?? 0} elements`,
    },
    {
      name: "embedded required assets",
      ok: imageCount >= requiredAliases.length && fileCount >= requiredAliases.length,
      detail: `${imageCount} images, ${fileCount} files, ${requiredAliases.length} required aliases`,
    },
    {
      name: "finite scene bounds",
      ok: Number.isFinite(bounds.width) && bounds.width > 0 && Number.isFinite(bounds.height) && bounds.height > 0,
      detail: `${Math.round(bounds.width)}x${Math.round(bounds.height)}`,
    },
    ...validateScenarioStructure(scenario.id, scene.elements ?? []),
    {
      name: "PNG rendered",
      ok: !render || (png.length > 1024 && png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"),
      detail: render ? `${png.length} bytes` : "skipped",
    },
  ];
}

function validateScenarioStructure(id: string, elements: Array<Record<string, unknown>>): Array<{ name: string; ok: boolean; detail: string }> {
  if (id !== "plan-todo-session-tree") {
    return [];
  }
  const text = elements
    .filter((element) => element.type === "text")
    .map((element) => String(element.text ?? ""))
    .join("\n");
  const dashedEdges = elements.filter((element) => element.type === "arrow" && element.strokeStyle === "dashed").length;
  const requiredLabels = ["Session sharedState", "plan (PlanState)", "todos renderer", "loop (LoopState)", "session_start hook"];
  const missingLabels = requiredLabels.filter((label) => !text.includes(label));
  return [
    {
      name: "plan/todo tree labels",
      ok: missingLabels.length === 0,
      detail: missingLabels.length === 0 ? "all required labels present" : `missing: ${missingLabels.join(", ")}`,
    },
    {
      name: "feedback edge present",
      ok: dashedEdges >= 1,
      detail: `${dashedEdges} dashed arrows`,
    },
  ];
}

function boundsForJson(elements: Array<Record<string, unknown>>): Bounds {
  const finite = elements
    .map((element) => ({
      x: Number(element.x),
      y: Number(element.y),
      width: Number(element.width),
      height: Number(element.height),
    }))
    .filter((element) => [element.x, element.y, element.width, element.height].every(Number.isFinite));

  if (finite.length === 0) {
    return new Bounds(0, 0, 0, 0);
  }

  const left = Math.min(...finite.map((element) => element.x));
  const top = Math.min(...finite.map((element) => element.y));
  const right = Math.max(...finite.map((element) => element.x + element.width));
  const bottom = Math.max(...finite.map((element) => element.y + element.height));
  return new Bounds(left, top, right - left, bottom - top);
}

function writeReport(scenarioSet: ScenarioSet, results: ScenarioResult[], reportPath: string, options: RunOptions): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  const reportDir = dirname(reportPath);
  const generatedAt = new Date().toISOString();
  const rows = results
    .map((result) => scenarioSection(result, reportDir))
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Excalidraw Diagrams Agent Evaluation Report</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; color: #172554; background: #f8fafc; }
      main { max-width: 1120px; margin: 0 auto; padding: 40px 24px 64px; }
      h1 { margin: 0 0 8px; font-size: 34px; letter-spacing: 0; }
      h2 { margin: 36px 0 12px; font-size: 24px; letter-spacing: 0; }
      h3 { margin: 0 0 8px; font-size: 19px; letter-spacing: 0; }
      p, li { line-height: 1.55; }
      code, pre { font-family: "SFMono-Regular", Consolas, monospace; }
      pre { overflow-x: auto; background: #e2e8f0; padding: 14px; border-radius: 6px; }
      a { color: #0b1fb3; }
      .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 24px 0; }
      .metric, .scenario { background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; }
      .scenario { margin: 18px 0; }
      .meta { color: #475569; font-size: 14px; }
      .status-pass { color: #087f3f; font-weight: 700; }
      .status-fail { color: #d92027; font-weight: 700; }
      .grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr); gap: 18px; align-items: start; }
      .preview { width: 100%; max-height: 520px; object-fit: contain; border: 1px solid #cbd5e1; background: white; border-radius: 6px; }
      .checks { margin: 10px 0 0; padding-left: 18px; }
      .links { display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0; }
      @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } main { padding: 28px 16px 48px; } }
    </style>
  </head>
  <body>
    <main>
      <h1>Excalidraw Diagrams Agent Evaluation Report</h1>
      <p class="meta">Generated ${escapeHtml(generatedAt)} from <code>evals/agent-diagram-scenarios.json</code>.</p>
      <div class="summary">
        <div class="metric"><strong>${results.length}</strong><br />scenarios executed</div>
        <div class="metric"><strong>${results.filter((result) => result.status === "pass").length}</strong><br />passed validation</div>
        <div class="metric"><strong>${options.render ? "enabled" : "skipped"}</strong><br />PNG rendering</div>
        <div class="metric"><strong>${escapeHtml(relative(ROOT, resolve(options.artifactRoot)))}</strong><br />artifact root</div>
      </div>

      <h2>Runner Contract</h2>
      <ul>
        ${scenarioSet.runner_contract.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("\n")}
      </ul>

      <h2>Scenario Results</h2>
      ${rows}

      <h2>npm / npx Publication Instructions</h2>
      <p><code>@kroffske/excalidraw-diagrams</code> was first published as version 0.1.0 on 2026-05-31. Recheck the current registry version before each new publish.</p>
      <pre><code>npm view @kroffske/excalidraw-diagrams version --json
npm run release:check
npm login
npm publish --access public

# User install after publish:
npm install @kroffske/excalidraw-diagrams
npx @kroffske/excalidraw-diagrams setup --agent codex
npx excalidraw-render-setup
npx excalidraw-render examples/out/basic_scene.excalidraw examples/out/basic_scene.png</code></pre>

      <h2>Review Rubric</h2>
      <ul>
        ${Object.entries(scenarioSet.review_rubric).map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value)}</li>`).join("\n")}
      </ul>
    </main>
  </body>
</html>
`;
  writeFileSync(reportPath, html, "utf8");
}

function scenarioSection(result: ScenarioResult, reportDir: string): string {
  const scenario = result.scenario;
  const excalidrawLink = relative(reportDir, result.excalidrawPath);
  const pngLink = relative(reportDir, result.pngPath);
  const required = [
    ...scenario.expected_output.required_asset_aliases.core.map((alias) => `core/${alias}`),
    ...scenario.expected_output.required_asset_aliases.trading.map((alias) => `trading/${alias}`),
  ];
  return `<section class="scenario">
  <div class="grid">
    <div>
      <h3>${escapeHtml(scenario.title)} <span class="meta">(${escapeHtml(scenario.difficulty)})</span></h3>
      <p class="${result.status === "pass" ? "status-pass" : "status-fail"}">${result.status.toUpperCase()}</p>
      <p><strong>Prompt:</strong> ${escapeHtml(scenario.prompt)}</p>
      <p><strong>Expected layout:</strong> ${escapeHtml(scenario.expected_output.layout)}</p>
      <p><strong>Required assets:</strong> ${escapeHtml(required.join(", "))}</p>
      <ul>
        ${scenario.expected_output.required_structure.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
      </ul>
      <div class="links">
        <a href="${escapeHtml(excalidrawLink)}">${escapeHtml(scenario.id)}.excalidraw</a>
        <a href="${escapeHtml(pngLink)}">${escapeHtml(scenario.id)}.png</a>
      </div>
      <ul class="checks">
        ${result.checks.map((check) => `<li>${check.ok ? "PASS" : "FAIL"}: ${escapeHtml(check.name)} (${escapeHtml(check.detail)})</li>`).join("\n")}
      </ul>
    </div>
    <div>
      <img class="preview" src="${escapeHtml(pngLink)}" alt="${escapeHtml(scenario.title)} PNG preview" />
    </div>
  </div>
</section>`;
}

function printUsage(): void {
  console.log(`Usage: npx tsx evals/run-agent-scenarios.ts [options]

Options:
  --artifact-root DIR    Output directory, default from scenario JSON
  --report FILE          HTML report path, default <artifact-root>/report.html
  --skip-render          Write .excalidraw files and skip PNG rendering
  --setup-renderer       Install/update the bundled renderer before running
`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
