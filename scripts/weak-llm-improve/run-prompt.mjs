// Run ONE eval prompt (evals/eval*/prompt*.md) through a weak model via `pi`
// and render the result. This is the executable form of evals/README.md: you
// say "run eval1", I run this.
//
// Reads the prompt's frontmatter for metadata (eval id, slug, diagram_title,
// thesis, mode, models, samples), feeds the prompt body to `pi` with the live
// skills, extracts the restricted-TS graph, renders a validated PNG via the
// shared runner, and writes everything under evals/run/<date>-<eval>/.
//
// Only markdown lives in evals/eval*/. Generated JS (source.ts, runner.mjs) and
// PNGs live in evals/run/.
//
// Usage:
//   node scripts/weak-llm-improve/run-prompt.mjs --eval=evals/eval1 \
//        [--model=SLUG ...] [--samples=N] [--date=YYYY-MM-DD]
//
// Defaults: models + samples come from the prompt frontmatter (or all known
// models / 1 sample); date is today.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { ALLOWED_ICONS, buildRunner } from "./runner-template.mjs";

const ROOT = process.cwd();
const RENDERER = join(ROOT, "dist", "bin", "excalidraw-render.js");
const FENCE = "```";
const SKILLS = ["plan-excalidraw-graph", "plan-excalidraw-weak-llm", "excalidraw-diagrams"];

const MODELS = {
  "local-omlx-qwen36-35b-a3b-4bit": "omlx/Qwen3.6-35B-A3B-4bit",
  "openrouter-qwen3-coder-30b-a3b-instruct": "openrouter/qwen/qwen3-coder-30b-a3b-instruct",
};

loadDotEnv(resolve(".env"));
const args = parseArgs(process.argv.slice(2));
const evalDir = resolve(args.eval ?? fail("--eval=<evals/evalN dir> is required"));
const promptPath = findPrompt(evalDir);
const fm = readFrontmatter(promptPath);
const body = stripFrontmatter(readFileSync(promptPath, "utf8"));

const evalId = fm.eval ?? basename(evalDir);
const slug = fm.slug ?? evalId;
const mode = fm.mode ?? "single";
const date = args.date ?? new Date().toISOString().slice(0, 10);
const samples = Math.max(1, parseInt(args.samples ?? fm.samples ?? "1", 10) || 1);
const modelSlugs = (args.models?.length ? args.models : (fm.models ? fm.models.split(/[\s,]+/).filter(Boolean) : Object.keys(MODELS)))
  .filter((s) => MODELS[s] || fail(`unknown model slug: ${s}`));

const meta = { title: fm.diagram_title ?? fm.title ?? "weak-model diagram", thesis: fm.thesis ?? "", slug };
const runRoot = resolve(join("evals", "run", `${date}-${evalId}`));
mkdirSync(runRoot, { recursive: true });

console.log(`eval=${evalId} slug=${slug} mode=${mode} models=[${modelSlugs.join(", ")}] samples=${samples}`);
console.log(`prompt=${rel(promptPath)} -> run=${rel(runRoot)}\n`);

const results = [];
for (const modelSlug of modelSlugs) {
  for (let sample = 1; sample <= samples; sample += 1) {
    const tag = samples > 1 ? `${modelSlug}/sample-${sample}` : modelSlug;
    const outDir = join(runRoot, tag);
    mkdirSync(outDir, { recursive: true });
    process.stdout.write(`-> ${tag} ... `);
    const r = runOne(MODELS[modelSlug], outDir);
    results.push({ model: modelSlug, sample, ...r });
    console.log(r.status === "rendered"
      ? `OK  nodes=${r.summary.nodes} edges=${r.summary.edges} sections=${r.summary.sections.length} ok=${r.summary.validation.ok}`
      : `FAIL (${r.stage})`);
  }
}

writeRunReport(runRoot, results);
console.log(`\nReport: ${rel(join(runRoot, "run-report.md"))}`);
const ok = results.filter((r) => r.status === "rendered").length;
console.log(`Rendered ${ok}/${results.length}.`);

// ---- core ------------------------------------------------------------------

function runOne(model, outDir) {
  let sourcePacket = "";
  if (mode === "stepwise") {
    const plan = gatherAndPlan(model, outDir);
    if (!plan) return { status: "failed", stage: "stepwise" };
    sourcePacket = plan;
  }
  let feedback = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const prompt = feedback ? retryPrompt(sourcePacket, feedback) : drawPrompt(sourcePacket);
    writeFileSync(join(outDir, `attempt-${attempt}-prompt.md`), prompt);
    const raw = pi(model, ["--no-tools", "--no-context-files", "--no-extensions", "--no-prompt-templates",
      ...SKILLS.flatMap((s) => ["--skill", resolve("skills", s)]), "--name", `${slug}-draw`, "-p", prompt]);
    writeFileSync(join(outDir, `attempt-${attempt}-raw.txt`), raw.text);
    if (!raw.ok) { if (attempt < 3) { feedback = { stage: "pi", message: raw.text, source: "" }; continue; } return { status: "failed", stage: "pi" }; }

    let source;
    try { source = extractSource(raw.text); validateSourceShape(source); }
    catch (e) {
      writeFileSync(join(outDir, `attempt-${attempt}-error.txt`), `${e.message}\n\n${raw.text}`);
      if (attempt < 3) { feedback = { stage: "extract", message: e.message, source: "" }; continue; }
      return { status: "failed", stage: "extract" };
    }
    writeFileSync(join(outDir, "source.ts"), source);

    const rendered = renderSource(source, outDir);
    if (rendered.ok) return { status: "rendered", attempts: attempt, summary: rendered.summary, pngPath: rendered.pngPath };
    writeFileSync(join(outDir, `attempt-${attempt}-error.txt`), rendered.message);
    if (attempt < 3) { feedback = { stage: "runner", message: rendered.message, source }; continue; }
    return { status: "failed", stage: "render" };
  }
  return { status: "failed", stage: "exhausted" };
}

function renderSource(source, outDir) {
  const excalidrawPath = join(outDir, "diagram.excalidraw");
  const summaryPath = join(outDir, "summary.json");
  const pngPath = join(outDir, "diagram.png");
  const runnerPath = join(outDir, "runner.mjs");
  writeFileSync(runnerPath, buildRunner(source, meta, { excalidrawPath, summaryPath }));
  const run = spawnSync("node", [runnerPath], { cwd: ROOT, encoding: "utf8", timeout: 90_000, maxBuffer: 10 * 1024 * 1024 });
  if (run.error || (run.status ?? 1) !== 0) {
    return { ok: false, message: `runner failed\n${run.stderr ?? run.error?.message ?? ""}` };
  }
  const render = spawnSync("node", [RENDERER, "--setup", excalidrawPath, pngPath], { cwd: ROOT, encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  if (render.error || (render.status ?? 1) !== 0 || !existsSync(pngPath)) {
    return { ok: false, message: `render failed\n${render.stderr ?? render.error?.message ?? ""}` };
  }
  return { ok: true, summary: JSON.parse(readFileSync(summaryPath, "utf8")), pngPath };
}

function gatherAndPlan(model, outDir) {
  const gatherPrompt = [
    `You are a weak/local model (${model}). Explore THIS repository (your current working directory) using your read/search tools, then write a concise architecture context digest.`,
    "",
    "Scope: only look at README.md, package.json, src/, skills/, and examples/. Do NOT read node_modules, dist, coverage, .git, or .tmp.",
    "",
    `Target understanding: ${meta.thesis}`,
    "",
    "Output ONLY a compact markdown digest (<= 40 lines), grouped by area. For each area list 2-6 component names with one short phrase each. Cover: user surface (README, CLI/bins, examples, package exports), planning/authoring skills, core source modules (src/*.ts and what each does), layout & render, validation & tests. No preamble.",
  ].join("\n");
  const gather = pi(model, ["--no-extensions", "--no-prompt-templates", "--name", `${slug}-step1-gather`, "-p", gatherPrompt]);
  writeFileSync(join(outDir, "step1-context.md"), gather.text);
  if (!gather.ok) return null;

  const planPrompt = [
    `You are a weak/local model (${model}). Turn the repo context digest below into a graph plan for a one-screen architecture map.`,
    "",
    `Diagram thesis: ${meta.thesis}`,
    `Layout family: ${fm.layout_family ?? "layered-map"}`,
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
    gather.text.trim(),
  ].join("\n");
  const plan = pi(model, ["--no-tools", "--no-context-files", "--no-extensions", "--no-prompt-templates", "--name", `${slug}-step2-plan`, "-p", planPrompt]);
  writeFileSync(join(outDir, "step2-plan.md"), plan.text);
  if (!plan.ok) return null;
  return `Source packet (the model gathered this context and wrote this plan itself):\n${plan.text.trim()}`;
}

// ---- prompt assembly -------------------------------------------------------

function drawPrompt(sourcePacket) {
  return sourcePacket ? `${body}\n\n${sourcePacket}\n` : `${body}\n`;
}

function retryPrompt(sourcePacket, feedback) {
  return `${drawPrompt(sourcePacket)}

Previous attempt failed during ${feedback.stage}. This is a hard error from the runner, not something it will silently repair.

Concise error:

${FENCE}text
${truncate(feedback.message, 4000)}
${FENCE}

${feedback.source ? `Previous generated source:\n\n${FENCE}ts\n${truncate(feedback.source, 5000)}\n${FENCE}\n\n` : ""}Rewrite the entire TypeScript graph source. Create all nodes and sections before any connect(...). If an arrow-through-block error names a long optional edge, remove that connect(...) call instead of adding layout. Return exactly one fenced ${FENCE}ts code block and no prose.
`;
}

// ---- helpers ---------------------------------------------------------------

function pi(model, extraArgs) {
  const p = spawnSync("pi", ["--model", model, ...extraArgs], { cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
  const text = `${p.stdout ?? ""}${p.stderr ? `\n[stderr]\n${p.stderr}` : ""}`;
  return { ok: !p.error && (p.status ?? 1) === 0, text };
}

function extractSource(raw) {
  const m = raw.match(/```(?:ts|typescript|js|javascript)?\s*\n([\s\S]*?)```/i);
  if (m) return m[1].trim();
  throw new Error("Model response did not contain a fenced TypeScript code block.");
}

function validateSourceShape(source) {
  const forbidden = [/\bimport\s+/, /\bexport\s+/, /new\s+Scene\b/, /scene\.write\s*\(/, /\[[0-9]+\]/, /\bchildren\s*:/, /\bminWidth\s*:/, /\bminHeight\s*:/, /\bx\s*:/, /\by\s*:/];
  const bad = forbidden.find((p) => p.test(source));
  if (bad) throw new Error(`Generated source violates restricted graph contract: ${bad}`);
  if (!/node\s*\(/.test(source) || !/connect\s*\(/.test(source) || !/section\s*\(/.test(source)) {
    throw new Error("Generated source must use node(...), connect(...), and section(...).");
  }
  if (/section\s*\(\s*["'][^"']+["']\s*,\s*\w+\.\w+\s*\)/.test(source)) {
    throw new Error("Do not section a parent.child handle; build each section group independently.");
  }
  void ALLOWED_ICONS; // icon ids are validated inside the runner
}

function writeRunReport(runRoot, results) {
  const lines = [
    `# Run report — ${basename(runRoot)}`,
    "",
    `Prompt: \`${rel(promptPath)}\` · mode: ${mode} · ${new Date().toISOString()}`,
    "",
    "| model | sample | status | attempts | nodes | edges | sections | valid |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) => {
      const s = r.summary;
      return `| ${r.model} | ${r.sample} | ${r.status} | ${r.attempts ?? "-"} | ${s?.nodes ?? "-"} | ${s?.edges ?? "-"} | ${s?.sections.length ?? "-"} | ${s ? s.validation.ok : "-"} |`;
    }),
    "",
    "PNG + source.ts per run live in the model/sample subfolders. Add judging notes",
    "as markdown in the eval folder, not here.",
    "",
  ];
  writeFileSync(join(runRoot, "run-report.md"), lines.join("\n"));
}

function findPrompt(dir) {
  const md = readdirSync(dir).filter((f) => /^prompt.*\.md$/i.test(f));
  if (!md.length) fail(`no prompt*.md in ${rel(dir)}`);
  return join(dir, md.sort()[0]);
}

function readFrontmatter(path) {
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (kv && kv[2] !== "") fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

function stripFrontmatter(text) {
  return text
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "") // leading YAML frontmatter
    .replace(/<!--[\s\S]*?-->/g, "")             // operator-only HTML comments
    .trim();
}

function parseArgs(argv) {
  const parsed = { models: [] };
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/s);
    if (!m) continue;
    if (m[1] === "model") parsed.models.push(m[2]);
    else parsed[m[1]] = m[2];
  }
  return parsed;
}

function truncate(text, max) { return text.length <= max ? text : `${text.slice(0, max)}\n... [truncated]`; }
function rel(p) { return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p; }
function fail(msg) { console.error(`error: ${msg}`); process.exit(2); }

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (k) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
