// Render one weak-model graph or visual source into a validated diagram + PNG.
//
// This is the geometry/render step of a single eval run: `pi` produces the
// restricted-TS graph source, then this turns it into <out>/diagram.excalidraw,
// <out>/diagram.png and <out>/summary.json using the shared runner template.
//
// Usage:
//   node scripts/weak-llm-improve/render-graph.mjs \
//     --source=evals/run/2026-06-30-eval1/source.ts \
//     --out=evals/run/2026-06-30-eval1 \
//     --prompt=evals/eval1/prompt1.md          # reads title/thesis/slug from frontmatter
//   # or pass meta directly:
//     --title="..." --thesis="..." --slug=eval1
//
// The diagram title/thesis are header text only; slug is recorded in summary.json.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { buildRunner } from "./runner-template.mjs";
import { validateSourceShape } from "./source-contract.mjs";
import { buildVisualRunner } from "./visual-runner-template.mjs";
import { validateVisualSourceShape } from "./visual-source-contract.mjs";

const ROOT = process.cwd();
const RENDERER = join(ROOT, "dist", "bin", "excalidraw-render.js");

const args = parseArgs(process.argv.slice(2));
if (!args.source || !args.out) {
  console.error("Required: --source=<graph.ts> --out=<dir>. Optional: --prompt=<promptN.md> or --title/--thesis/--slug.");
  process.exit(2);
}

const meta = resolveMeta(args);
const contract = meta.contract ?? "graph";
if (!["graph", "visual"].includes(contract)) {
  console.error("Unknown contract: " + contract + ". Expected graph or visual.");
  process.exit(2);
}
const outDir = resolve(args.out);
mkdirSync(outDir, { recursive: true });

const source = readFileSync(resolve(args.source), "utf8");
try {
  if (contract === "visual") validateVisualSourceShape(source, { scenarioSlug: meta.slug });
  else validateSourceShape(source, { scenarioSlug: meta.slug });
} catch (error) {
  console.error("SOURCE CONTRACT FAILED (" + contract + "):\n");
  console.error(error.message);
  process.exit(1);
}
const excalidrawPath = join(outDir, "diagram.excalidraw");
const summaryPath = join(outDir, "summary.json");
const pngPath = join(outDir, "diagram.png");
const runnerPath = join(outDir, "runner.mjs");

const build = contract === "visual" ? buildVisualRunner : buildRunner;
writeFileSync(runnerPath, build(source, meta, { excalidrawPath, summaryPath }));

const run = spawnSync("node", [runnerPath], { cwd: ROOT, encoding: "utf8", timeout: 90_000, maxBuffer: 10 * 1024 * 1024 });
if (run.error || (run.status ?? 1) !== 0) {
  console.error("RUNNER FAILED (geometry/validation):\n");
  console.error(run.stderr || run.error?.message || `status ${run.status}`);
  process.exit(1);
}

const render = spawnSync("node", [RENDERER, "--setup", excalidrawPath, pngPath], { cwd: ROOT, encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
if (render.error || (render.status ?? 1) !== 0 || !existsSync(pngPath)) {
  console.error("RENDER FAILED:\n");
  console.error(render.stderr || render.error?.message || `status ${render.status}`);
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
console.log("OK  ->", pngPath);
if (contract === "visual") {
  console.log("    objects=" + summary.objects + " links=" + summary.links + " elements=" + summary.elements + " validation.ok=" + summary.validation.ok);
} else {
  console.log("    nodes=" + summary.nodes + " edges=" + summary.edges + " sections=" + summary.sections.length + " validation.ok=" + summary.validation.ok);
}
if (!summary.validation.ok) {
  console.log("    validation errors:", JSON.stringify(summary.validation.errors));
}
if (summary.sections) {
  console.log("    sections:", summary.sections.map((s) => s.title + "(" + Math.round(s.bounds.width) + "x" + Math.round(s.bounds.height) + ")").join(", "));
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/s);
    if (m) parsed[m[1]] = m[2];
  }
  return parsed;
}

function resolveMeta(args) {
  let fm = {};
  if (args.prompt) fm = readFrontmatter(resolve(args.prompt));
  const title = args.title ?? fm.diagram_title ?? fm.title ?? "weak-model diagram";
  const thesis = args.thesis ?? fm.thesis ?? "";
  const slug = args.slug ?? fm.slug ?? fm.eval ?? "eval";
  const contract = args.contract ?? fm.contract ?? "graph";
  return { title, thesis, slug, contract };
}

// Minimal frontmatter reader: leading --- ... --- block, `key: value` lines.
function readFrontmatter(path) {
  const text = readFileSync(path, "utf8");
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (kv && kv[2] !== "") fm[kv[1]] = kv[2].trim();
  }
  return fm;
}
