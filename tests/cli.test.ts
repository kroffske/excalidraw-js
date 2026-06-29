import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { assetsMain, exportBundledAssets } from "../src/assets.js";
import { installSkill, main, resolveSetupTarget } from "../src/cli.js";
import { prepareRendererFiles, rendererReady } from "../src/render.js";

describe("assets CLI", () => {
  it("lists, shows, and exports bundled assets", () => {
    expect(assetsMain(["groups"])).toBe(0);
    expect(assetsMain(["show", "robot_agent"])).toBe(0);
    expect(assetsMain(["--pack", "trading", "groups"])).toBe(0);

    const root = mkdtempSync(join(tmpdir(), "excalidraw-export-"));
    const target = exportBundledAssets(join(root, "asset-catalog"));
    expect(existsSync(join(target, "manifest.json"))).toBe(true);
    expect(existsSync(join(target, "svg"))).toBe(true);
  });
});

describe("setup CLI", () => {
  it("resolves and installs project skill targets", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-setup-"));
    const target = resolveSetupTarget({ project: true, cwd: root, home: join(root, "home") });
    expect(target.agent).toBe("project");
    expect(target.path).toBe(join(root, "skills", "excalidraw-diagrams"));

    const destination = installSkill(target);
    expect(existsSync(join(destination, "SKILL.md"))).toBe(true);
    expect(existsSync(join(destination, "references", "api.md"))).toBe(true);
    expect(() => installSkill(target)).toThrow(/--force/);
    installSkill(target, { force: true });
  });

  it("defaults user setup to agents shared skills", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-user-"));
    const target = resolveSetupTarget({ home: join(root, "home") });
    expect(target.agent).toBe("agents");
    expect(target.path).toBe(join(root, "home", ".agents", "skills", "excalidraw-diagrams"));

    const legacyTarget = resolveSetupTarget({ agent: "generic", home: join(root, "home") });
    expect(legacyTarget.agent).toBe("agents");
    expect(legacyTarget.path).toBe(target.path);
  });

  it("runs umbrella setup command", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-main-"));
    const previous = process.cwd();
    process.chdir(root);
    try {
      expect(main(["setup", "--project"])).toBe(0);
      expect(main(["setup", "--project"])).toBe(1);
    } finally {
      process.chdir(previous);
    }
  });

  it("runs install command without global or renderer side effects", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-install-"));
    const previous = process.cwd();
    process.chdir(root);
    try {
      expect(main(["install", "--project", "--skip-global", "--skip-renderer"])).toBe(0);
      expect(existsSync(join(root, "skills", "excalidraw-diagrams", "SKILL.md"))).toBe(true);
      expect(main(["install", "--project", "--skip-global", "--skip-renderer"])).toBe(1);
      expect(main(["install", "--project", "--skip-global", "--skip-renderer", "--force"])).toBe(0);
    } finally {
      process.chdir(previous);
    }
  });

  it("prints an install dry-run plan", () => {
    expect(main(["install", "--agent", "agents", "--skip-global", "--skip-renderer", "--dry-run"])).toBe(0);
  });

  it("runs bundled example command", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-example-"));
    expect(main(["example", "excalidraw-js-architecture", "--out-dir", join(root, "out")])).toBe(0);

    const data = JSON.parse(readFileSync(join(root, "out", "excalidraw-js-architecture.excalidraw"), "utf8"));
    expect(data.type).toBe("excalidraw");
    expect(data.elements.length).toBeGreaterThan(0);
    expect(Object.keys(data.files).length).toBeGreaterThan(0);

    const semanticOut = join(root, "semantic");
    expect(main(["example", "architecture-semantic-redraw", "--out-dir", semanticOut])).toBe(0);

    const semantic = JSON.parse(readFileSync(join(semanticOut, "architecture-semantic-redraw.excalidraw"), "utf8"));
    expect(semantic.type).toBe("excalidraw");
    expect(semantic.elements.length).toBeGreaterThan(0);
    expect(Object.keys(semantic.files).length).toBeGreaterThan(0);
    // The canonical semantic redraw must draw the real Locus skill chain, not an
    // abstract conversion pipeline: concrete skill cards, phase sections, and a
    // durable-surfaces band.
    const semanticJson = JSON.stringify(semantic.elements);
    expect(semanticJson).toContain("Locus skill chain semantic redraw");
    expect(semanticJson).toContain("$locus-dev");
    expect(semanticJson).toContain("$c4-diagrams");
    expect(semanticJson).toContain("Durable state and runtime surfaces");
  });

  it("renders a data-only tree spec", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-tree-spec-"));
    const outPath = join(root, "plan-todo-session-tree.excalidraw");
    expect(main(["tree-spec", "examples/plan_todo_tree_spec.json", "--out", outPath])).toBe(0);

    const data = JSON.parse(readFileSync(outPath, "utf8"));
    expect(data.type).toBe("excalidraw");
    expect(data.elements.length).toBeGreaterThan(0);
    expect(Object.keys(data.files).length).toBeGreaterThan(0);
    expect(JSON.stringify(data.elements)).toContain("Session sharedState");
    expect(JSON.stringify(data.elements)).toContain("session_start hook");
  });

  it("renders a data-only semantic redraw spec", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-semantic-redraw-cli-"));
    const specPath = join(root, "semantic-redraw.json");
    const outPath = join(root, "semantic-redraw.excalidraw");
    writeFileSync(specPath, JSON.stringify({
      title: "Weak model semantic redraw",
      subtitle: "JSON spec rendered by CLI.",
      layout: { type: "sections", density: "compact" },
      sections: [
        {
          id: "source",
          title: "1. Source",
          order: 1,
          cards: [
            { id: "repo", title: "Repository", iconId: "server_stack", bullets: ["source folders"] },
            { id: "scripts", title: "scripts", iconId: "tool_call", bullets: ["automation commands"] },
          ],
        },
        {
          id: "runtime",
          title: "2. Runtime",
          order: 2,
          cards: [
            { id: "package", title: "package API", iconId: "data_catalog", bullets: ["shared helpers"] },
          ],
        },
      ],
      edges: [
        { from: "repo", to: "scripts", direction: "top-down", kind: "support", label: "contains" },
        { from: "repo", to: "package", direction: "left-to-right", kind: "primary", label: "publishes" },
      ],
    }), "utf8");

    expect(main(["semantic-redraw-spec", specPath, "--out", outPath])).toBe(0);
    const data = JSON.parse(readFileSync(outPath, "utf8"));
    expect(data.type).toBe("excalidraw");
    expect(data.elements.length).toBeGreaterThan(0);
    expect(Object.keys(data.files).length).toBeGreaterThan(0);
    expect(JSON.stringify(data.elements)).toContain("Weak model semantic redraw");
    expect(JSON.stringify(data.elements)).toContain("automation commands");
  });
});

describe("renderer and examples", () => {
  it("copies renderer files without marking it ready before npm install", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-renderer-"));
    const rendererDir = prepareRendererFiles(join(root, "renderer"));
    expect(existsSync(join(rendererDir, "package.json"))).toBe(true);
    expect(existsSync(join(rendererDir, "render-excalidraw.mjs"))).toBe(true);
    expect(rendererReady(rendererDir)).toBe(false);
  });

  it("runs example scripts and writes valid Excalidraw JSON", () => {
    for (const script of [
      "basic_scene.ts",
      "excalidraw_diagrams_workflow.ts",
      "excalidraw_js_architecture.ts",
      "architecture_semantic_redraw.ts",
      "reaper_graphspec.ts",
      "reaper_integration.ts",
    ]) {
      const result = spawnSync(join(process.cwd(), "node_modules", ".bin", "tsx"), [join("examples", script)], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status, `${script}\n${result.stderr}`).toBe(0);
    }

    const data = JSON.parse(readFileSync(join("examples", "out", "basic_scene.excalidraw"), "utf8"));
    expect(data.type).toBe("excalidraw");
    expect(data.elements.length).toBeGreaterThan(0);
    expect(Object.keys(data.files).length).toBeGreaterThan(0);

    const baseline = JSON.parse(readFileSync(join("examples", "out", "baseline", "excalidraw-js-architecture.excalidraw"), "utf8"));
    expect(baseline.type).toBe("excalidraw");
    expect(baseline.elements.length).toBeGreaterThan(0);
    expect(Object.keys(baseline.files).length).toBeGreaterThan(0);

    const semantic = JSON.parse(readFileSync(join("examples", "out", "architecture-semantic-redraw", "architecture-semantic-redraw.excalidraw"), "utf8"));
    expect(semantic.type).toBe("excalidraw");
    expect(semantic.elements.length).toBeGreaterThan(0);
    expect(Object.keys(semantic.files).length).toBeGreaterThan(0);

    const graphspec = JSON.parse(readFileSync(join("examples", "out", "reaper_graphspec.excalidraw"), "utf8"));
    expect(graphspec.type).toBe("excalidraw");
    expect(graphspec.elements.length).toBeGreaterThan(0);
    expect(JSON.stringify(graphspec.elements)).toContain("Reaper integration - one supervised-loop tick");
  });
});
