import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import {
  extractSource,
  validateSourceShape,
} from "../scripts/weak-llm-improve/source-contract.mjs";
import {
  partitionRowEntries,
  wrapHeaderText,
} from "../scripts/weak-llm-improve/runner-template.mjs";
import {
  validateVisualSourceShape,
  VISUAL_HELPERS,
} from "../scripts/weak-llm-improve/visual-source-contract.mjs";
import { buildVisualRunner } from "../scripts/weak-llm-improve/visual-runner-template.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function runVisualSource(source: string, options: { quotedPaths?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "excalidraw-visual-runner-"));
  const suffix = options.quotedPaths ? `-\"quoted\"` : "";
  const excalidrawPath = join(directory, `diagram${suffix}.excalidraw`);
  const summaryPath = join(directory, `summary${suffix}.json`);
  const runnerPath = join(directory, "runner.mts");
  const runner = buildVisualRunner(
    source,
    { title: "Runtime contract test", thesis: "Runner validates actual geometry", slug: "runtime-contract-test" },
    {
      excalidrawPath,
      summaryPath,
      indexImport: pathToFileURL(resolve(REPO_ROOT, "src/index.ts")).href,
    },
  );
  writeFileSync(runnerPath, runner);
  const result = spawnSync(resolve(REPO_ROOT, "node_modules/.bin/tsx"), [runnerPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const output = {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    wroteExcalidraw: existsSync(excalidrawPath),
    summary: existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, "utf8")) : null,
  };
  rmSync(directory, { recursive: true, force: true });
  return output;
}

const validSource = `
const band = layout.row({
  docs: node("docs", "Package Exports", "news_document", ["public export surface", "x: documented field"]),
  api: node("api", "API", "api_connector", ["children: described in prose"]),
});
section("User surface", band);
connect("docs_to_api", "docs", "api", "exports");
`;

describe("weak-LLM source contract", () => {
  it("extracts the fenced graph source", () => {
    expect(extractSource(`before\n\`\`\`ts\n${validSource}\n\`\`\`\nafter`)).toContain("docs_to_api");
  });

  it("allows contract-like words inside strings and comments", () => {
    expect(() => validateSourceShape(`${validSource}\n// export children: x: y:`)).not.toThrow();
  });

  it("rejects actual module syntax, raw scene calls, coordinates, and numeric indexes", () => {
    expect(() => validateSourceShape(`${validSource}\nexport const leak = 1;`)).toThrow(/restricted graph contract/);
    expect(() => validateSourceShape(`${validSource}\nscene.rect(0, 0, 10, 10);`)).toThrow(/restricted graph contract/);
    expect(() => validateSourceShape(`${validSource}\nlayout.row({ docs }, { x: 10 });`)).toThrow(/restricted graph contract/);
    expect(() => validateSourceShape(`${validSource}\nconst first = band[0];`)).toThrow(/restricted graph contract/);
  });

  it("rejects runtime escape hatches and unknown graph calls", () => {
    expect(() => validateSourceShape(`${validSource}\ncard("x");`)).toThrow(/restricted graph contract/);
    expect(() => validateSourceShape(`${validSource}\nprocess.exit(0);`)).toThrow(/restricted graph contract/);
    expect(() => validateSourceShape(`${validSource}\nconst x = \`value \${process.exit()}\`;`)).toThrow(/restricted graph contract/);
    expect(() => validateSourceShape(`${validSource}\n({})["constructor"]("return 1")();`)).toThrow(/restricted graph contract/);
    expect(() => validateSourceShape(`${validSource}\n(0, (0, []["filter"]["constructor"])("return process")()["cwd"])();`)).toThrow(/restricted graph contract/);
  });

  it("does not count helper names that only appear in prose", () => {
    expect(() => validateSourceShape(`const note = "node( section( connect(";`)).toThrow(/must call node/);
  });

  it("wraps long diagram theses without dropping words", () => {
    const thesis = "Raw data is split before fitting and the selected model is evaluated once before promotion to serving";
    const wrapped = wrapHeaderText(thesis, 42);
    expect(wrapped).toContain("\n");
    expect(wrapped.replace(/\n/g, " ")).toBe(thesis);
    expect(Math.max(...wrapped.split("\n").map((line) => line.length))).toBeLessThanOrEqual(42);
  });

  it("partitions wide rows without exceeding the runner limit", () => {
    const entries = Array.from({ length: 9 }, (_, index) => [`node-${index + 1}`, index]);
    const rows = partitionRowEntries(entries, 4);

    expect(rows.map((row) => row.length)).toEqual([3, 3, 3]);
    expect(rows.flat()).toEqual(entries);
  });
});

describe("weak-LLM visual source contract", () => {
  it("accepts only high-level helper calls with literal data", () => {
    const source = `
      arrayStrip("nums", [2, 7, 11, 15], {
        x: 100, y: 200,
        highlights: { 0: "accent", 1: "success" },
        pointers: [{ index: 0, label: "i" }],
      });
      card("answer", "Answer", ["[0, 1]"], { x: 900, y: 200, tone: "success" });
      link("found", "nums", "answer", "return");
    `;
    expect(() => validateVisualSourceShape(source)).not.toThrow();
  });

  it("rejects raw scene access, declarations, callbacks, methods, and unknown helpers", () => {
    expect(() => validateVisualSourceShape(`scene.rect(1, 2, 3, 4);`)).toThrow(/restricted visual contract/);
    expect(() => validateVisualSourceShape(`const x = 1; card("a", "A", [], {});`)).toThrow(/restricted visual contract/);
    expect(() => validateVisualSourceShape(`card("a", "A", [1].map(String), {});`)).toThrow(/restricted visual contract/);
    expect(() => validateVisualSourceShape(`customWidget("a", {});`)).toThrow(/restricted visual contract/);
    expect(() => validateVisualSourceShape(`card("a", \`value \${process.exit()}\`, [], {});`)).toThrow(/restricted visual contract/);
    expect(() => validateVisualSourceShape(`({})["constructor"]("return 1")();`)).toThrow(/restricted visual contract/);
    expect(() => validateVisualSourceShape(`card("safe", "Safe", [], {});\n(0, (0, []["filter"]["constructor"])("return process")()["cwd"])();`)).toThrow(/restricted visual contract/);
  });

  it("keeps the helper vocabulary intentionally small", () => {
    expect(VISUAL_HELPERS).toEqual([
      "arrayStrip",
      "candle",
      "candlestickChart",
      "card",
      "classScores",
      "link",
      "stepStrip",
      "uiWindow",
    ]);
  });

  it("preserves the whitespace regex and emits overlap/text-fit gates in the generated runner", () => {
    const runner = buildVisualRunner(
      `card("summary", "Result", ["characters stay unique"], { x: 50, y: 150, w: 500 });`,
      { title: "Test", thesis: "Test thesis", slug: "test" },
      { excalidrawPath: "/tmp/test.excalidraw", summaryPath: "/tmp/test-summary.json" },
    );

    expect(runner).toContain("split(/\\s+/)");
    expect(runner).not.toContain("split(/s+/)");
    expect(runner).toContain("needs h >=");
    expect(runner).toContain("Top-level visual objects must not overlap");
  });

  it.each([
    ["array strip", `arrayStrip("nums", [2, 7, 11, 15], { x: 100, y: 200, pointers: [{ index: 1, label: "j" }] });`],
    ["candle", `candle("wax", "Household candle", { x: 100, y: 160, w: 360, h: 620 });`],
    ["candlestick chart", `candlestickChart("ohlc", "Market candles", [{ label: "M", open: 10, high: 14, low: 8, close: 13 }, { label: "T", open: 13, high: 15, low: 9, close: 10 }, { label: "W", open: 10, high: 16, low: 9, close: 15 }], { x: 100, y: 160, w: 1000, h: 650 });`],
    ["card", `card("note", "Summary", ["Bounded body copy"], { x: 100, y: 160, w: 420 });`],
    ["class scores", `classScores("prediction", "customer message", [{ label: "billing", value: 0.72 }, { label: "support", value: 0.2 }, { label: "sales", value: 0.08 }], { x: 100, y: 160, w: 1400, h: 570 });`],
    ["step strip", `stepStrip("steps", [{ title: "Collect" }, { title: "Review" }, { title: "Ship" }], { x: 100, y: 200, w: 1400, h: 190 });`],
    ["UI window", `uiWindow("console", "Support console", { x: 70, y: 145, w: 1460, h: 790, items: [{ title: "Refund request", meta: "high priority" }], detail: ["Customer asks for a refund"] });`],
    ["link", `card("left", "Input", [], { x: 100, y: 200, w: 300, h: 140 });\ncard("right", "Output", [], { x: 800, y: 200, w: 300, h: 140 });\nlink("flow", "left", "right", "transform");`],
  ])("executes the %s helper inside the real runner", (_name, source) => {
    const result = runVisualSource(source);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.wroteExcalidraw).toBe(true);
    expect(result.summary?.validation.ok).toBe(true);
  });

  it("executes quoted output paths without changing generated syntax", () => {
    const result = runVisualSource(`card("note", "Quoted path", [], { x: 100, y: 160, w: 420 });`, { quotedPaths: true });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.wroteExcalidraw).toBe(true);
  });

  it.each([
    ["short card", `card("note", "Long title that wraps across several lines", ["One", "Two", "Three"], { x: 100, y: 160, w: 220, h: 80 });`, /needs h >=/],
    ["oversized text", `arrayStrip("nums", ["THIS_VALUE_CANNOT_FIT", "2"], { x: 100, y: 200, cell: 50 });`, /Text exceeds width/],
    ["overlapping objects", `card("left", "Left", [], { x: 100, y: 200, w: 320, h: 140 });\ncard("right", "Right", [], { x: 300, y: 250, w: 320, h: 140 });`, /Top-level visual objects must not overlap/],
    ["canvas escape", `card("outside", "Outside", [], { x: 1500, y: 200, w: 200, h: 140 });`, /outside the 1600x1000 content canvas/],
    ["link crossing", `card("left", "Left", [], { x: 100, y: 200, w: 250, h: 140 });\ncard("blocker", "Blocker", [], { x: 560, y: 220, w: 150, h: 150 });\ncard("right", "Right", [], { x: 1000, y: 500, w: 250, h: 140 });\nlink("blocked", "left", "right", "route");`, /Visual links must not cross unrelated objects/],
    ["invalid OHLC", `candlestickChart("ohlc", "Broken", [{ open: 10, high: 9, low: 8, close: 11 }, { open: 10, high: 12, low: 9, close: 11 }, { open: 11, high: 13, low: 10, close: 12 }], { x: 100, y: 160, w: 1000, h: 650 });`, /low <= open\/close <= high/],
  ])("rejects %s during runner execution", (_name, source, error) => {
    const result = runVisualSource(source);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(error);
    expect(result.wroteExcalidraw).toBe(false);
  });
});
