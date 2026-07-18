import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { hostname, platform, release } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stableStringify } from "./canonical.js";
import { loadFixtures } from "./fixture.js";
import { evaluateGate } from "./gate.js";
import { measureFixture } from "./measure.js";
import type {
  Arm,
  GateResult,
  MeasuredFixture,
  PlanGraphResult,
  TimedArmResult,
  VisualReviewLedger,
  VisualReviewIdentity,
} from "./model.js";
import { layoutMeasuredFixture, planFixture } from "./plan.js";
import {
  readPngIdentity,
  renderPng,
  rendererIdentity,
  writeComparisonScene,
  writeResultScene,
} from "./render.js";
import {
  parseVisualReviewLedger,
  pendingVisualReview,
  type VisualEvidenceIdentity,
} from "./visual-review.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const EXPERIMENT_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const CURRENT = join(EXPERIMENT_ROOT, "current");
const RUNNER = fileURLToPath(import.meta.url);

const VERIFY_PROTOCOL = {
  warmups: 10,
  iterations: 30,
  freshProcesses: 5,
} as const;

export interface RunOptions {
  mode: "generate" | "verify";
  warmups: number;
  iterations: number;
  freshProcesses: number;
}

export function prepareMeasuredCatalog(
  fixtures: ReturnType<typeof loadFixtures>,
  measure: typeof measureFixture = measureFixture,
): MeasuredFixture[] {
  return fixtures.map((fixture) => measure(fixture));
}

export async function runExperiment(options: RunOptions): Promise<GateResult> {
  const fixtures = loadFixtures();
  const measuredFixtures = prepareMeasuredCatalog(fixtures);
  const timings = measuredFixtures.flatMap((measured) =>
    (["A", "B"] as const).map((arm) =>
      timeMeasuredArm(measured, arm, options.warmups, options.iterations),
    ),
  );
  const results = measuredFixtures.flatMap((measured) =>
    (["A", "B"] as const).map((arm) => planFixture(measured, arm)),
  );
  const fresh = proveFreshProcessHashes(
    fixtures.map((fixture) => fixture.id),
    options.freshProcesses,
    results,
  );
  const sourceSha256 = sourceIdentity();
  const environment = {
    baseline: "91c4087d58970dad48c0abc0b400e85570e0a036",
    sourceSha256,
    node: process.version,
    host: hostname(),
    os: `${platform()} ${release()}`,
    measurementOwner: hashFile(join(ROOT, "src/card.ts")),
    routerOwner: hashFile(join(ROOT, "src/layout.ts")),
    runner: relative(ROOT, RUNNER),
    protocol: {
      warmups: options.warmups,
      iterations: options.iterations,
      freshProcesses: options.freshProcesses,
      p95Index: "ceil(0.95*n)-1",
    },
  };
  writeJson(join(CURRENT, "environment.json"), environment);
  for (const result of results) {
    writeJson(
      join(CURRENT, "results", `${result.fixtureId}-${result.arm}.json`),
      result,
    );
  }
  writeJson(join(CURRENT, "timings.json"), timings);
  writeJson(join(CURRENT, "fresh-process-hashes.json"), fresh);

  const renderer = rendererIdentity();
  const pngs: Record<string, ReturnType<typeof readPngIdentity>> = {};
  const artifacts: Record<string, VisualReviewIdentity> = {};
  for (const measured of measuredFixtures) {
    const { fixture } = measured;
    const armA = findResult(results, fixture.id, "A");
    const armB = findResult(results, fixture.id, "B");
    const sceneSha256: VisualReviewIdentity["sceneSha256"] = {
      A: "",
      B: "",
      plate: "",
    };
    for (const result of [armA, armB]) {
      const scenePath = join(
        CURRENT,
        "scenes",
        `${fixture.id}-${result.arm}.excalidraw`,
      );
      const pngPath = join(CURRENT, "png", `${fixture.id}-${result.arm}.png`);
      writeResultScene(measured, result, scenePath);
      sceneSha256[result.arm] = hashFile(scenePath);
      pngs[`${fixture.id}:${result.arm}`] = renderPng(scenePath, pngPath);
    }
    const plateScene = join(
      CURRENT,
      "scenes",
      `${fixture.id}-comparison.excalidraw`,
    );
    const platePng = join(CURRENT, "plates", `${fixture.id}-comparison.png`);
    writeComparisonScene(measured, armA, armB, plateScene);
    sceneSha256.plate = hashFile(plateScene);
    pngs[`${fixture.id}:plate`] = renderPng(plateScene, platePng);
    artifacts[fixture.id] = {
      canonicalResultSha256: {
        A: armA.canonicalSha256,
        B: armB.canonicalSha256,
      },
      sceneSha256,
      pngSha256: {
        A: pngs[`${fixture.id}:A`].sha256,
        B: pngs[`${fixture.id}:B`].sha256,
        plate: pngs[`${fixture.id}:plate`].sha256,
      },
    };
  }
  const visualIdentity: VisualEvidenceIdentity = {
    sourceSha256,
    renderer,
    artifacts,
  };
  writeJson(join(CURRENT, "png-provenance.json"), {
    sourceSha256,
    renderer,
    pngs,
    artifacts,
  });

  const ledgerPath = join(CURRENT, "visual-review.json");
  const ledger = loadOrResetLedger(ledgerPath, visualIdentity, fixtures);
  writeJson(ledgerPath, ledger);
  const gate = evaluateGate(fixtures, results, timings, ledger, fresh.matches);
  writeJson(join(CURRENT, "decision.json"), gate);
  writeFileSync(
    join(CURRENT, "decision.md"),
    decisionMarkdown(fixtures.map((fixture) => fixture.id), results, timings, gate, ledger),
    "utf8",
  );
  if (options.mode === "verify") {
    verifyEvidence(results, ledger, pngs);
    if (gate.decision === "pending") {
      throw new Error("VISUAL_REVIEW_PENDING");
    }
  }
  return gate;
}

export function timeMeasuredArm(
  measured: MeasuredFixture,
  arm: Arm,
  warmups: number,
  iterations: number,
  layout: typeof layoutMeasuredFixture = layoutMeasuredFixture,
): TimedArmResult {
  for (let index = 0; index < warmups; index += 1) {
    layout(measured, arm);
  }
  const samplesMs: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    layout(measured, arm);
    samplesMs.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }
  samplesMs.sort((left, right) => left - right);
  return {
    fixtureId: measured.fixture.id,
    arm,
    samplesMs,
    p95Ms: samplesMs[Math.ceil(0.95 * samplesMs.length) - 1] ?? 0,
  };
}

function proveFreshProcessHashes(
  fixtureIds: string[],
  count: number,
  expected: PlanGraphResult[],
): { count: number; hashes: Record<string, string[]>; matches: Record<string, boolean> } {
  const hashes: Record<string, string[]> = {};
  const matches: Record<string, boolean> = {};
  for (const fixtureId of fixtureIds) {
    for (const arm of ["A", "B"] as const) {
      const key = `${fixtureId}:${arm}`;
      hashes[key] = [];
      for (let index = 0; index < count; index += 1) {
        const child = spawnSync(
          process.execPath,
          ["--import", "tsx", RUNNER, "--single", fixtureId, arm],
          { cwd: ROOT, encoding: "utf8", timeout: 30_000 },
        );
        if (child.status !== 0) {
          throw new Error(
            `FRESH_PROCESS_FAILED:${key}:${child.stderr || child.stdout}`,
          );
        }
        hashes[key].push(child.stdout.trim());
      }
      const expectedHash = findResult(expected, fixtureId, arm).canonicalSha256;
      matches[key] =
        hashes[key].length === count &&
        hashes[key].every((hash) => hash === expectedHash);
    }
  }
  return { count, hashes, matches };
}

function loadOrResetLedger(
  path: string,
  expected: VisualEvidenceIdentity,
  fixtures: ReturnType<typeof loadFixtures>,
): VisualReviewLedger {
  if (!existsSync(path)) return pendingVisualReview(expected, fixtures);
  return parseVisualReviewLedger(
    readFileSync(path, "utf8"),
    expected,
    fixtures,
  );
}

function verifyEvidence(
  results: PlanGraphResult[],
  ledger: VisualReviewLedger,
  pngs: Record<string, { sha256: string }>,
): void {
  if (results.length !== 10) throw new Error("RESULT_COUNT_MISMATCH");
  if (Object.keys(pngs).length !== 15) throw new Error("PNG_COUNT_MISMATCH");
  if (ledger.status !== "accepted") throw new Error("VISUAL_REVIEW_PENDING");
}

export function decisionMarkdown(
  fixtureIds: string[],
  results: PlanGraphResult[],
  timings: TimedArmResult[],
  gate: GateResult,
  ledger: VisualReviewLedger,
): string {
  const lines = [
    "# T-124 grouped planGraph decision",
    "",
    `Decision: **${gate.decision === "pending" ? "pending direct visual review and independent QA" : gate.decision}**.`,
    "",
    "This is a placement-policy experiment. Arm A deliberately differs from the shipped semantic-redraw renderer by using title-only measured cards and the shared obstacle-aware router. It does not establish pixel equivalence, typography quality, or router superiority.",
    "",
    "| Fixture | A crossings | B crossings | A area | B area | A p95 ms | B p95 ms | B structural |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const fixtureId of fixtureIds) {
    const a = findResult(results, fixtureId, "A");
    const b = findResult(results, fixtureId, "B");
    const at = timings.find((entry) => entry.fixtureId === fixtureId && entry.arm === "A")!;
    const bt = timings.find((entry) => entry.fixtureId === fixtureId && entry.arm === "B")!;
    lines.push(
      `| ${fixtureId} | ${a.score.crossings} | ${b.score.crossings} | ${a.score.normalizedArea.toFixed(3)} | ${b.score.normalizedArea.toFixed(3)} | ${at.p95Ms.toFixed(3)} | ${bt.p95Ms.toFixed(3)} | ${b.structuralIssues.length} |`,
    );
  }
  lines.push("", "## Gate findings", "");
  lines.push(
    ...(gate.failures.length > 0
      ? gate.failures.map((failure) => `- ${failure}`)
      : ["- Every frozen internal-planner gate passed."]),
  );
  if (gate.decision === "pending") {
    lines.push(
      "",
      "## Pending evidence",
      "",
      ...gate.pendingReasons.map((reason) => `- ${reason}`),
    );
  }
  lines.push(
    "",
    "The five fixtures are bounded evidence, not a universal layout-quality claim. Canonical hash equality is per-host; cross-platform checks compare metrics and decisions.",
    "",
  );
  return lines.join("\n");
}

function sourceIdentity(): string {
  const files = walk(EXPERIMENT_ROOT)
    .filter((path) => !path.includes(`${join(EXPERIMENT_ROOT, "current")}/`))
    .filter((path) => !path.endsWith(".png") && !path.endsWith(".excalidraw"))
    .sort();
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(relative(EXPERIMENT_ROOT, path));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function walk(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableStringify(value), "utf8");
}

function findResult(
  results: PlanGraphResult[],
  fixtureId: string,
  arm: Arm,
): PlanGraphResult {
  const result = results.find(
    (candidate) => candidate.fixtureId === fixtureId && candidate.arm === arm,
  );
  if (!result) throw new Error(`MISSING_RESULT:${fixtureId}:${arm}`);
  return result;
}

function parsePositive(args: string[], flag: string, fallback: number): number {
  const indexes = args.flatMap((value, index) => value === flag ? [index] : []);
  if (indexes.length > 1) throw new Error(`${flag} must be specified once`);
  const index = indexes[0] ?? -1;
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
}

export function parseRunOptions(args: string[]): RunOptions {
  const options: RunOptions = {
    mode: args.includes("--verify") ? "verify" : "generate",
    warmups: parsePositive(args, "--warmups", VERIFY_PROTOCOL.warmups),
    iterations: parsePositive(
      args,
      "--iterations",
      VERIFY_PROTOCOL.iterations,
    ),
    freshProcesses: parsePositive(
      args,
      "--fresh-processes",
      VERIFY_PROTOCOL.freshProcesses,
    ),
  };
  if (
    options.mode === "verify" &&
    (options.warmups !== VERIFY_PROTOCOL.warmups ||
      options.iterations !== VERIFY_PROTOCOL.iterations ||
      options.freshProcesses !== VERIFY_PROTOCOL.freshProcesses)
  ) {
    throw new Error("VERIFY_PROTOCOL_MISMATCH:required=10/30/5");
  }
  return options;
}

async function main(args: string[]): Promise<void> {
  if (args[0] === "--single") {
    const fixture = loadFixtures().find((candidate) => candidate.id === args[1]);
    const arm = args[2];
    if (!fixture || (arm !== "A" && arm !== "B")) {
      throw new Error("Usage: --single FIXTURE_ID A|B");
    }
    process.stdout.write(
      planFixture(measureFixture(fixture), arm).canonicalSha256,
    );
    return;
  }
  const gate = await runExperiment(parseRunOptions(args));
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? "") === resolve(RUNNER)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
