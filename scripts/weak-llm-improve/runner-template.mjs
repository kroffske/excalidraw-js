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

export function wrapHeaderText(text, maxLineLength = 110) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxLineLength) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export function partitionRowEntries(entries, maxNodesPerRow = 4) {
  if (entries.length <= maxNodesPerRow) return [entries];
  const rowCount = Math.ceil(entries.length / maxNodesPerRow);
  const itemsPerRow = Math.ceil(entries.length / rowCount);
  const rows = [];
  for (let index = 0; index < entries.length; index += itemsPerRow) {
    rows.push(entries.slice(index, index + itemsPerRow));
  }
  return rows;
}

// Build a self-contained Node script that executes the model's authored graph
// source and writes <excalidrawPath> + <summaryPath>. meta carries the header
// text and slug: { title, thesis, slug }.
export function buildRunner(source, meta, paths) {
  const wrappedThesis = wrapHeaderText(meta.thesis);
  const indexImport = paths.indexImport ?? INDEX_IMPORT;
  return `import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AssetRegistry, Bounds, Scene, assertDiagramHealthy, boundsFor, inflateBounds, layout as baseLayout, measureText, polylineIntersectsBounds } from ${JSON.stringify(indexImport)};

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
const MAX_NODES_PER_ROW = 4;
const EXCALIDRAW_PATH = ${JSON.stringify(paths.excalidrawPath)};
const SUMMARY_PATH = ${JSON.stringify(paths.summaryPath)};
const partitionRowEntries = ${partitionRowEntries.toString()};
let sectionTitleAlignment = "left";
let nextSectionY = 126;

const layout = {
  ...baseLayout,
  row(blocks, options = {}) {
    const gap = Math.max(numberOption(options.gap, DEFAULT_ROW_GAP), DEFAULT_ROW_GAP);
    const entries = Object.entries(blocks);
    if (entries.length <= MAX_NODES_PER_ROW) {
      return baseLayout.row(blocks, { ...options, gap });
    }
    const rows = {};
    for (const [index, entriesForRow] of partitionRowEntries(entries, MAX_NODES_PER_ROW).entries()) {
      rows[\`row_\${index + 1}\`] = baseLayout.row(
        Object.fromEntries(entriesForRow),
        { gap, align: options.align },
      );
    }
    return baseLayout.column(rows, {
      gap: Math.max(numberOption(options.rowGap, DEFAULT_COLUMN_GAP), DEFAULT_COLUMN_GAP),
      align: "center",
    });
  },
  column(blocks, options = {}) {
    return baseLayout.column(blocks, { ...options, gap: Math.max(numberOption(options.gap, DEFAULT_COLUMN_GAP), DEFAULT_COLUMN_GAP) });
  },
};

const diagramTitle = scene.text(90, 22, ${JSON.stringify(meta.title)}, { size: 32, width: 1600, align: "center" });
const diagramThesis = scene.text(90, 64, ${JSON.stringify(wrappedThesis)}, { size: 15, color: "#475569", width: 1600, align: "center" });

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
  const titleElement = block.elements.find((element) => element.type === "text" && element.text === title);
  if (!titleElement) {
    throw new Error(\`Section \${title} did not produce a title element\`);
  }
  // fitPanel gives its title text element the full section width. Measure the
  // visible glyph area instead, otherwise every edge through an empty part of
  // the header band is falsely reported as a title crossing.
  const measuredTitle = measureText(title, { size: 17 });
  const visibleTitleBounds = new Bounds(
    titleElement.x,
    titleElement.y,
    Math.min(titleElement.width, measuredTitle.width),
    measuredTitle.height,
  );
  const headerBlock = new baseLayout.PlacedBlock([titleElement], inflateBounds(visibleTitleBounds, 8));
  sections.push({
    title,
    block,
    headerBlock,
    titleElement,
    titleWidth: Math.min(titleElement.width, measuredTitle.width),
    titleHeight: measuredTitle.height,
  });
  nextSectionY = block.bounds.bottom + 24;
  return block;
}

function obstacleBlocks() {
  return nodeBlocks();
}

function nodeBlocks() {
  return [...nodes.values()];
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
      // Section titles live in the top band. Long same-row edges use the
      // bottom corridor so the deterministic route never crosses a heading.
      outerSide: "bottom",
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
    obstacles: obstacleBlocks(),
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
  const routeBounds = boundsFor(nodeBlocks().flatMap((block) => block.elements));
  for (const outerSide of ["left", "right", "top", "bottom"]) {
    const candidate = layout.connectRouted(scene, from, to, {
      ...baseOptions,
      path: "outer",
      outerSide,
      routeBounds,
      outerGap: 64,
    });
    const hitsNode = routeHitsUnrelatedBlock(candidate, from, to);
    if (!hitsNode) {
      return candidate;
    }
    removeRoute(candidate);
  }
  return layout.connectRouted(scene, from, to, {
    ...baseOptions,
    path: "outer",
    outerSide: "right",
    routeBounds,
    outerGap: 64,
  });
}

function routeHitsUnrelatedBlock(route, from, to) {
  return nodeBlocks().some((block) => {
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

// Choose the quietest title position in each section after routes exist.
// Moving title text is safer than rerouting an otherwise node-safe edge
// through cards, and per-section placement avoids a global compromise that
// still leaves one long cross-section route cutting through a heading.
alignSectionTitles();

function alignSectionTitles() {
  const alignments = ["left", "center", "right"];
  const selected = [];
  for (const item of sections) {
    let bestAlignment = "left";
    let bestScore = Number.POSITIVE_INFINITY;
    for (const alignment of alignments) {
      const bounds = sectionTitleBounds(item, alignment);
      const score = edges.filter((edge) => polylineIntersectsBounds(edge.points, bounds)).length;
      if (score < bestScore) {
        bestAlignment = alignment;
        bestScore = score;
      }
    }
    const bounds = sectionTitleBounds(item, bestAlignment);
    item.titleElement.x = bounds.x + 8;
    item.titleElement.width = item.titleWidth;
    item.headerBlock.bounds = bounds;
    selected.push(bestAlignment);
  }
  const unique = [...new Set(selected)];
  sectionTitleAlignment = unique.length === 1 ? unique[0] : "mixed";
}

function sectionTitleBounds(item, alignment) {
  const left = item.block.bounds.left + 18;
  const right = item.block.bounds.right - 18 - item.titleWidth;
  const x = alignment === "right"
    ? right
    : alignment === "center"
      ? item.block.bounds.centerX - item.titleWidth / 2
      : left;
  return inflateBounds(new Bounds(x, item.titleElement.y, item.titleWidth, item.titleHeight), 8);
}

// Scene geometry is fully built. De-conflict edge labels by sliding them along
// their own connection lines off other labels and off unrelated card text/borders
// (a label may still rest in a card's free interior). Then refresh the snapshotted
// label bounds the health check reads from.
const labelCards = [...nodes.entries()].map(([id, block]) => ({
  id,
  bounds: block.bounds,
  textBounds: block.elements.filter((el) => el.type === "text").map((el) => boundsFor([el])),
})).concat(sections.map((item, index) => ({
  id: \`section_title_\${index + 1}\`,
  bounds: item.headerBlock.bounds,
  textBounds: [item.headerBlock.bounds],
})));
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

const oversizedSections = sections
  .filter((item) => item.block.bounds.width > CANVAS_WIDTH)
  .map((item) => ({ title: item.title, width: item.block.bounds.width }));
assert.deepEqual(oversizedSections, [], "Runner must keep every section within the canvas width");
const sectionTitleCrossings = edges.flatMap((edge) => sections
  .filter((item) => polylineIntersectsBounds(edge.points, item.headerBlock.bounds))
  .map((item) => ({ edge: edge.id, section: item.title })));

mkdirSync(dirname(EXCALIDRAW_PATH), { recursive: true });
scene.write(EXCALIDRAW_PATH);
const data = JSON.parse(readFileSync(EXCALIDRAW_PATH, "utf8"));
assert.equal(data.type, "excalidraw");
assert.ok(data.elements.length > 0);
assert.ok(Object.keys(data.files ?? {}).length > 0);

writeFileSync(SUMMARY_PATH, JSON.stringify({
  scenario: ${JSON.stringify(meta.slug)},
  excalidrawPath: EXCALIDRAW_PATH,
  elements: data.elements.length,
  files: Object.keys(data.files ?? {}).length,
  nodes: nodes.size,
  edges: edges.length,
  renderHeight,
  header: {
    title: boundsFor([diagramTitle]),
    thesis: boundsFor([diagramThesis]),
  },
  sections: sections.map((item) => ({ title: item.title, bounds: item.block.bounds })),
  quality: {
    maxNodesPerRow: MAX_NODES_PER_ROW,
    sectionTitleAlignment,
    maxSectionWidth: Math.max(0, ...sections.map((item) => item.block.bounds.width)),
    oversizedSections,
    sectionTitleCrossings,
  },
  validation: { ok: result.ok, errors: result.errors, warnings: result.warnings },
}, null, 2));
`;
}
