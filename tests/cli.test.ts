import { existsSync, mkdtempSync, readFileSync } from "node:fs";
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

  it("defaults user setup to generic shared skills", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-user-"));
    const target = resolveSetupTarget({ home: join(root, "home") });
    expect(target.agent).toBe("generic");
    expect(target.path).toBe(join(root, "home", ".agents", "skills", "excalidraw-diagrams"));
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

  it("runs bundled example command", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-example-"));
    expect(main(["example", "excalidraw-js-architecture", "--out-dir", join(root, "out")])).toBe(0);

    const data = JSON.parse(readFileSync(join(root, "out", "excalidraw-js-architecture.excalidraw"), "utf8"));
    expect(data.type).toBe("excalidraw");
    expect(data.elements.length).toBeGreaterThan(0);
    expect(Object.keys(data.files).length).toBeGreaterThan(0);
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
    for (const script of ["basic_scene.ts", "excalidraw_diagrams_workflow.ts", "excalidraw_js_architecture.ts"]) {
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
  });
});
