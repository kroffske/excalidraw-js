import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GALLERY_ROOT = join(ROOT, "examples", "agent-workflows");
const GENERATOR_PATH = join(
  ROOT,
  "scripts",
  "generate-agent-workflow-views.mjs",
);
const LABEL_VISUAL_REVIEW_SOURCE = join(
  ROOT,
  "tests",
  "fixtures",
  "semantic-workflow-views",
  "v1",
  "label-density-visual-review.json",
);
const CASES = ["review", "review-plan", "review-fix"] as const;
const VIEWS = ["c4", "sequence", "swimlane"] as const;
const TEMP_ROOT = mkdtempSync(
  join(tmpdir(), "excalidraw-agent-workflow-gallery-"),
);
const FIRST_RUN = join(TEMP_ROOT, "first");
const SECOND_RUN = join(TEMP_ROOT, "second");

beforeAll(async () => {
  const moduleUrl = `${pathToFileURL(GENERATOR_PATH).href}?test`;
  const generator = await import(moduleUrl) as {
    generateAgentWorkflowViews(options: {
      outputRoot: string;
      buildPackage: boolean;
      renderPngs: boolean;
    }): Promise<unknown>;
  };
  await generator.generateAgentWorkflowViews({
    outputRoot: FIRST_RUN,
    buildPackage: false,
    renderPngs: false,
  });
  await generator.generateAgentWorkflowViews({
    outputRoot: SECOND_RUN,
    buildPackage: false,
    renderPngs: false,
  });
});

afterAll(() => {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
});

describe("agent-workflow gallery generator", () => {
  it("repeats and commits normalized scenes, manifest data, and reports byte-for-byte", () => {
    const firstFiles = listFiles(FIRST_RUN);
    const secondFiles = listFiles(SECOND_RUN);

    expect(firstFiles.map((path) => relative(FIRST_RUN, path))).toEqual(
      secondFiles.map((path) => relative(SECOND_RUN, path)),
    );
    for (const firstPath of firstFiles) {
      const path = relative(FIRST_RUN, firstPath);
      expect(readFileSync(firstPath)).toEqual(
        readFileSync(join(SECOND_RUN, path)),
      );
      expect(readFileSync(firstPath)).toEqual(
        readFileSync(join(GALLERY_ROOT, path)),
      );
    }
  });

  it("refuses destructive or unowned output roots", async () => {
    const moduleUrl = `${pathToFileURL(GENERATOR_PATH).href}?safety`;
    const generator = await import(moduleUrl) as {
      generateAgentWorkflowViews(options: {
        outputRoot: string;
        buildPackage: boolean;
        renderPngs: boolean;
      }): Promise<unknown>;
    };
    const unowned = join(TEMP_ROOT, "unowned");
    mkdirSync(unowned, { recursive: true });
    const sentinel = join(unowned, "keep.txt");
    writeFileSync(sentinel, "keep", "utf8");

    await expect(
      generator.generateAgentWorkflowViews({
        outputRoot: ROOT,
        buildPackage: false,
        renderPngs: false,
      }),
    ).rejects.toThrow("Refusing to replace unsafe output root");
    await expect(
      generator.generateAgentWorkflowViews({
        outputRoot: unowned,
        buildPackage: false,
        renderPngs: false,
      }),
    ).rejects.toThrow("Refusing to replace non-empty unowned output root");
    expect(readFileSync(sentinel, "utf8")).toBe("keep");
  });

  it("records exactly nine independent seed-42 semantic scenes", () => {
    const manifest = readJson(join(GALLERY_ROOT, "manifest.json"));
    const scenes = manifest.scenes as JsonObject[];

    expect(manifest).toMatchObject({
      schema: "agent-workflow-gallery-manifest.v1",
      seed: 42,
      cases: CASES,
      views: VIEWS,
      crossCaseTransitions: [],
    });
    expect(scenes).toHaveLength(9);
    expect(
      scenes.map((scene) => `${scene.case}/${scene.view}`).sort(),
    ).toEqual(
      CASES.flatMap((caseId) =>
        VIEWS.map((view) => `${caseId}/${view}`)
      ).sort(),
    );
    for (const sceneEntry of scenes) {
      expect(sceneEntry).toMatchObject({
        sceneSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        normalizedSpecSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        buildMetadataSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        elementCount: expect.any(Number),
        elementCounts: expect.any(Object),
        dimensions: {
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        },
        sceneMetadata: {
          semanticCounts: expect.any(Object),
          fileCount: 0,
          editableElementCount: expect.any(Number),
          connectorBinding: expect.stringMatching(
            /^(?:native-bound|unbound)$/u,
          ),
          geometryIssueCount: expect.any(Number),
        },
      });
      const scenePath = join(
        GALLERY_ROOT,
        String(sceneEntry.scenePath),
      );
      expect(sha256(readFileSync(scenePath))).toBe(sceneEntry.sceneSha256);
      const scene = readJson(scenePath);
      expect(
        (scene.elements as JsonObject[]).every(
          (element) => element.updated === 0,
        ),
      ).toBe(true);
    }
  });

  it("keeps connector editability claims view-exact", () => {
    for (const caseId of CASES) {
      for (const view of VIEWS) {
        const scene = readJson(
          join(GALLERY_ROOT, caseId, `${view}.excalidraw`),
        );
        const arrows = (scene.elements as JsonObject[]).filter(
          (element) => element.type === "arrow",
        );
        expect(arrows.length).toBeGreaterThan(0);
        if (view === "swimlane") {
          expect(
            arrows.every(
              (arrow) =>
                arrow.startBinding !== null && arrow.endBinding !== null,
            ),
          ).toBe(true);
        } else {
          expect(
            arrows.every(
              (arrow) =>
                arrow.startBinding === null && arrow.endBinding === null,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("pins PNG hashes to explicit renderer, browser, and font provenance", () => {
    const provenance = readJson(
      join(GALLERY_ROOT, "visual-provenance.json"),
    );
    const images = provenance.images as JsonObject[];

    expect(provenance).toMatchObject({
      schema: "agent-workflow-visual-provenance.v1",
      semanticDeterminismGate: false,
      renderer: {
        package: "excalidraw-diagrams-renderer",
        version: expect.any(String),
        excalidrawVersion: expect.any(String),
        scriptSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        bundleIndexSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        exportScale: 2,
        background: "#ffffff",
      },
      browser: {
        engine: "chromium",
        version: expect.any(String),
        playwrightVersion: expect.any(String),
        platform: expect.any(String),
        architecture: expect.any(String),
        nodeVersion: expect.any(String),
      },
      browserErrors: { console: 0, page: 0 },
    });
    expect((provenance.fonts as JsonObject[]).length).toBeGreaterThan(0);
    expect(images).toHaveLength(11);
    for (const image of images) {
      const path = join(GALLERY_ROOT, String(image.path));
      expect(sha256(readFileSync(path))).toBe(image.sha256);
      expect(image.dimensions).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });
    }
  });

  it("reports controlled label-density differences and measured route deltas", () => {
    const report = readJson(
      join(GALLERY_ROOT, "label-density", "report.json"),
    );
    const variants = report.variants as Record<string, JsonObject>;
    const routeDiff = report.routeDiff as JsonObject;

    expect(report).toMatchObject({
      schema: "agent-workflow-label-density.v1",
      case: "review-fix",
      seed: 42,
      controlledDifference: "transition.label fields only",
      topologySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      cardTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      ownershipBoundary: {
        sourceOwner: "T-117",
        defaultChanged: false,
        routingChanged: false,
        placementChanged: false,
        overlapToleranceChanged: false,
        humanAcceptance: "pending",
      },
    });
    expect(variants.dense.status).toBe("clean");
    expect(variants["load-bearing"].status).toBe("clean");
    expect(Number(variants.dense.labelCount)).toBe(12);
    expect(Number(variants["load-bearing"].labelCount)).toBeLessThan(12);
    for (const variant of Object.values(variants)) {
      expect(variant).toMatchObject({
        labels: expect.any(Array),
        totalLabelArea: expect.any(Number),
        sceneArea: expect.any(Number),
        labelAreaRatio: expect.any(Number),
        labelLabelIntersectionCount: expect.any(Number),
        labelLabelIntersections: expect.any(Array),
        labelCardIntersectionCount: expect.any(Number),
        labelCardIntersections: expect.any(Array),
        associatedLabelCount: expect.any(Number),
        traceableLabelCount: expect.any(Number),
      });
      expect(Number(variant.associatedLabelCount)).toBeLessThanOrEqual(
        Number(variant.labelCount),
      );
      expect(Number(variant.associatedLabelCount)).toBeGreaterThan(0);
      expect(variant.traceableLabelCount).toBe(variant.labelCount);
    }
    expect(routeDiff).toMatchObject({
      available: true,
      comparedTransitionCount: 12,
      changedRouteCount: expect.any(Number),
      unchangedRouteCount: expect.any(Number),
      changedTransitionIds: expect.any(Array),
    });
    expect(
      Number(routeDiff.changedRouteCount)
      + Number(routeDiff.unchangedRouteCount),
    ).toBe(routeDiff.comparedTransitionCount);
    expect((routeDiff.changedTransitionIds as string[]).length).toBe(
      routeDiff.changedRouteCount,
    );
  });

  it("publishes a direct visual verdict only for the reviewed scene and PNG hashes", () => {
    const binding = readJson(
      join(GALLERY_ROOT, "label-density", "visual-review.json"),
    );
    const report = readJson(
      join(GALLERY_ROOT, "label-density", "report.json"),
    );
    const provenance = readJson(
      join(GALLERY_ROOT, "visual-provenance.json"),
    );
    const images = provenance.images as JsonObject[];
    const variants = report.variants as Record<string, JsonObject>;
    const reviewed = binding.reviewedVariants as Record<string, JsonObject>;
    const current = binding.currentVariants as Record<string, JsonObject>;

    expect(binding).toMatchObject({
      schema: "agent-workflow-label-density-visual-review-binding.v1",
      status: "accepted",
      reviewSourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      mismatches: [],
      verdict: expect.any(String),
      defaultDecision: expect.stringContaining(
        "T-117 human acceptance remains pending",
      ),
    });
    for (const variant of ["dense", "load-bearing"]) {
      const image = images.find(
        (candidate) => candidate.path === reviewed[variant].pngPath,
      );
      expect(image).toBeDefined();
      expect(current[variant]).toEqual(reviewed[variant]);
      expect(variants[variant].sceneSha256).toBe(
        reviewed[variant].sceneSha256,
      );
      expect(image?.sha256).toBe(reviewed[variant].pngSha256);
    }
  });

  it("moves direct visual review to pending when rendered evidence changes", async () => {
    const moduleUrl = `${pathToFileURL(GENERATOR_PATH).href}?review-binding`;
    const generator = await import(moduleUrl) as {
      bindLabelVisualReview(
        review: JsonObject,
        report: JsonObject,
        provenance: JsonObject,
      ): JsonObject;
    };
    const review = readJson(LABEL_VISUAL_REVIEW_SOURCE);
    const report = readJson(
      join(GALLERY_ROOT, "label-density", "report.json"),
    );
    const provenance = structuredClone(
      readJson(join(GALLERY_ROOT, "visual-provenance.json")),
    );
    const images = provenance.images as JsonObject[];
    const denseImage = images.find(
      (image) => image.path === "label-density/dense/swimlane.png",
    );
    expect(denseImage).toBeDefined();
    denseImage!.sha256 = "0".repeat(64);

    const binding = generator.bindLabelVisualReview(
      review,
      report,
      provenance,
    );

    expect(binding).toMatchObject({
      status: "pending",
      message: expect.stringContaining("Direct visual re-review is required"),
    });
    expect(binding).not.toHaveProperty("verdict");
    expect((binding.mismatches as string[]).length).toBeGreaterThan(0);
  });

  it("states case independence, recovered-text provenance, and ledger-sized loss", () => {
    const readme = readFileSync(join(GALLERY_ROOT, "README.md"), "utf8");

    expect(readme.match(/!\[[^\]]+\]\([^)]+\.png\)/gu)).toHaveLength(9);
    expect(readme).toContain(
      "The cases are not an execution chain; `crossCaseTransitions` is deliberately empty.",
    );
    expect(readme).toContain(
      "these images are new projections from recovered text",
    );
    expect(readme).toContain(
      "neither a reconstructed baseline nor evidence of visual equivalence",
    );
    expect(readme).toContain(
      "Only the swimlane compiler emits native bound connectors",
    );
    expect(readme).toContain(
      "This is a count summary of the evaluated 105-row coverage ledger, not a duplicate ledger.",
    );
  });

  it("keeps the nested repository gallery out of the npm tarball", () => {
    const packRoot = join(TEMP_ROOT, "pack");
    mkdirSync(packRoot, { recursive: true });
    const result = spawnSync(
      "npm",
      [
        "pack",
        "--dry-run",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        packRoot,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const packets = JSON.parse(result.stdout) as Array<{
      files: Array<{ path: string }>;
    }>;
    const paths = packets.flatMap((packet) =>
      packet.files.map(({ path }) => path)
    );

    expect(
      paths.some((path) => path.startsWith("examples/agent-workflows/")),
    ).toBe(false);
  });
});

function listFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
