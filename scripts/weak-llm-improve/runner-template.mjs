// Shared geometry/routing runner template for weak-LLM diagram evals.
//
// The weak model only authors restricted-TS graph source (node/section/connect).
// This module turns that source into a runnable script that owns ALL geometry:
// section positions, card sizing, icon validation, edge ports, routing, and the
// overlap / arrow-through-block validation. Both the batch harness
// (run-eval.mjs) and the single-eval render helper (render-graph.mjs) import
// buildRunner from here so there is exactly one runner definition to maintain.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const INDEX_IMPORT = pathToFileURL(resolve("dist/index.js")).href;

export const ALLOWED_ICONS = [
  "news_document",
  "tool_call",
  "prompt_template",
  "api_connector",
  "agent_planner",
  "data_catalog",
  "function_router",
  "model_validation",
  "server_stack",
  "historical_database",
  "model_deployment",
  "cloud_data",
  "signal_quality_magnifier",
  "monitoring_dashboard",
];

// Build a self-contained Node script that executes the model's authored graph
// source and writes <excalidrawPath> + <summaryPath>. meta carries the header
// text and slug: { title, thesis, slug }.
export function buildRunner(source, meta, paths) {
  return `import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AssetRegistry, Bounds, Scene, assertDiagramHealthy, boundsFor, layout as baseLayout, polylineIntersectsBounds } from "${INDEX_IMPORT}";

const scene = new Scene({ seed: 20260630, assetRegistry: AssetRegistry.bundled() });
const nodes = new Map();
const labelPlacements = [];
const edges = [];
const sections = [];
const allowedIcons = new Set(${JSON.stringify(ALLOWED_ICONS)});
const CANVAS_WIDTH = 1780;
const BAND_PADDING = 20;
const DEFAULT_ROW_GAP = 88;
const DEFAULT_COLUMN_GAP = 54;
let nextSectionY = 126;

const layout = {
  ...baseLayout,
  row(blocks, options = {}) {
    return baseLayout.row(blocks, { ...options, gap: Math.max(numberOption(options.gap, DEFAULT_ROW_GAP), DEFAULT_ROW_GAP) });
  },
  column(blocks, options = {}) {
    return baseLayout.column(blocks, { ...options, gap: Math.max(numberOption(options.gap, DEFAULT_COLUMN_GAP), DEFAULT_COLUMN_GAP) });
  },
};

scene.text(40, 28, ${JSON.stringify(meta.title)}, { size: 32, width: 1700, align: "center" });
scene.text(40, 70, ${JSON.stringify(meta.thesis)}, { size: 16, color: "#475569", width: 1700, align: "center" });

function node(id, title, iconId, bullets = []) {
  if (nodes.has(id)) {
    throw new Error(\`Duplicate node id: \${id}\`);
  }
  if (!allowedIcons.has(iconId)) {
    throw new Error(\`Unknown icon id: \${iconId}. Allowed: \${[...allowedIcons].join(", ")}\`);
  }
  const block = layout.node(scene, { title, iconId, bullets, minWidth: 260, maxWidth: 300 });
  nodes.set(id, block);
  return block;
}

function numberOption(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function section(title, yOrGroup, maybeGroup) {
  const group = maybeGroup ?? yOrGroup;
  if (!group?.bounds) {
    throw new Error(\`Section \${title} received a non-layout group\`);
  }
  const width = Math.max(group.bounds.width + BAND_PADDING * 2, 1040);
  const x = (CANVAS_WIDTH - width) / 2;
  const block = layout.section(scene, {
    title,
    x,
    y: nextSectionY,
    minWidth: width,
    padding: BAND_PADDING,
    titleHeight: 30,
    headerGap: 12,
    children: [group],
  });
  sections.push({ title, block });
  nextSectionY = block.bounds.bottom + 24;
  return block;
}

function routePolicy(from, to, options) {
  if (options.path || options.from || options.to) {
    return options;
  }
  const verticalGap = Math.max(0, Math.max(from.bounds.top, to.bounds.top) - Math.min(from.bounds.bottom, to.bounds.bottom));
  if (verticalGap <= 24 && hasHorizontalBlocker(from, to)) {
    return {
      ...options,
      path: "outer",
      outerSide: "top",
      routeBounds: boundsFor([...from.elements, ...to.elements]),
      outerGap: 44,
    };
  }
  return options;
}

function hasHorizontalBlocker(from, to) {
  const sourceLeft = from.bounds.centerX <= to.bounds.centerX;
  const left = sourceLeft ? from.bounds.right : to.bounds.right;
  const right = sourceLeft ? to.bounds.left : from.bounds.left;
  if (right <= left) {
    return false;
  }
  const y = (from.bounds.centerY + to.bounds.centerY) / 2;
  return [...nodes.values()].some((block) => {
    if (block === from || block === to) {
      return false;
    }
    return y >= block.bounds.top - 4
      && y <= block.bounds.bottom + 4
      && right > block.bounds.left
      && left < block.bounds.right;
  });
}

function connect(id, fromId, toId, label, options = {}) {
  const from = nodes.get(fromId);
  const to = nodes.get(toId);
  if (!from || !to) {
    throw new Error(\`Impossible edge \${id}: \${fromId} -> \${toId}\`);
  }
  const baseOptions = {
    label,
    path: "auto",
    obstacles: [...nodes.values()],
    // Pin every label to its own line (no fly-high search); collisions with other
    // labels and with unrelated card text/borders are de-conflicted globally
    // afterwards by layout.resolveLabelCollisions (sliding labels along their lines).
    labelOnLine: true,
    labelGap: 12,
    clearance: 10,
    ...routePolicy(from, to, options),
    // Label placement is computed from the geometry; a model cannot fling its
    // own labels by passing an offset.
    labelOffset: undefined,
    label_offset: undefined,
  };
  let route = layout.connectRouted(scene, from, to, baseOptions);
  if (routeHitsUnrelatedBlock(route, from, to)) {
    removeRoute(route);
    route = bestOuterRoute(from, to, baseOptions);
  }
  if (route.label) {
    labelPlacements.push({ element: route.label, points: route.points, ownerIds: [fromId, toId] });
  }
  edges.push({
    id,
    from: fromId,
    to: toId,
    label: route.label ? { id: \`\${id}_label\`, element: route.label, bounds: boundsFor([route.label]) } : undefined,
    points: route.points,
  });
  return route;
}

function bestOuterRoute(from, to, baseOptions) {
  const routeBounds = boundsFor([...nodes.values()].flatMap((block) => block.elements));
  let fallbackSide = "right";
  for (const outerSide of ["left", "right", "top", "bottom"]) {
    const candidate = layout.connectRouted(scene, from, to, {
      ...baseOptions,
      path: "outer",
      outerSide,
      routeBounds,
      outerGap: 64,
    });
    if (!routeHitsUnrelatedBlock(candidate, from, to)) {
      return candidate;
    }
    if (outerSide === "left") {
      fallbackSide = outerSide;
    }
    removeRoute(candidate);
  }
  return layout.connectRouted(scene, from, to, {
    ...baseOptions,
    path: "outer",
    outerSide: fallbackSide,
    routeBounds,
    outerGap: 64,
  });
}

function routeHitsUnrelatedBlock(route, from, to) {
  return [...nodes.values()].some((block) => {
    if (block === from || block === to) {
      return false;
    }
    return polylineIntersectsBounds(route.points, block.bounds);
  });
}

function removeRoute(route) {
  const remove = new Set([route.arrow, route.label].filter(Boolean));
  scene.elements = scene.elements.filter((element) => !remove.has(element));
}

// Model-authored source runs in its own scope so its top-level declarations
// (e.g. \`const data = ...\`) cannot collide with the runner's finalization
// variables below. It still reaches the helpers and shared collections
// (node/section/connect/layout/scene/nodes/edges/...) via closure.
(() => {
${source}
})();

// Scene geometry is fully built. De-conflict edge labels by sliding them along
// their own connection lines off other labels and off unrelated card text/borders
// (a label may still rest in a card's free interior). Then refresh the snapshotted
// label bounds the health check reads from.
const labelCards = [...nodes.entries()].map(([id, block]) => ({
  id,
  bounds: block.bounds,
  textBounds: block.elements.filter((el) => el.type === "text").map((el) => boundsFor([el])),
}));
layout.resolveLabelCollisions(labelPlacements, { cards: labelCards });
for (const edge of edges) {
  if (edge.label) {
    edge.label.bounds = boundsFor([edge.label.element]);
  }
}

const blocks = [...nodes.entries()].map(([id, block]) => ({ id, bounds: block.bounds, kind: "node" }));
const renderHeight = Math.max(nextSectionY + 360, 3600);
const result = assertDiagramHealthy({
  blocks,
  edges,
  gap: 6,
  // Labels ride their connection lines: tolerate a label overlapping the two
  // cards its own edge connects, and minor label-label overlap. resolveLabelCollisions
  // above already slid notable text-text collisions apart.
  tolerateEdgeLabelOverlap: true,
  renderBounds: new Bounds(-2400, -1000, 6600, Math.max(renderHeight + 1200, 11000)),
});

mkdirSync(dirname("${paths.excalidrawPath}"), { recursive: true });
scene.write("${paths.excalidrawPath}");
const data = JSON.parse(readFileSync("${paths.excalidrawPath}", "utf8"));
assert.equal(data.type, "excalidraw");
assert.ok(data.elements.length > 0);
assert.ok(Object.keys(data.files ?? {}).length > 0);

writeFileSync("${paths.summaryPath}", JSON.stringify({
  scenario: ${JSON.stringify(meta.slug)},
  excalidrawPath: "${paths.excalidrawPath}",
  elements: data.elements.length,
  files: Object.keys(data.files ?? {}).length,
  nodes: nodes.size,
  edges: edges.length,
  renderHeight,
  sections: sections.map((item) => ({ title: item.title, bounds: item.block.bounds })),
  validation: { ok: result.ok, errors: result.errors, warnings: result.warnings },
}, null, 2));
`;
}
