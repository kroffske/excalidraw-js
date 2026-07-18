#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform, arch } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_ROOT = join(ROOT, "examples", "agent-workflows");
const C4_FIXTURE_ROOT = join(ROOT, "tests", "fixtures", "semantic-c4", "v1");
const SEQUENCE_FIXTURE_ROOT = join(
  ROOT,
  "tests",
  "fixtures",
  "semantic-sequence",
  "v1",
);
const SWIMLANE_FIXTURE_ROOT = join(
  ROOT,
  "tests",
  "fixtures",
  "semantic-swimlane",
  "v1",
);
const COVERAGE_ROOT = join(
  ROOT,
  "tests",
  "fixtures",
  "semantic-workflow-views",
  "v1",
);
const COVERAGE_LEDGER_PATH = join(COVERAGE_ROOT, "coverage-ledger.json");
const LABEL_VISUAL_REVIEW_PATH = join(
  COVERAGE_ROOT,
  "label-density-visual-review.json",
);

const CASE_IDS = ["review", "review-plan", "review-fix"];
const VIEW_DEFINITIONS = [
  { id: "c4", fixtureRoot: C4_FIXTURE_ROOT },
  { id: "sequence", fixtureRoot: SEQUENCE_FIXTURE_ROOT },
  { id: "swimlane", fixtureRoot: SWIMLANE_FIXTURE_ROOT },
];
const SEED = 42;
const RENDER_SCALE = 2;
const RENDER_BACKGROUND = "#ffffff";
const LABEL_ASSOCIATION_GAP = 16;
const LOAD_BEARING_TRANSITIONS = new Set([
  "accepted-approved-status",
  "approved-blocked",
  "approved-apply",
  "apply-worktree",
  "worktree-verify",
  "verify-task",
  "verify-report",
  "verify-completion",
  "verify-retained-worktree",
]);

export async function generateAgentWorkflowViews(options = {}) {
  const outputRoot = resolve(options.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const buildPackage = options.buildPackage ?? true;
  const renderPngs = options.renderPngs ?? true;
  const priorProvenance = renderPngs
    ? null
    : readOptionalJson(join(outputRoot, "visual-provenance.json"))
      ?? readOptionalJson(
        join(DEFAULT_OUTPUT_ROOT, "visual-provenance.json"),
      );

  requireInputs();
  if (buildPackage) {
    run("npm", ["run", "build"], ROOT);
  }

  const api = await importBuiltApi();
  prepareOutputRoot(outputRoot);

  const manifestEntries = [];
  const renderedScenePaths = [];
  for (const caseId of CASE_IDS) {
    for (const view of VIEW_DEFINITIONS) {
      const spec = readJson(join(view.fixtureRoot, `${caseId}.json`));
      const built = buildScene(api, spec, `${caseId}/${view.id}`);
      const scenePath = join(outputRoot, caseId, `${view.id}.excalidraw`);
      writeJson(scenePath, built.scene);
      renderedScenePaths.push(scenePath);
      manifestEntries.push(
        manifestEntry(caseId, view.id, built, outputRoot, scenePath),
      );
    }
  }

  const manifest = {
    schema: "agent-workflow-gallery-manifest.v1",
    seed: SEED,
    cases: CASE_IDS,
    views: VIEW_DEFINITIONS.map(({ id }) => id),
    crossCaseTransitions: [],
    scenes: manifestEntries,
  };
  writeJson(join(outputRoot, "manifest.json"), manifest);

  const labelExperiment = buildLabelExperiment(api, outputRoot);
  for (const variant of Object.values(labelExperiment.variants)) {
    if (variant.status === "clean") {
      renderedScenePaths.push(join(outputRoot, variant.scenePath));
    }
  }

  const coverageSummary = summarizeCoverage(readJson(COVERAGE_LEDGER_PATH));
  let provenance = priorProvenance;
  if (renderPngs) {
    provenance = await renderScenes(renderedScenePaths, outputRoot);
    writeJson(join(outputRoot, "visual-provenance.json"), provenance);
  }
  const visualReview = bindLabelVisualReview(
    readJson(LABEL_VISUAL_REVIEW_PATH),
    labelExperiment.report,
    provenance,
  );
  writeJson(
    join(outputRoot, "label-density", "report.json"),
    labelExperiment.report,
  );
  writeJson(
    join(outputRoot, "label-density", "visual-review.json"),
    visualReview,
  );
  writeFileSync(
    join(outputRoot, "README.md"),
    galleryReadme(
      manifest,
      coverageSummary,
      labelExperiment.report,
      visualReview,
    ),
    "utf8",
  );

  return {
    outputRoot,
    manifest,
    labelReport: labelExperiment.report,
    visualReview,
    coverageSummary,
  };
}

function prepareOutputRoot(outputRoot) {
  const filesystemRoot = parse(outputRoot).root;
  const rootRelative = relative(outputRoot, ROOT);
  const ownsRepository =
    rootRelative === ""
    || (!rootRelative.startsWith("..") && !isAbsolute(rootRelative));
  if (
    outputRoot === filesystemRoot
    || outputRoot === homedir()
    || ownsRepository
  ) {
    throw new Error(
      `Refusing to replace unsafe output root '${outputRoot}'`,
    );
  }

  if (existsSync(outputRoot)) {
    const entries = readdirSync(outputRoot);
    const isDefaultRoot = outputRoot === DEFAULT_OUTPUT_ROOT;
    const hasGalleryMarker = hasExpectedGalleryManifest(outputRoot);
    if (entries.length > 0 && !isDefaultRoot && !hasGalleryMarker) {
      throw new Error(
        `Refusing to replace non-empty unowned output root '${outputRoot}'`,
      );
    }
    rmSync(outputRoot, { recursive: true, force: true });
  }
  mkdirSync(outputRoot, { recursive: true });
}

function hasExpectedGalleryManifest(outputRoot) {
  const manifestPath = join(outputRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    return false;
  }
  try {
    return (
      readJson(manifestPath).schema
      === "agent-workflow-gallery-manifest.v1"
    );
  } catch {
    return false;
  }
}

function requireInputs() {
  const missing = [];
  for (const caseId of CASE_IDS) {
    for (const { fixtureRoot } of VIEW_DEFINITIONS) {
      const path = join(fixtureRoot, `${caseId}.json`);
      if (!existsSync(path)) {
        missing.push(relative(ROOT, path));
      }
    }
  }
  if (!existsSync(COVERAGE_LEDGER_PATH)) {
    missing.push(relative(ROOT, COVERAGE_LEDGER_PATH));
  }
  if (!existsSync(LABEL_VISUAL_REVIEW_PATH)) {
    missing.push(relative(ROOT, LABEL_VISUAL_REVIEW_PATH));
  }
  if (missing.length > 0) {
    throw new Error(
      `Required accepted inputs are missing:\n${missing.map((path) => `- ${path}`).join("\n")}`,
    );
  }
}

async function importBuiltApi() {
  const path = join(ROOT, "dist", "index.js");
  if (!existsSync(path)) {
    throw new Error(
      "Built package is missing. Run without --skip-build or run `npm run build` first.",
    );
  }
  return import(`${pathToFileURL(path).href}?mtime=${statSync(path).mtimeMs}`);
}

function buildScene(api, spec, owner) {
  const validation = api.validateDiagramSpec(spec, { seed: SEED });
  if (!validation.ok) {
    throw new Error(
      `${owner} validation failed:\n${stableJson(validation.diagnostics)}`,
    );
  }
  const result = api.buildDiagramSpec(spec, { seed: SEED });
  if (!result.ok) {
    throw new Error(
      `${owner} build failed:\n${stableJson(result.diagnostics)}`,
    );
  }
  if (!result.geometry.ok) {
    throw new Error(`${owner} produced non-clean geometry`);
  }

  const scene = normalizeScene(result.scene.toObject());
  return {
    scene,
    normalizedSpec: validation.value,
    metadata: result.metadata,
    geometry: result.geometry,
    diagnostics: result.diagnostics,
    sceneBounds: boundsForElements(scene.elements),
  };
}

function normalizeScene(rawScene) {
  const scene = structuredClone(rawScene);
  for (const element of scene.elements) {
    element.updated = 0;
  }
  for (const file of Object.values(scene.files)) {
    if ("created" in file) {
      file.created = 0;
    }
    if ("lastRetrieved" in file) {
      file.lastRetrieved = 0;
    }
  }
  return scene;
}

function manifestEntry(caseId, viewId, built, outputRoot, scenePath) {
  const elementCounts = {};
  for (const element of built.scene.elements) {
    const type = String(element.type);
    elementCounts[type] = (elementCounts[type] ?? 0) + 1;
  }
  const semanticCounts = {};
  for (const key of ["containers", "relationships", "participants", "messages", "notes", "lanes", "activities", "transitions"]) {
    if (Array.isArray(built.metadata[key])) {
      semanticCounts[key] = built.metadata[key].length;
    }
  }

  return {
    case: caseId,
    view: viewId,
    template: built.metadata.template,
    scenePath: relative(outputRoot, scenePath),
    sceneSha256: sha256(stableJson(built.scene)),
    normalizedSpecSha256: sha256(stableJson(built.normalizedSpec)),
    buildMetadataSha256: sha256(stableJson(built.metadata)),
    elementCount: built.scene.elements.length,
    elementCounts: sortedObject(elementCounts),
    dimensions: built.sceneBounds,
    sceneMetadata: {
      semanticCounts,
      fileCount: Object.keys(built.scene.files).length,
      editableElementCount: built.scene.elements.filter(
        (element) => element.isDeleted !== true,
      ).length,
      connectorBinding: viewId === "swimlane" ? "native-bound" : "unbound",
      geometryIssueCount: built.geometry.issues.length,
    },
  };
}

function buildLabelExperiment(api, outputRoot) {
  const source = readJson(join(SWIMLANE_FIXTURE_ROOT, "review-fix.json"));
  const denseSpec = structuredClone(source);
  const loadBearingSpec = structuredClone(source);

  for (const transition of denseSpec.transitions) {
    if (typeof transition.label !== "string" || transition.label.length === 0) {
      throw new Error(
        `Dense review-fix variant requires a label on transition '${transition.id}'`,
      );
    }
  }
  for (const transition of loadBearingSpec.transitions) {
    if (!LOAD_BEARING_TRANSITIONS.has(transition.id)) {
      delete transition.label;
    }
  }
  assertLabelOnlyDifference(denseSpec, loadBearingSpec);

  const dense = buildLabelVariant(api, "dense", denseSpec, outputRoot);
  const loadBearing = buildLabelVariant(
    api,
    "load-bearing",
    loadBearingSpec,
    outputRoot,
  );
  const routeDiff = compareRoutes(dense, loadBearing);
  const topologySha256 = sha256(stableJson(withoutTransitionLabels(denseSpec)));
  const report = {
    schema: "agent-workflow-label-density.v1",
    case: "review-fix",
    seed: SEED,
    controlledDifference: "transition.label fields only",
    topologySha256,
    cardTextSha256: sha256(
      stableJson(source.activities.map(({ id, title }) => ({ id, title }))),
    ),
    activityOrder: source.activities.map(({ id }) => id),
    transitionOrder: source.transitions.map(({ id }) => id),
    variants: {
      dense: dense.report,
      "load-bearing": loadBearing.report,
    },
    routeDiff,
    ownershipBoundary: {
      sourceOwner: "T-117",
      defaultChanged: false,
      routingChanged: false,
      placementChanged: false,
      overlapToleranceChanged: false,
      humanAcceptance: "pending",
    },
  };

  return {
    report,
    variants: {
      dense,
      "load-bearing": loadBearing,
    },
  };
}

function buildLabelVariant(api, id, spec, outputRoot) {
  const validation = api.validateDiagramSpec(spec, { seed: SEED });
  if (!validation.ok) {
    return failedLabelVariant(
      id,
      "validation-failed",
      validation.diagnostics,
    );
  }
  const result = api.buildDiagramSpec(spec, { seed: SEED });
  if (!result.ok) {
    return failedLabelVariant(
      id,
      "geometry-or-binding-failed",
      result.diagnostics,
      result.geometry,
    );
  }

  const scene = normalizeScene(result.scene.toObject());
  const scenePath = join("label-density", id, "swimlane.excalidraw");
  writeJson(join(outputRoot, scenePath), scene);
  const measurements = measureLabelVariant(result, scene);
  return {
    status: "clean",
    scenePath,
    metadata: result.metadata,
    report: {
      status: "clean",
      scenePath,
      pngPath: join("label-density", id, "swimlane.png"),
      sceneSha256: sha256(stableJson(scene)),
      normalizedSpecSha256: sha256(stableJson(validation.value)),
      geometryIssueCount: result.geometry.issues.length,
      diagnostics: stableDiagnostics(result.diagnostics),
      ...measurements,
    },
  };
}

function failedLabelVariant(id, status, diagnostics, geometry) {
  return {
    status,
    metadata: null,
    report: {
      status,
      scenePath: null,
      pngPath: null,
      geometryIssueCount: geometry?.issues?.length ?? null,
      diagnostics: stableDiagnostics(diagnostics),
      labelCount: null,
      labelLabelIntersections: null,
      labelCardIntersections: null,
      associatedLabelCount: null,
      traceableLabelCount: null,
    },
  };
}

function measureLabelVariant(result, scene) {
  const byId = new Map(scene.elements.map((element) => [element.id, element]));
  const labels = result.metadata.transitions.flatMap((transition) => {
    if (!transition.labelElementId) {
      return [];
    }
    const element = byId.get(transition.labelElementId);
    if (!element) {
      throw new Error(
        `Transition '${transition.id}' references missing label element '${transition.labelElementId}'`,
      );
    }
    return [{
      transitionId: transition.id,
      elementId: transition.labelElementId,
      bounds: elementBounds(element),
      points: transition.points,
      from: transition.from,
      to: transition.to,
    }];
  });
  const cards = result.metadata.activities.map((activity) => ({
    activityId: activity.id,
    bounds: plainBounds(activity.bounds),
  }));

  const labelLabelIntersections = [];
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) {
      const area = intersectionArea(
        labels[left].bounds,
        labels[right].bounds,
      );
      if (area > 0) {
        labelLabelIntersections.push({
          labels: [
            labels[left].transitionId,
            labels[right].transitionId,
          ],
          area,
        });
      }
    }
  }

  const labelCardIntersections = [];
  for (const label of labels) {
    for (const card of cards) {
      const area = intersectionArea(label.bounds, card.bounds);
      if (area > 0) {
        labelCardIntersections.push({
          label: label.transitionId,
          card: card.activityId,
          endpoint:
            card.activityId === label.from || card.activityId === label.to,
          area,
        });
      }
    }
  }

  const labelRouteGaps = new Map(
    labels.map((label) => [
      label.transitionId,
      round(polylineDistanceToBounds(label.points, label.bounds)),
    ]),
  );
  const associatedLabels = labels.filter(
    (label) =>
      labelRouteGaps.get(label.transitionId) <= LABEL_ASSOCIATION_GAP,
  );
  const traceableLabels = labels.filter((label) => {
    const transition = result.metadata.transitions.find(
      (candidate) => candidate.id === label.transitionId,
    );
    return (
      transition
      && transition.labelElementId === label.elementId
      && transition.elementIds.includes(label.elementId)
    );
  });
  const sceneBounds = boundsForElements(scene.elements);
  const labelMeasurements = labels.map((label) => ({
    transitionId: label.transitionId,
    width: round(label.bounds.width),
    height: round(label.bounds.height),
    area: round(label.bounds.width * label.bounds.height),
    routeGapPx: labelRouteGaps.get(label.transitionId),
  }));
  const totalLabelArea = round(
    labelMeasurements.reduce((total, label) => total + label.area, 0),
  );
  const sceneArea = round(sceneBounds.width * sceneBounds.height);

  return {
    labelCount: labels.length,
    labels: labelMeasurements,
    totalLabelArea,
    sceneArea,
    labelAreaRatio: sceneArea > 0
      ? round(totalLabelArea / sceneArea)
      : 0,
    labelLabelIntersectionCount: labelLabelIntersections.length,
    labelLabelIntersections,
    labelCardIntersectionCount: labelCardIntersections.length,
    labelCardIntersections,
    lineAssociationGapPx: LABEL_ASSOCIATION_GAP,
    associatedLabelCount: associatedLabels.length,
    traceableLabelCount: traceableLabels.length,
  };
}

function compareRoutes(dense, loadBearing) {
  if (dense.status !== "clean" || loadBearing.status !== "clean") {
    return {
      available: false,
      changedRouteCount: null,
      changedTransitionIds: [],
      reason: "Both variants must have clean scenes before routes can be compared.",
    };
  }
  const denseRoutes = new Map(
    dense.metadata.transitions.map(({ id, points }) => [id, points]),
  );
  const changedTransitionIds = loadBearing.metadata.transitions
    .filter(
      ({ id, points }) =>
        stableJson(points) !== stableJson(denseRoutes.get(id)),
    )
    .map(({ id }) => id);
  return {
    available: true,
    comparedTransitionCount: denseRoutes.size,
    changedRouteCount: changedTransitionIds.length,
    unchangedRouteCount: denseRoutes.size - changedTransitionIds.length,
    changedTransitionIds,
  };
}

export function bindLabelVisualReview(review, report, provenance) {
  if (review.schema !== "agent-workflow-label-density-visual-review.v1") {
    throw new Error(`Unsupported label visual-review schema '${review.schema}'`);
  }
  const variants = ["dense", "load-bearing"];
  const provenanceImages = Array.isArray(provenance?.images)
    ? provenance.images
    : [];
  const currentVariants = {};
  const mismatches = [];

  for (const variant of variants) {
    const reviewed = review.reviewedVariants?.[variant];
    const measured = report.variants?.[variant];
    if (!reviewed || measured?.status !== "clean") {
      mismatches.push(`${variant}: reviewed or clean scene evidence is missing`);
      continue;
    }
    const image = provenanceImages.find(
      (candidate) => candidate.path === reviewed.pngPath,
    );
    currentVariants[variant] = {
      sceneSha256: measured.sceneSha256,
      pngPath: reviewed.pngPath,
      pngSha256: image?.sha256 ?? null,
    };
    if (measured.sceneSha256 !== reviewed.sceneSha256) {
      mismatches.push(`${variant}: scene SHA-256 changed`);
    }
    if (!image || image.sha256 !== reviewed.pngSha256) {
      mismatches.push(`${variant}: PNG SHA-256 changed or is unavailable`);
    }
  }

  const accepted = mismatches.length === 0;
  return {
    schema: "agent-workflow-label-density-visual-review-binding.v1",
    status: accepted ? "accepted" : "pending",
    reviewSourceSha256: sha256(stableJson(review)),
    reviewedAt: review.reviewedAt,
    reviewedBy: review.reviewedBy,
    reviewedVariants: review.reviewedVariants,
    currentVariants,
    mismatches,
    ...(accepted
      ? {
        verdict: review.verdict,
        dense: review.dense,
        loadBearing: review.loadBearing,
        defaultDecision: review.defaultDecision,
      }
      : {
        message:
          "Scene or PNG evidence changed. Direct visual re-review is required before publishing a preference or acceptance claim.",
      }),
  };
}

function assertLabelOnlyDifference(dense, loadBearing) {
  const denseWithoutLabels = withoutTransitionLabels(dense);
  const loadBearingWithoutLabels = withoutTransitionLabels(loadBearing);
  if (stableJson(denseWithoutLabels) !== stableJson(loadBearingWithoutLabels)) {
    throw new Error(
      "Label-density variants differ outside transition.label fields",
    );
  }
}

function withoutTransitionLabels(spec) {
  const copy = structuredClone(spec);
  for (const transition of copy.transitions) {
    delete transition.label;
  }
  return copy;
}

async function renderScenes(scenePaths, outputRoot) {
  const renderModulePath = join(ROOT, "dist", "render.js");
  const renderApi = await import(
    `${pathToFileURL(renderModulePath).href}?mtime=${statSync(renderModulePath).mtimeMs}`
  );
  const rendererDir = renderApi.defaultCacheDir();
  run(
    process.execPath,
    [join(ROOT, "dist", "bin", "excalidraw-render-setup.js")],
    ROOT,
  );

  const images = [];
  let consoleErrorCount = 0;
  let pageErrorCount = 0;
  for (const scenePath of scenePaths) {
    const pngPath = scenePath.replace(/\.excalidraw$/u, ".png");
    const result = spawnSync(
      process.execPath,
      [
        join(rendererDir, "render-excalidraw.mjs"),
        scenePath,
        pngPath,
        "--scale",
        String(RENDER_SCALE),
        "--background",
        RENDER_BACKGROUND,
        "--browser-log",
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    consoleErrorCount += countMatches(output, /\[browser:error\]/gu);
    pageErrorCount += countMatches(output, /\[browser:pageerror\]/gu);
    if (result.error || result.status !== 0) {
      throw new Error(
        `Renderer failed for ${relative(ROOT, scenePath)}:\n${output.trim()}`,
      );
    }
    if (consoleErrorCount > 0 || pageErrorCount > 0) {
      throw new Error(
        `Renderer emitted browser errors for ${relative(ROOT, scenePath)}:\n${output.trim()}`,
      );
    }
    const bytes = readFileSync(pngPath);
    images.push({
      path: relative(outputRoot, pngPath),
      sha256: sha256(bytes),
      dimensions: pngDimensions(bytes),
    });
  }

  const environment = await rendererEnvironment(rendererDir);
  return {
    schema: "agent-workflow-visual-provenance.v1",
    semanticDeterminismGate: false,
    renderer: {
      package: environment.rendererPackage.name,
      version: environment.rendererPackage.version,
      excalidrawVersion:
        environment.rendererPackage.dependencies["@excalidraw/excalidraw"],
      scriptSha256: sha256(
        readFileSync(join(rendererDir, "render-excalidraw.mjs")),
      ),
      bundleIndexSha256: sha256(
        readFileSync(join(rendererDir, "dist", "index.html")),
      ),
      exportScale: RENDER_SCALE,
      background: RENDER_BACKGROUND,
    },
    browser: {
      engine: "chromium",
      version: environment.browserVersion,
      playwrightVersion: environment.playwrightVersion,
      platform: platform(),
      architecture: arch(),
      nodeVersion: process.version,
    },
    fonts: rendererFonts(rendererDir),
    browserErrors: {
      console: consoleErrorCount,
      page: pageErrorCount,
    },
    images,
  };
}

async function rendererEnvironment(rendererDir) {
  const rendererPackage = readJson(join(rendererDir, "package.json"));
  const requireFromRenderer = createRequire(join(rendererDir, "package.json"));
  const playwright = requireFromRenderer("playwright");
  const playwrightPackage = requireFromRenderer("playwright/package.json");
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    return {
      rendererPackage,
      playwrightVersion: playwrightPackage.version,
      browserVersion: browser.version(),
    };
  } finally {
    await browser.close();
  }
}

function rendererFonts(rendererDir) {
  return listFiles(join(rendererDir, "dist"))
    .filter((path) => /\.(?:woff2?|ttf)$/iu.test(path))
    .map((path) => ({
      path: relative(rendererDir, path),
      sha256: sha256(readFileSync(path)),
    }));
}

function summarizeCoverage(ledger) {
  const rows = Array.isArray(ledger) ? ledger : ledger.rows;
  if (!Array.isArray(rows)) {
    throw new Error("Coverage ledger must be an array or expose a rows array");
  }
  const grades = ["structural", "annotated", "omitted"];
  const summary = Object.fromEntries(
    VIEW_DEFINITIONS.map(({ id }) => [
      id,
      Object.fromEntries(grades.map((grade) => [grade, 0])),
    ]),
  );
  for (const row of rows) {
    const view = row.view;
    const grade = row.grade;
    if (!(view in summary) || !grades.includes(grade)) {
      throw new Error(
        `Coverage ledger contains unsupported view/grade: ${stableJson({ view, grade })}`,
      );
    }
    summary[view][grade] += 1;
  }
  if (rows.length !== 105) {
    throw new Error(`Coverage ledger must contain 105 rows, got ${rows.length}`);
  }
  return { rowCount: rows.length, byView: summary };
}

function galleryReadme(
  manifest,
  coverage,
  labelReport,
  visualReview,
) {
  const lossRows = VIEW_DEFINITIONS.map(({ id }) => {
    const counts = coverage.byView[id];
    return `| ${viewLabel(id)} | ${counts.structural} | ${counts.annotated} | ${counts.omitted} |`;
  }).join("\n");
  const routeDiff = labelReport.routeDiff.available
    ? `${labelReport.routeDiff.changedRouteCount} of ${labelReport.routeDiff.comparedTransitionCount}`
    : "unavailable because one variant did not produce a clean scene";
  const visualReviewSummary = visualReview.status === "accepted"
    ? `${visualReview.verdict} ${visualReview.defaultDecision}`
    : `Direct visual verdict is pending. ${visualReview.message}`;

  return `# Agent workflow views

This repository-only gallery compares three independent workflow cases through three questions. The cases are not an execution chain; \`crossCaseTransitions\` is deliberately empty.

| Case | C4: runtime structure | Sequence: interactions in time | Swimlane: activity ownership |
| --- | --- | --- | --- |
| Review | ![Review C4](review/c4.png) | ![Review sequence](review/sequence.png) | ![Review swimlane](review/swimlane.png) |
| Review plan | ![Review-plan C4](review-plan/c4.png) | ![Review-plan sequence](review-plan/sequence.png) | ![Review-plan swimlane](review-plan/swimlane.png) |
| Review fix | ![Review-fix C4](review-fix/c4.png) | ![Review-fix sequence](review-fix/sequence.png) | ![Review-fix swimlane](review-fix/swimlane.png) |

## View-selection matrix

| View | Use it to answer | Structural strengths | Intended limits |
| --- | --- | --- | --- |
| C4 container | Which internal runtime containers, durable surfaces, responsibilities, and dependencies exist? | Internal container identity and dominant dependency direction. | The operator and human gates are annotation or omission, not false containers. Time and parallelism are outside this view. |
| Sequence interaction | Which cross-participant interactions happen, and in what order? | Participant identity, message endpoints, message kind, and input order. | Concurrency and alternatives are annotation only in the current v1 template. |
| Flow swimlane | Who owns each activity, where can work branch or join, and where do artifacts or humans take over? | Lane membership, activity kind, transition topology, reachability, depth, and fork/join structure. | Runtime-container responsibility is not native swimlane structure. |

All three outputs contain ordinary independently editable Excalidraw elements. Only the swimlane compiler emits native bound connectors that follow moved endpoints; C4 and sequence arrows are intentionally unbound.

## Case findings

- **Review:** C4 makes the trusted workflow, full agent sessions, and task artifacts easy to locate. Sequence makes the four-participant interaction order explicit. Swimlane carries the parallel review branches, their join, and the human disposition handoff structurally.
- **Review plan:** these images are new projections from recovered text. The legacy editable diagram and PNG are unavailable, so this is neither a reconstructed baseline nor evidence of visual equivalence.
- **Review fix:** C4 adds the isolated linked worktree as a fourth internal container. Sequence foregrounds implementation and independent verification interactions. Swimlane makes accepted-only work, completion routing, and retained-worktree ownership visible.

## Ledger-derived information loss

This is a count summary of the evaluated 105-row coverage ledger, not a duplicate ledger. The separate normative expectation map fixes each expected grade and witness. A grade means that the fact is represented structurally, present only in annotation text, or omitted because the view does not own that question.

| View | Structural | Annotated | Omitted |
| --- | ---: | ---: | ---: |
${lossRows}

## Connector-label density evidence

Both \`review-fix\` variants use seed \`${SEED}\`, identical topology, activity order, and card text; only transition \`label\` fields differ.

| Variant | Labels | Label-label intersections | Label-card intersections | Associated with own route | Traceable to transition |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dense | ${metric(labelReport.variants.dense, "labelCount")} | ${metric(labelReport.variants.dense, "labelLabelIntersectionCount")} | ${metric(labelReport.variants.dense, "labelCardIntersectionCount")} | ${metric(labelReport.variants.dense, "associatedLabelCount")} | ${metric(labelReport.variants.dense, "traceableLabelCount")} |
| Load-bearing | ${metric(labelReport.variants["load-bearing"], "labelCount")} | ${metric(labelReport.variants["load-bearing"], "labelLabelIntersectionCount")} | ${metric(labelReport.variants["load-bearing"], "labelCardIntersectionCount")} | ${metric(labelReport.variants["load-bearing"], "associatedLabelCount")} | ${metric(labelReport.variants["load-bearing"], "traceableLabelCount")} |

Exact route changes: ${routeDiff}. ${visualReviewSummary}

- [Dense PNG](label-density/dense/swimlane.png)
- [Load-bearing PNG](label-density/load-bearing/swimlane.png)
- [Machine-readable measurements](label-density/report.json)
- [Hash-bound direct visual review](label-density/visual-review.json)

## Reproduce

\`\`\`sh
node scripts/generate-agent-workflow-views.mjs
npm run pack:check
\`\`\`

The generator builds the package, compiles all nine fixtures at seed \`${manifest.seed}\`, normalizes every element \`updated\` value to zero, renders PNGs with the bundled renderer, and records environment-sensitive PNG hashes separately in \`visual-provenance.json\`. Normalized scenes and \`manifest.json\` are semantic determinism evidence; PNG hashes require visual re-review when renderer, browser, or fonts change.

The nested \`examples/agent-workflows/\` gallery is intentionally absent from the npm package. Evidence is limited to these three frozen workflows; it does not establish lossless conversion, universal workflow coverage, pixel superiority, or a weak-model benchmark.
`;
}

function metric(variant, key) {
  return variant.status === "clean" ? String(variant[key]) : "unavailable";
}

function viewLabel(view) {
  switch (view) {
    case "c4":
      return "C4";
    case "sequence":
      return "Sequence";
    case "swimlane":
      return "Swimlane";
    default:
      return view;
  }
}

function stableDiagnostics(diagnostics) {
  return diagnostics.map(({ severity, code, path, message, hint }) => ({
    severity,
    code,
    path,
    message,
    ...(hint ? { hint } : {}),
  }));
}

function boundsForElements(elements) {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const bounds = elements.map(elementBounds);
  const left = Math.min(...bounds.map((entry) => entry.x));
  const top = Math.min(...bounds.map((entry) => entry.y));
  const right = Math.max(...bounds.map((entry) => entry.x + entry.width));
  const bottom = Math.max(...bounds.map((entry) => entry.y + entry.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function elementBounds(element) {
  return {
    x: Number(element.x ?? 0),
    y: Number(element.y ?? 0),
    width: Number(element.width ?? 0),
    height: Number(element.height ?? 0),
  };
}

function plainBounds(bounds) {
  return {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width),
    height: Number(bounds.height),
  };
}

function intersectionArea(left, right) {
  const width =
    Math.min(left.x + left.width, right.x + right.width)
    - Math.max(left.x, right.x);
  const height =
    Math.min(left.y + left.height, right.y + right.height)
    - Math.max(left.y, right.y);
  return width > 0 && height > 0 ? round(width * height) : 0;
}

function polylineDistanceToBounds(points, bounds) {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    distance = Math.min(
      distance,
      segmentDistanceToBounds(points[index - 1], points[index], bounds),
    );
  }
  return distance;
}

function segmentDistanceToBounds(start, end, bounds) {
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  if (
    pointInside(start, left, right, top, bottom)
    || pointInside(end, left, right, top, bottom)
  ) {
    return 0;
  }
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
  const edges = corners.map((corner, index) => [
    corner,
    corners[(index + 1) % corners.length],
  ]);
  if (
    edges.some(([edgeStart, edgeEnd]) =>
      segmentsIntersect(start, end, edgeStart, edgeEnd)
    )
  ) {
    return 0;
  }
  return Math.min(
    pointDistanceToBounds(start, bounds),
    pointDistanceToBounds(end, bounds),
    ...corners.map((corner) => pointDistanceToSegment(corner, start, end)),
  );
}

function pointInside([x, y], left, right, top, bottom) {
  return x >= left && x <= right && y >= top && y <= bottom;
}

function segmentsIntersect(a, b, c, d) {
  const orientation = (p, q, r) =>
    Math.sign(
      (q[1] - p[1]) * (r[0] - q[0])
      - (q[0] - p[0]) * (r[1] - q[1]),
    );
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

function pointDistanceToBounds([x, y], bounds) {
  const dx = Math.max(bounds.x - x, 0, x - (bounds.x + bounds.width));
  const dy = Math.max(bounds.y - y, 0, y - (bounds.y + bounds.height));
  return Math.hypot(dx, dy);
}

function pointDistanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy)
      / (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + projection * dx),
    point[1] - (start[1] + projection * dy),
  );
}

function pngDimensions(bytes) {
  if (
    bytes.length < 24
    || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a"
  ) {
    throw new Error("Renderer output is not a PNG");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function listFiles(root) {
  const files = [];
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

function sortedObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
}

function round(value) {
  return Number(value.toFixed(3));
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readOptionalJson(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableJson(value), "utf8");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Command failed (${result.status ?? "spawn"}): ${[command, ...args].join(" ")}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

function parseArgs(argv) {
  const options = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    buildPackage: true,
    renderPngs: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output-root") {
      const value = argv[++index];
      if (!value) {
        throw new Error("--output-root requires a path");
      }
      options.outputRoot = resolve(value);
    } else if (arg === "--skip-build") {
      options.buildPackage = false;
    } else if (arg === "--skip-render") {
      options.renderPngs = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument '${arg}'`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/generate-agent-workflow-views.mjs [options]

Options:
  --output-root PATH  Write to a non-default root (used by determinism tests)
  --skip-build        Use the existing dist build
  --skip-render       Generate deterministic scenes/data without PNGs
  --help              Show this help
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const result = await generateAgentWorkflowViews(options);
  process.stdout.write(
    `Generated ${result.manifest.scenes.length} workflow views in ${result.outputRoot}\n`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
