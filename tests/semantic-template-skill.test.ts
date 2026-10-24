import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { installSkill, resolveSetupTarget } from "../src/cli.js";
import { buildDiagramSpec, validateDiagramSpec } from "../src/index.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SKILL_PATH = join(REPO_ROOT, "skills", "excalidraw-diagrams", "SKILL.md");
const REFERENCE_PATH = join(
  REPO_ROOT,
  "skills",
  "excalidraw-diagrams",
  "references",
  "semantic-templates.md",
);

function readReference(): string {
  return readFileSync(REFERENCE_PATH, "utf8");
}

function extractSpecExamples(markdown: string): unknown[] {
  // The documented JS object literals deliberately use JSON-compatible values.
  return [...markdown.matchAll(/```js\nconst spec = ([\s\S]*?);\n```/gu)]
    .map((match) => JSON.parse(match[1]));
}

describe("strict semantic-template skill guidance", () => {
  it("ships one valid minimal JS object example for every strict template", () => {
    const examples = extractSpecExamples(readReference());

    expect(examples).toHaveLength(4);
    expect(examples.map((example) => (
      example as { template: string }
    ).template)).toEqual([
      "c4.container",
      "sequence.interaction",
      "flow.swimlane",
      "flow.band",
    ]);

    for (const example of examples) {
      expect(validateDiagramSpec(example)).toMatchObject({
        ok: true,
        diagnostics: [],
      });
      const build = buildDiagramSpec(example, { seed: 42 });
      expect(build.ok).toBe(true);
      if (build.ok) {
        expect(build.geometry.ok).toBe(true);
      }
    }
  });

  it("states strict-versus-custom precedence and truthful semantic limits", () => {
    const skill = readFileSync(SKILL_PATH, "utf8");
    const reference = readReference();

    expect(skill).toContain("references/semantic-templates.md");
    expect(skill).toMatch(/strict `c4\.container`[\s\S]*semantic redraw/);
    expect(skill).toMatch(/strict `sequence\.interaction`[\s\S]*concurrency/);
    // A10: the banded ribbon has a template now, so the router sends cycles and phase
    // bands to `flow.band` instead of down to hand-placed coordinates.
    expect(skill).toMatch(/strict `flow\.swimlane`[\s\S]*strict `flow\.band`/);
    expect(skill).toMatch(/strict `flow\.band`[\s\S]*by id, never by position/);
    expect(skill).toMatch(/writing `\(x, y\)` for more than three nodes/);
    expect(skill).toContain("Banded process ribbon");

    expect(reference).toMatch(/Existing source conversion goes to semantic\s+redraw/);
    expect(reference).toContain("min(8, n * (n - 1) / 2)");
    expect(reference).toMatch(/never claim native concurrency, `alt`, or\s+`loop` semantics/);
    expect(reference).toMatch(/cycles\/retries, explicit phase bands[\s\S]*`flow\.band`/);
    expect(reference).toMatch(/A back edge is legal only when it is\s+marked `feedback`/);
    expect(reference).toMatch(/Warnings never fail the build/);
    expect(reference).toMatch(/three agent-workflow cases/);
    expect(reference).toMatch(/does not establish a general weak-model benchmark/);
    expect(reference).toMatch(/Only `flow\.swimlane` and `flow\.band` emit native bound\s+connectors/);
    expect(reference).toMatch(/C4 and sequence arrows are editable but intentionally unbound/);
  });

  it("forbids caller geometry, raw styling, unknown fields, and silent repair", () => {
    const reference = readReference();
    const examples = extractSpecExamples(reference) as Array<Record<string, unknown>>;

    expect(reference).toMatch(/Never supply geometry such as `x`, `y`, `width`, `height`, `points`, or\s+`ports`/);
    expect(reference).toMatch(/Never supply raw styling[\s\S]*hex values such as `#1e3a8a`/);
    expect(reference).toMatch(/Unknown\s+root or nested fields fail validation/);
    expect(reference).toMatch(/Never silently invent or\s+delete entities/);
    expect(reference).toMatch(/Retry at most twice/);
    expect(reference).toMatch(/Label outcomes, gates, and material handoffs/);

    for (const [index, forbiddenField] of [
      "x",
      "strokeColor",
      "invented",
    ].entries()) {
      const invalid = structuredClone(examples[index]);
      invalid[forbiddenField] = index === 1 ? "#1e3a8a" : 10;
      const validation = validateDiagramSpec(invalid);
      expect(validation.ok).toBe(false);
      expect(validation.diagnostics).toContainEqual(expect.objectContaining({
        code: "UNKNOWN_FIELD",
        path: `$.${forbiddenField}`,
      }));
    }
  });

  it("copies the self-contained reference through skill install and npm packing", () => {
    const installRoot = mkdtempSync(join(tmpdir(), "semantic-template-skill-"));
    const target = resolveSetupTarget({
      project: true,
      cwd: installRoot,
      home: join(installRoot, "home"),
    });
    const destination = installSkill(target);
    const installedReference = join(
      destination,
      "references",
      "semantic-templates.md",
    );
    expect(readFileSync(installedReference, "utf8")).toBe(readReference());

    const packed = spawnSync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      // The file list is over a megabyte; the default 1MB buffer kills npm with ENOBUFS.
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    expect(packed.status, packed.stderr).toBe(0);
    const report = JSON.parse(packed.stdout) as Array<{
      files: Array<{ path: string }>;
    }>;
    const paths = report[0].files.map((file) => file.path);
    expect(paths).toContain(
      "skills/excalidraw-diagrams/references/semantic-templates.md",
    );
    expect(paths).not.toContain("examples/agent-workflows/README.md");
  });
});
