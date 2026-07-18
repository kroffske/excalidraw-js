import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GENERATED_CATALOG_PATHS,
  generateAssetCatalog,
} from "../scripts/generate-asset-catalog.js";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "asset-catalog-"));
  temporaryRoots.push(root);
  return root;
}

function generatedBytes(root: string): Map<string, Buffer> {
  return new Map(
    GENERATED_CATALOG_PATHS.map((path) => [path, readFileSync(join(root, path))]),
  );
}

function sourceFixtureRoot(): string {
  const root = temporaryRoot();
  cpSync(join(REPO_ROOT, "assets"), join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "catalog-review/assets/v1"), { recursive: true });
  cpSync(
    join(REPO_ROOT, "catalog-review/assets/v1/descriptor-evidence.json"),
    join(root, "catalog-review/assets/v1/descriptor-evidence.json"),
  );
  cpSync(
    join(REPO_ROOT, "catalog-review/assets/v1/baseline"),
    join(root, "catalog-review/assets/v1/baseline"),
    { recursive: true },
  );
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("asset catalog generation", () => {
  it("reproduces every generated catalog surface byte for byte", () => {
    const outputRoot = temporaryRoot();

    const result = generateAssetCatalog({ sourceRoot: REPO_ROOT, outputRoot });

    expect(result.assetCount).toBe(128);
    expect(result.outputPaths).toEqual(GENERATED_CATALOG_PATHS);
    for (const path of GENERATED_CATALOG_PATHS) {
      expect(readFileSync(join(outputRoot, path))).toEqual(readFileSync(join(REPO_ROOT, path)));
    }
  });

  it("is byte-identical across repeated generation", () => {
    const outputRoot = temporaryRoot();
    generateAssetCatalog({ sourceRoot: REPO_ROOT, outputRoot });
    const first = generatedBytes(outputRoot);

    generateAssetCatalog({ sourceRoot: REPO_ROOT, outputRoot });

    for (const [path, bytes] of first) {
      expect(readFileSync(join(outputRoot, path))).toEqual(bytes);
    }
  });

  it("validates committed outputs without rewriting them", () => {
    expect(() => generateAssetCatalog({ sourceRoot: REPO_ROOT, check: true })).not.toThrow();
  });

  it("rejects an SVG whose bytes no longer match its provenance hash", () => {
    const sourceRoot = sourceFixtureRoot();
    appendFileSync(
      join(sourceRoot, "assets/core/svg/agents_robot_agent_01-01.svg"),
      "\n",
    );

    expect(() => generateAssetCatalog({ sourceRoot })).toThrow(/svg_sha256 mismatch/u);
  });

  it("rejects evidence that does not match the canonical bilingual label", () => {
    const sourceRoot = sourceFixtureRoot();
    const evidencePath = join(
      sourceRoot,
      "catalog-review/assets/v1/descriptor-evidence.json",
    );
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      records: Array<{ label: string }>;
    };
    evidence.records[0].label = "Different label";
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

    expect(() => generateAssetCatalog({ sourceRoot })).toThrow(
      /does not match catalog order and label/u,
    );
  });

  it("treats the v1 compatibility snapshots as immutable input", () => {
    const sourceRoot = sourceFixtureRoot();
    const manifestPath = join(sourceRoot, "assets/core/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      assets: Array<{ viewBox: string }>;
    };
    manifest.assets[0].viewBox = "0 0 64 64";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    expect(() => generateAssetCatalog({ sourceRoot })).toThrow(
      /immutable legacy baseline drift/u,
    );
  });
});
