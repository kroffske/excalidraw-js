// Weak-LLM diagram eval runner (execution layer for the improvement loop).
//
// Promoted out of .tmp into the package so the prompt-improvement loop has a
// stable, parameterized eval surface. Drives a weak/local model through `pi`
// with the live skills, extracts the restricted-TS graph source, runs it in a
// hardened runner that owns geometry/routing, renders a PNG, and records a
// structured report.
//
// The model context is whatever the live skills currently say. The loop's
// experimental variable is the text of skills/plan-excalidraw-weak-llm/**, so
// re-running this after editing those skills measures the prompt change.
//
// Usage:
//   node scripts/weak-llm-improve/run-eval.mjs [--out=DIR] [--run-id=ID] \
//        [--model=SLUG ...] [--scenario=SLUG ...]
//
// Defaults: all models, all scenarios, out=.tmp/weak-llm-loop/<run-id>.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { ALLOWED_ICONS, buildRunner } from "./runner-template.mjs";

const ROOT = process.cwd();
const RENDERER = join(ROOT, "dist", "bin", "excalidraw-render.js");
const FENCE = "```";

const MODELS = [
  {
    slug: "local-omlx-qwen36-35b-a3b-4bit",
    model: "omlx/Qwen3.6-35B-A3B-4bit",
  },
  {
    slug: "openrouter-qwen3-coder-30b-a3b-instruct",
    model: "openrouter/qwen/qwen3-coder-30b-a3b-instruct",
  },
];

const SCENARIOS = [
  {
    slug: "ml-system-design-train-val",
    title: "Classic ML Training and Validation System Design",
    diagramTitle: "weak-model ML train/validation system design",
    thesis:
      "Raw data is split before any fitting; features are fit on the train split only; a model is trained and tuned against a validation split; the chosen model is scored once on a held-out test split and promoted to the registry only after passing the evaluation gate.",
    layoutFamily: "process-spine with a tuning/monitoring sidecar",
    sections:
      "Data, Feature engineering, Training, Validation and tuning, Evaluation gate, Registry and serving.",
    qualityTarget:
      "The main spine data -> features -> train -> validate -> test -> registry -> serving should read as one clear top-to-bottom flow; the experiment tracker, hyperparameter search, and drift monitor should read as sidecars, not a tangled second flow.",
    layoutHint:
      "Use horizontal bands top to bottom; keep each band a wide row. Put experiment_tracker and hyperparameter_search as a sidecar near Training/Validation, and drift_monitor as a sidecar near serving. Do not stack a whole band into a tall vertical column.",
    sourcePacket: [
      "Context (a generic but realistic supervised-learning training/validation system). Use exactly these components and relationships; do not invent extra steps or guess details:",
      "- Data: a raw dataset is ingested from a warehouse, schema-validated, and split into train/validation/test BEFORE any feature fitting, to avoid leakage.",
      "- Feature engineering: a feature pipeline is FIT on the train split only, then applied (transform) to validation and test. Fitted feature state (encoders, scalers, vocab) is saved for serving.",
      "- Training: a model is trained on the transformed train split; an experiment tracker logs params and metrics for every run.",
      "- Validation and tuning: hyperparameters are tuned against the validation split; the best config is selected by the validation metric.",
      "- Evaluation gate: the selected model is scored ONCE on the held-out test split and must clear a metric threshold plus a fairness/sanity check before promotion.",
      "- Registry and serving: a passing model plus its fitted feature state are versioned in a model registry, deployed behind a serving endpoint, and watched by a drift monitor that can trigger retraining.",
      "",
      "Recommended semantic inventory:",
      "- data: raw_dataset, schema_validation, train_val_test_split.",
      "- feature_engineering: feature_pipeline_fit, feature_transform, fitted_feature_state.",
      "- training: train_model, experiment_tracker.",
      "- validation_tuning: validation_score, hyperparameter_search, best_config.",
      "- evaluation_gate: test_score, metric_threshold_gate, fairness_check.",
      "- registry_serving: model_registry, serving_endpoint, drift_monitor.",
      "",
      "Primary edges:",
      "- raw_dataset -> schema_validation -> train_val_test_split.",
      "- train_val_test_split -> feature_pipeline_fit -> feature_transform -> train_model.",
      "- train_model -> validation_score -> hyperparameter_search -> best_config -> test_score.",
      "- test_score -> metric_threshold_gate -> model_registry -> serving_endpoint.",
      "- feature_pipeline_fit -> fitted_feature_state; fitted_feature_state -> model_registry.",
      "",
      "Optional/supporting edges to omit when noisy:",
      "- experiment_tracker logged from every training/validation step (make it a sidecar bullet instead).",
      "- fairness_check and drift_monitor cross-links unless they sit adjacent.",
      "- the serving_endpoint -> drift_monitor -> train_model retrain loop if it would cross the whole canvas (keep it as a short note).",
    ].join("\n"),
  },
  {
    slug: "smart-bash-daemon-lifecycle",
    title: "Smart Bash Resident Daemon Lifecycle",
    diagramTitle: "weak-model daemon lifecycle map",
    thesis:
      "A shell invocation reaches a singleton resident daemon through the CLI/start guard, the daemon owns socket/runtime state, serves requests through a loaded model, and releases resources on idle exit.",
    layoutFamily: "stateful lifecycle with resource sidecars",
    sections:
      "Invocation, Singleton start guard, Resident daemon resources, Request serving, Idle shutdown.",
    qualityTarget:
      "The shell -> client -> guard -> daemon -> runtime -> response path should be clear; lock/socket/model artifacts should read as resources, not as a tangled second main flow.",
    layoutHint:
      "Prefer three compact bands if that reduces crossings: invocation/startup chain; resident daemon request path; shutdown chain. In the resident band, put daemon_socket -> request_handler -> daemon_runtime -> autocomplete_decode -> json_response in one row when possible, and put model_artifact as a sidecar below or next to daemon_runtime. If runtime_to_decode crosses suggest_request or json_response, move autocomplete_decode into the resident row or omit runtime_to_decode.",
    sourcePacket: [
      "Source packet from /Users/ravius/projects/smart_bash/docs/resources/daemon-lifecycle.puml:",
      "- Person shell opens prompt with snippet or calls suggest.",
      "- CLI client starts daemon, pings readiness, and sends JSON requests.",
      "- Start guard serializes startup through ping, flock probe, and daemon.starting.",
      "- daemon.lock is a lifetime singleton flock for one live daemon.",
      "- Resident daemon holds Unix socket, runtime, and idle watchdog.",
      "- DaemonRuntime loads predictor and runs autocomplete decode.",
      "- Model artifact lives on filesystem from registry or SMART_BASH_MODEL_DIR.",
      "- daemon.sock is the client access point for suggest/ping.",
      "- Daemon self-exits when idle >= TTL and no in-flight requests; process exit releases lock and RAM.",
      "",
      "Recommended semantic inventory:",
      "- invocation: shell_session, cli_client.",
      "- startup_guard: ping_check, start_guard, daemon_lock, daemon_process.",
      "- resident_runtime: daemon_socket, daemon_runtime, model_artifact, request_handler.",
      "- serving: suggest_request, autocomplete_decode, json_response.",
      "- shutdown: idle_watchdog, process_exit, lock_release.",
      "",
      "Primary edges:",
      "- shell_session -> cli_client -> ping_check -> start_guard -> daemon_lock -> daemon_process.",
      "- daemon_process -> daemon_socket; cli_client -> daemon_socket -> request_handler -> daemon_runtime -> autocomplete_decode -> json_response.",
      "- daemon_runtime -> model_artifact.",
      "- idle_watchdog -> process_exit -> lock_release.",
      "- connect daemon_process -> idle_watchdog only if idle_watchdog is placed adjacent without crossing other cards; otherwise mention the watchdog in the daemon_process bullets and omit that edge.",
      "",
      "Optional edges to omit when noisy:",
      "- A self-loop on daemon_process if it would cross text.",
      "- Repeated ping/suggest edges when one client->socket edge already tells the story.",
      "- client -> daemon_socket if it crosses shell/startup cards.",
      "- daemon_process -> idle_watchdog if it crosses resource or serving cards.",
    ].join("\n"),
  },
  {
    slug: "excalidraw-js-repo-map",
    title: "excalidraw-js Repository Architecture Map",
    mode: "stepwise",
    diagramTitle: "weak-model excalidraw-js repo map",
    thesis:
      "A request moves from the user surface (README, CLI, examples) through the planning skills into the core graph/layout/render source, which emits a validated .excalidraw artifact, with tests and validation as the quality gates.",
    layoutFamily: "layered-map",
    sections:
      "User surface, Planning skills, Core source, Layout and render, Validation and tests.",
    qualityTarget:
      "The layered map should read top-to-bottom: user surface -> planning -> core -> render -> validation; keep each section a wide row.",
    layoutHint:
      "Five horizontal bands, each a wide row. Keep validation/tests as the bottom band. Do not stack a section into a tall vertical column.",
  },
];

const filters = parseArgs(process.argv.slice(2));
const RUN_ID = filters.runId ?? "run";
const SAMPLES = Math.max(1, parseInt(filters.samples, 10) || 1);
const OUT = resolve(filters.out ?? join(".tmp", "weak-llm-loop", RUN_ID));

loadDotEnv(join(ROOT, ".env"));
mkdirSync(OUT, { recursive: true });

const selectedScenarios = filterItems(SCENARIOS, filters.scenarios, "scenario");
const selectedModels = filterItems(MODELS, filters.models, "model");

const results = [];
for (const scenario of selectedScenarios) {
  writeScenarioArtifacts(scenario);
  for (const model of selectedModels) {
    for (let sample = 1; sample <= SAMPLES; sample += 1) {
      const r = runScenarioModel(scenario, model, sample);
      r.sample = sample;
      results.push(r);
    }
  }
}

const report = {
  runId: RUN_ID,
  out: OUT,
  generatedAt: new Date().toISOString(),
  samples: SAMPLES,
  models: selectedModels.map((m) => m.slug),
  scenarios: selectedScenarios.map((s) => s.slug),
  results,
};
const reportPath = join(OUT, "report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));
writeFileSync(join(OUT, "comparison.md"), buildComparison(results));
console.log(JSON.stringify({ reportPath, out: OUT, results }, null, 2));

function parseArgs(args) {
  const parsed = { scenarios: new Set(), models: new Set(), out: null, runId: null, samples: null };
  for (const arg of args) {
    if (arg.startsWith("--out=")) {
      parsed.out = arg.slice("--out=".length);
    } else if (arg.startsWith("--run-id=")) {
      parsed.runId = arg.slice("--run-id=".length);
    } else if (arg.startsWith("--samples=")) {
      parsed.samples = arg.slice("--samples=".length);
    } else if (arg.startsWith("--scenario=")) {
      parsed.scenarios.add(arg.slice("--scenario=".length));
    } else if (arg.startsWith("--model=")) {
      parsed.models.add(arg.slice("--model=".length));
    } else if (SCENARIOS.some((item) => item.slug === arg)) {
      parsed.scenarios.add(arg);
    } else if (MODELS.some((item) => item.slug === arg || item.model === arg)) {
      parsed.models.add(arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function filterItems(items, selected, kind) {
  if (selected.size === 0) {
    return items;
  }
  const found = items.filter((item) => selected.has(item.slug) || selected.has(item.model));
  if (found.length === 0) {
    throw new Error(`No ${kind}s selected. Known ${kind}s: ${items.map((item) => item.slug).join(", ")}`);
  }
  return found;
}

function writeScenarioArtifacts(scenario) {
  const dir = join(OUT, scenario.slug);
  mkdirSync(dir, { recursive: true });
  const packet = scenario.sourcePacket ?? "(stepwise scenario — the model gathers context with tools at runtime; see each sample's step1-context.md / step2-plan.md)";
  writeFileSync(join(dir, "input-request.md"), packet);
  writeFileSync(join(dir, "graph-plan.md"), [
    `# ${scenario.title}`,
    "",
    `thesis: ${scenario.thesis}`,
    `layout_family: ${scenario.layoutFamily}`,
    `sections: ${scenario.sections}`,
    `quality_target: ${scenario.qualityTarget}`,
    "",
    packet,
  ].join("\n"));
}

function runScenarioModel(scenario, config, sample = 1) {
  const outDir = join(OUT, scenario.slug, config.slug, `sample-${sample}`);
  mkdirSync(outDir, { recursive: true });

  // Stepwise scenarios (e.g. "this repo") have NO hardcoded source packet: the
  // weak model gathers context with tools (step 1) and writes its own graph plan
  // (step 2), each as an artifact, before the normal draw step (step 3). This
  // tests how a weak model collects and aggregates context, not just drawing.
  let activeScenario = scenario;
  if (scenario.mode === "stepwise") {
    const plan = runGatherAndPlan(scenario, config, outDir);
    if (!plan) {
      return failure(scenario, config, outDir, "stepwise-failed", "gather/plan step produced no usable plan", 1);
    }
    activeScenario = { ...scenario, sourcePacket: plan };
  }

  let feedback = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const tag = `attempt-${attempt}`;
    const prompt = feedback ? buildRetryPrompt(activeScenario, config, feedback) : buildPrompt(activeScenario, config);
    const promptPath = join(outDir, `${tag}-prompt.md`);
    const rawPath = join(outDir, `${tag}-raw-response.txt`);
    const sourcePath = join(outDir, `${tag}-source.ts`);
    const runnerPath = join(outDir, `${tag}-runner.mjs`);
    const excalidrawPath = join(outDir, `${tag}-diagram.excalidraw`);
    const pngPath = join(outDir, `${tag}-diagram.png`);
    const summaryPath = join(outDir, `${tag}-summary.json`);
    const errorPath = join(outDir, `${tag}-error.txt`);
    writeFileSync(promptPath, prompt);

    const pi = spawnSync("pi", [
      "--model", config.model,
      "--no-tools",
      "--no-context-files",
      "--no-extensions",
      "--no-prompt-templates",
      "--skill", resolve("skills/plan-excalidraw-graph"),
      "--skill", resolve("skills/plan-excalidraw-weak-llm"),
      "--skill", resolve("skills/excalidraw-diagrams"),
      "--name", `${scenario.slug}-${config.slug}-${tag}`,
      "-p", prompt,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
    });

    const raw = `${pi.stdout ?? ""}${pi.stderr ? `\n[stderr]\n${pi.stderr}` : ""}`;
    writeFileSync(rawPath, raw);

    if (pi.error) {
      writeFileSync(errorPath, `pi failed: ${pi.error.message}`);
      return failure(scenario, config, outDir, "pi-error", pi.error.message, attempt);
    }
    if ((pi.status ?? 1) !== 0) {
      writeFileSync(errorPath, `pi exited with status ${pi.status}\n\n${raw}`);
      return failure(scenario, config, outDir, "pi-nonzero", `pi exited with status ${pi.status}`, attempt);
    }

    let source;
    try {
      source = extractSource(raw);
      validateSourceShape(source, scenario);
      writeFileSync(sourcePath, source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeFileSync(errorPath, `${message}\n\n${raw}`);
      if (attempt < 3) {
        feedback = { stage: "extract-source", message, source: "", raw };
        continue;
      }
      return failure(scenario, config, outDir, "extract-source", message, attempt);
    }

    writeFileSync(runnerPath, buildRunner(
      source,
      { title: activeScenario.diagramTitle, thesis: activeScenario.thesis, slug: activeScenario.slug },
      { excalidrawPath, summaryPath },
    ));

    const run = spawnSync("node", [runnerPath], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 90_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (run.error || (run.status ?? 1) !== 0) {
      const message = run.error?.message ?? `runner exited with status ${run.status}`;
      const details = `${message}\n\nstdout:\n${run.stdout ?? ""}\n\nstderr:\n${run.stderr ?? ""}`;
      writeFileSync(errorPath, details);
      if (attempt < 3) {
        feedback = { stage: "runner-failed", message: details, source, raw };
        continue;
      }
      return failure(scenario, config, outDir, "runner-failed", message, attempt);
    }

    const render = spawnSync("node", [RENDERER, "--setup", excalidrawPath, pngPath], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (render.error || (render.status ?? 1) !== 0 || !existsSync(pngPath)) {
      const message = render.error?.message ?? `render exited with status ${render.status}`;
      writeFileSync(errorPath, `${message}\n\nstdout:\n${render.stdout ?? ""}\n\nstderr:\n${render.stderr ?? ""}`);
      return failure(scenario, config, outDir, "render-failed", message, attempt);
    }

    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    return {
      scenario: scenario.slug,
      model: config.model,
      slug: config.slug,
      status: "rendered",
      attempts: attempt,
      outDir,
      rawPath,
      sourcePath,
      excalidrawPath,
      pngPath,
      summary,
    };
  }

  return failure(scenario, config, outDir, "unknown", "retry loop exhausted", 3);
}

// Stepwise context-gathering for "this repo" style scenarios. The weak model
// runs WITH tools (step 1) to explore the repo and write a context digest, then
// (step 2, no tools) turns that digest into a graph plan. The plan is returned
// as the source packet for the normal draw step. Each step writes an artifact so
// context stays clean and steps can be inspected or delegated.
function runGatherAndPlan(scenario, config, outDir) {
  const gatherPrompt = [
    `You are a weak/local model (${config.model}). Explore THIS repository (your current working directory) using your read/search tools, then write a concise architecture context digest.`,
    "",
    "Scope: only look at README.md, package.json, src/, skills/, and examples/. Do NOT read node_modules, dist, coverage, .git, or .tmp.",
    "",
    `Target understanding: ${scenario.thesis}`,
    "",
    "Output ONLY a compact markdown digest (<= 40 lines), grouped by area. For each area list 2-6 component names with one short phrase each. Cover: user surface (README, CLI/bins, examples, package exports), planning/authoring skills, core source modules (src/*.ts and what each does), layout & render, validation & tests. No preamble.",
  ].join("\n");
  const gather = spawnSync("pi", [
    "--model", config.model,
    "--no-extensions",
    "--no-prompt-templates",
    "--name", `${scenario.slug}-${config.slug}-step1-gather`,
    "-p", gatherPrompt,
  ], { cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
  const gatherRaw = `${gather.stdout ?? ""}${gather.stderr ? `\n[stderr]\n${gather.stderr}` : ""}`;
  writeFileSync(join(outDir, "step1-context.md"), gatherRaw);
  if (gather.error || (gather.status ?? 1) !== 0) {
    return null;
  }
  const digest = gatherRaw.trim();

  const planPrompt = [
    `You are a weak/local model (${config.model}). Turn the repo context digest below into a graph plan for a one-screen architecture map.`,
    "",
    `Diagram thesis: ${scenario.thesis}`,
    `Layout family: ${scenario.layoutFamily}`,
    "",
    "Output ONLY this plan format (markdown), nothing else:",
    "",
    "thesis: <one sentence>",
    "layout_family: layered-map",
    "sections:",
    "- band_id: node_a, node_b   (3-6 nodes per band, snake_case ids)",
    "primary_edges:",
    "- node_a -> node_b: short_label",
    "optional_edges_omitted:",
    "- node_x -> node_y: reason",
    "",
    "Use 5-6 bands and 12-18 nodes total, grouped as layers (user surface, planning skills, core source, layout/render, validation/tests).",
    "",
    "Repo context digest:",
    digest,
  ].join("\n");
  const plan = spawnSync("pi", [
    "--model", config.model,
    "--no-tools",
    "--no-context-files",
    "--no-extensions",
    "--no-prompt-templates",
    "--name", `${scenario.slug}-${config.slug}-step2-plan`,
    "-p", planPrompt,
  ], { cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
  const planRaw = `${plan.stdout ?? ""}${plan.stderr ? `\n[stderr]\n${plan.stderr}` : ""}`;
  writeFileSync(join(outDir, "step2-plan.md"), planRaw);
  if (plan.error || (plan.status ?? 1) !== 0) {
    return null;
  }

  return [
    "Source packet (the model gathered this context and wrote this plan itself):",
    planRaw.trim(),
  ].join("\n");
}

function buildPrompt(scenario, config) {
  return `Use $plan-excalidraw-graph, $plan-excalidraw-weak-llm, and $excalidraw-diagrams.

Task: author a semantic Excalidraw diagram as restricted TypeScript graph source.

You are a weak/local model lane (${config.model}). Do not write raw Excalidraw JSON. Do not calculate detailed coordinates for every card. Think in named graph objects and relationships.

Diagram thesis: ${scenario.thesis}
Layout family: ${scenario.layoutFamily}
Expected sections: ${scenario.sections}
Quality target: ${scenario.qualityTarget}
Layout hint: ${scenario.layoutHint}

The runner already provides:
- \`scene\`: a Scene with bundled assets.
- \`layout\`: the excalidraw-diagrams layout namespace.
- \`node(id, title, iconId, bullets)\`: creates a named auto-sized card and records its bounds.
- \`section(title, group)\`: wraps a row/column/group in a measured section. The runner stacks sections; do not pass coordinates.
- \`connect(edgeId, fromId, toId, label, options?)\`: connects named cards and records the edge for validation.

Allowed authoring pattern:
${FENCE}ts
const entry = layout.row({
  source: node("source", "Source", "data_catalog", ["input data", "owned contract"]),
  transform: node("transform", "Transform", "function_router", ["normalizes", "validates"]),
});
section("Entry", entry);

const runtime = layout.row({
  predictor: node("predictor", "Predictor", "model_deployment", ["loaded model", "runtime contract"]),
  output: node("output", "Output", "cloud_data", ["written artifact"]),
});
section("Runtime", runtime);

connect("source_to_transform", "source", "transform", "feeds");
connect("transform_to_predictor", "transform", "predictor", "serves");
${FENCE}

Rules:
- Return exactly one fenced ${FENCE}ts code block and no prose outside it.
- Before writing code, internally make a pre-code plan: thesis, layout_family, sections, primary_edges, supporting_edges, optional_edges_omitted, and row_order_notes. Do not print the plan.
- Use stable snake_case ids.
- Use only known icon ids from this list: ${ALLOWED_ICONS.join(", ")}.
- Use \`layout.row\`, \`layout.column\`, \`section(title, group)\`, \`node(...)\`, and \`connect(...)\`.
- Do not pass x/y coordinates to \`section\`; the runner computes section positions.
- Do not tune small gaps. Omit \`gap\` unless the semantic grouping needs extra space.
- Do not import anything.
- Do not create \`Scene\`.
- Do not call \`scene.write\`.
- Do not use numeric child indexes.
- Do not create one parent row/column containing all sections. Build each section group independently, then call \`section(...)\`.
- Order nodes to minimize primary edge length: put the target under/next to the source for primary edges.
- Omit optional edges that would cross two or more section bands or make the primary story harder to read.
- Create all sections before \`connect(...)\`, then emit \`connect(...)\` calls in primary-story order.
- Keep the graph to 12-18 nodes and 10-16 edges.
- Use short relationship labels: feeds, trains, publishes, validates, loads, serves, releases.

${scenario.sourcePacket}
`;
}

function buildRetryPrompt(scenario, config, feedback) {
  return `${buildPrompt(scenario, config)}

Previous attempt failed during ${feedback.stage}. This is a hard validation error from the runner, not something the runner will silently repair.

Concise error:

${FENCE}text
${truncate(feedback.message, 4000)}
${FENCE}

Previous generated source:

${FENCE}ts
${truncate(feedback.source || "(source was not extracted)", 5000)}
${FENCE}

Rewrite the entire TypeScript graph source.

Specific correction rules:
- Create all nodes and sections before calling any connect(...).
- Do not connect to a node id before it has been created.
- Keep all relationships by stable ids.
- Let the runner compute section positions and row spacing. Use section("Title", group), not section("Title", 10, group).
- Do not wrap all sections in one parent row or column. Build each section group independently, then call section(...).
- If an arrow-through-block error names a long optional edge, remove that connect(...) call instead of adding more layout.
- For smart-bash-daemon-lifecycle specifically, omit client -> daemon_socket and daemon_process -> idle_watchdog/process_to_watchdog when they cross other cards. Keep the visible shutdown chain idle_watchdog -> process_exit -> lock_release.
- For smart-bash-daemon-lifecycle, if runtime_to_decode crosses suggest_request or json_response, move autocomplete_decode into the same row as daemon_runtime/request_handler, or omit runtime_to_decode and keep decode_to_response.
- Return exactly one fenced ${FENCE}ts code block and no prose outside it.
`;
}

function extractSource(raw) {
  const match = raw.match(/```(?:ts|typescript|js|javascript)?\s*\n([\s\S]*?)```/i);
  if (match) {
    return match[1].trim();
  }
  throw new Error("Model response did not contain a fenced TypeScript code block.");
}

function validateSourceShape(source, scenario) {
  const forbidden = [
    /\bimport\s+/,
    /\bexport\s+/,
    /new\s+Scene\b/,
    /scene\.write\s*\(/,
    /\[[0-9]+\]/,
    /\bchildren\s*:/,
    /\bminWidth\s*:/,
    /\bminHeight\s*:/,
    /\bx\s*:/,
    /\by\s*:/,
  ];
  const bad = forbidden.find((pattern) => pattern.test(source));
  if (bad) {
    throw new Error(`Generated source violates restricted graph contract for ${scenario.slug}: ${bad}`);
  }
  if (!/node\s*\(/.test(source) || !/connect\s*\(/.test(source) || !/section\s*\(/.test(source)) {
    throw new Error("Generated source must use node(...), connect(...), and section(...).");
  }
  if (/section\s*\(\s*["'][^"']+["']\s*,\s*\w+\.\w+\s*\)/.test(source)) {
    throw new Error("Do not create one parent layout object and section its children through parent.child handles. Build each section group independently.");
  }
}

function loadDotEnv(path) {
  if (!existsSync(path)) {
    return;
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (!key) {
      continue;
    }
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function truncate(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...<truncated>`;
}

function failure(scenario, config, outDir, code, message, attempts = 1) {
  return {
    scenario: scenario.slug,
    model: config.model,
    slug: config.slug,
    status: "failed",
    attempts,
    code,
    message,
    outDir,
  };
}

function buildComparison(results) {
  const lines = [
    "# Weak-LLM Scenario Comparison",
    "",
    "| Scenario | Model | Sample | Status | Attempts | Nodes | Edges | Validation | PNG | Notes |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- |",
  ];
  for (const result of results) {
    const validation = result.summary?.validation?.ok ? "ok" : result.summary?.validation ? "issues" : "-";
    const png = result.pngPath ? `[png](${result.pngPath})` : "-";
    const notes = result.status === "rendered" ? "rendered; pending visual judge" : `${result.code}: ${result.message}`;
    lines.push([
      result.scenario,
      result.slug,
      result.sample ?? 1,
      result.status,
      result.attempts,
      result.summary?.nodes ?? "-",
      result.summary?.edges ?? "-",
      validation,
      png,
      notes.replace(/\|/g, "/"),
    ].join(" | "));
  }
  lines.push("");
  return lines.join("\n");
}
