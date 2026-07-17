// Safe high-level visual runner for weak-model evals that are not naturally
// node/edge architecture graphs. The model can compose a small set of bounded
// pictorial helpers; Scene construction, repeated geometry, styling, routing,
// file output, and canvas validation remain runner-owned.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { wrapHeaderText } from "./runner-template.mjs";

export const INDEX_IMPORT = pathToFileURL(resolve("dist/index.js")).href;

export function buildVisualRunner(source, meta, paths) {
  const wrappedThesis = wrapHeaderText(meta.thesis);
  const indexImport = paths.indexImport ?? INDEX_IMPORT;
  return `import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Bounds, Scene, boundsFor, measureText, polylineIntersectsBounds } from ${JSON.stringify(indexImport)};

const CANVAS = { width: 1600, height: 1000, left: 24, top: 118, right: 1576, bottom: 976 };
const EXCALIDRAW_PATH = ${JSON.stringify(paths.excalidrawPath)};
const SUMMARY_PATH = ${JSON.stringify(paths.summaryPath)};
const scene = new Scene({ seed: 20260717, background: "#ffffff" });
const objects = new Map();
const links = [];
const palette = {
  neutral: { stroke: "#334155", fill: "#f8fafc", text: "#0f172a" },
  accent: { stroke: "#2563eb", fill: "#dbeafe", text: "#1e3a8a" },
  success: { stroke: "#15803d", fill: "#dcfce7", text: "#14532d" },
  warning: { stroke: "#b45309", fill: "#fef3c7", text: "#78350f" },
  danger: { stroke: "#b91c1c", fill: "#fee2e2", text: "#7f1d1d" },
  purple: { stroke: "#7e22ce", fill: "#f3e8ff", text: "#581c87" },
};

const diagramTitle = text(60, 20, ${JSON.stringify(meta.title)}, { size: 32, width: 1480, align: "center", color: "#0f172a" });
const diagramThesis = text(60, 64, ${JSON.stringify(wrappedThesis)}, { size: 15, width: 1480, align: "center", color: "#475569" });

function style(tone = "neutral") {
  if (!palette[tone]) throw new Error(\`Unknown tone: \${tone}. Allowed: \${Object.keys(palette).join(", ")}\`);
  return palette[tone];
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(\`\${label} must be a finite number\`);
  return value;
}

function boundedRect(x, y, w, h, label) {
  finite(x, \`\${label}.x\`); finite(y, \`\${label}.y\`); finite(w, \`\${label}.w\`); finite(h, \`\${label}.h\`);
  if (w <= 0 || h <= 0) throw new Error(\`\${label} width and height must be positive\`);
  const bounds = new Bounds(x, y, w, h);
  if (bounds.left < CANVAS.left || bounds.top < CANVAS.top || bounds.right > CANVAS.right || bounds.bottom > CANVAS.bottom) {
    throw new Error(\`\${label} is outside the 1600x1000 content canvas: \${JSON.stringify(bounds)}\`);
  }
  return bounds;
}

function boundsOverlap(left, right) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function register(id, kind, bounds, elements) {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(\`Object id must be snake_case: \${id}\`);
  if (objects.has(id)) throw new Error(\`Duplicate object id: \${id}\`);
  const actualBounds = boundsFor(elements);
  const escapes = actualBounds.left < bounds.left - 1
    || actualBounds.top < bounds.top - 1
    || actualBounds.right > bounds.right + 1
    || actualBounds.bottom > bounds.bottom + 1;
  if (escapes) throw new Error(\`\${kind} \${id} content escapes its declared bounds: \${JSON.stringify(actualBounds)} outside \${JSON.stringify(bounds)}\`);
  const record = { id, kind, bounds, actualBounds };
  objects.set(id, record);
  return record;
}

function filledRect(x, y, w, h, tone = "neutral", options = {}) {
  const colors = style(tone);
  const element = scene.rect(x, y, w, h, { color: colors.stroke, strokeWidth: options.strokeWidth ?? 2, dashed: options.dashed ?? false });
  element.backgroundColor = options.fill ?? colors.fill;
  element.fillStyle = "solid";
  element.roughness = options.roughness ?? 0;
  element.roundness = options.roundness === false ? null : { type: 3 };
  return element;
}

function wrapped(text, maxChars) {
  const words = String(text ?? "").trim().split(/\\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? \`\${line} \${word}\` : word;
    if (line && next.length > maxChars) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.join("\\n");
}

function text(x, y, content, options = {}) {
  const value = String(content);
  const size = options.size ?? 16;
  const family = options.family ?? 2;
  const measured = measureText(value, { size, family });
  const boxWidth = options.width;
  if (boxWidth && measured.width > boxWidth + 1) {
    throw new Error(\`Text exceeds width \${boxWidth}: \${JSON.stringify(value)} needs \${Math.ceil(measured.width)}\`);
  }
  const align = options.align ?? "left";
  const placedX = boxWidth && align === "center"
    ? x + (boxWidth - measured.width) / 2
    : boxWidth && align === "right"
      ? x + boxWidth - measured.width
      : x;
  return scene.text(placedX, y, value, {
    size,
    color: options.color ?? "#0f172a",
    family,
  });
}

function line(points, options = {}) {
  const element = scene.line(points, { color: options.color ?? "#64748b", strokeWidth: options.strokeWidth ?? 2, dashed: options.dashed ?? false });
  element.roughness = options.roughness ?? 0;
  return element;
}

function arrow(points, options = {}) {
  const element = scene.arrow(points, { color: options.color ?? "#475569", strokeWidth: options.strokeWidth ?? 2, dashed: options.dashed ?? false, roundness: null });
  element.roughness = options.roughness ?? 0;
  return element;
}

function card(id, title, lines = [], options = {}) {
  const elementStart = scene.elements.length;
  const x = options.x ?? 80;
  const y = options.y ?? 160;
  const w = options.w ?? 360;
  const maxChars = Math.max(14, Math.floor((w - 36) / 9));
  const titleText = wrapped(title, Math.max(14, Math.floor((w - 36) / 10)));
  const titleLines = Math.max(1, titleText.split("\\n").length);
  const bodyLines = lines.flatMap((item) => {
    const wrappedItem = wrapped(item, maxChars).split("\\n");
    return wrappedItem.map((part, index) => \`\${index === 0 ? "• " : "  "}\${part}\`);
  });
  const bodyY = y + 16 + titleLines * 24 + 12;
  const minimumHeight = Math.max(130, bodyY - y + bodyLines.length * 19 + 18);
  const h = options.h ?? minimumHeight;
  if (h < minimumHeight) throw new Error(\`card \${id} needs h >= \${minimumHeight} for its text; got \${h}\`);
  const bounds = boundedRect(x, y, w, h, \`card \${id}\`);
  const colors = style(options.tone ?? "neutral");
  filledRect(x, y, w, h, options.tone ?? "neutral");
  text(x + 18, y + 16, titleText, { size: 20, color: colors.text, width: w - 36 });
  if (bodyLines.length) {
    const body = bodyLines.join("\\n");
    text(x + 18, bodyY, body, { size: 14, color: "#334155", width: w - 36 });
  }
  register(id, "card", bounds, scene.elements.slice(elementStart));
}

function candle(id, title, options = {}) {
  const elementStart = scene.elements.length;
  const x = options.x ?? 120;
  const y = options.y ?? 180;
  const w = options.w ?? 360;
  const h = options.h ?? 640;
  const bounds = boundedRect(x, y, w, h, \`candle \${id}\`);
  filledRect(x, y, w, h, "neutral", { fill: "#fffdf7" });
  text(x + 18, y + 16, wrapped(title, Math.max(16, Math.floor((w - 36) / 11))), { size: 21, width: w - 36, align: "center" });
  const waxW = Math.min(150, w * 0.46);
  const waxH = h * 0.52;
  const waxX = x + (w - waxW) / 2;
  const waxY = y + h * 0.34;
  const wax = scene.rect(waxX, waxY, waxW, waxH, { color: "#b45309", strokeWidth: 2 });
  wax.backgroundColor = options.tone === "accent" ? "#dbeafe" : "#fef3c7";
  wax.fillStyle = "solid"; wax.roughness = 1;
  line([[waxX + waxW / 2, waxY], [waxX + waxW / 2, waxY - 34]], { color: "#334155", strokeWidth: 3 });
  const flame = scene.ellipse(waxX + waxW / 2 - 20, waxY - 94, 40, 62, { color: "#d97706", strokeWidth: 2 });
  flame.backgroundColor = "#fbbf24"; flame.fillStyle = "solid"; flame.roughness = 1;
  line([[waxX + 22, waxY + 60], [waxX + 55, waxY + 74], [waxX + 85, waxY + 58]], { color: "#f59e0b", strokeWidth: 2 });
  line([[waxX - 18, waxY + waxH + 16], [waxX + waxW + 18, waxY + waxH + 16]], { color: "#64748b", strokeWidth: 4 });
  text(x + 28, y + h - 54, options.caption ?? "flame • wick • wax", { size: 14, color: "#64748b", width: w - 56, align: "center" });
  register(id, "candle", bounds, scene.elements.slice(elementStart));
}

function candlestickChart(id, title, candles, options = {}) {
  const elementStart = scene.elements.length;
  if (!Array.isArray(candles) || candles.length < 3 || candles.length > 12) throw new Error("candlestickChart needs 3-12 OHLC entries");
  const x = options.x ?? 560;
  const y = options.y ?? 180;
  const w = options.w ?? 920;
  const h = options.h ?? 640;
  const bounds = boundedRect(x, y, w, h, \`candlestickChart \${id}\`);
  filledRect(x, y, w, h, "neutral", { fill: "#ffffff" });
  text(x + 22, y + 16, wrapped(title, Math.max(18, Math.floor((w - 310) / 11))), { size: 21, width: w - 310 });
  text(x + w - 245, y + 20, wrapped("green = close ≥ open   red = close < open", 28), { size: 12, color: "#64748b", width: 220, align: "right" });
  const plot = { left: x + 70, top: y + 80, right: x + w - 30, bottom: y + h - 70 };
  for (let grid = 0; grid <= 4; grid += 1) {
    const gy = plot.top + (plot.bottom - plot.top) * grid / 4;
    line([[plot.left, gy], [plot.right, gy]], { color: "#cbd5e1", strokeWidth: 1, dashed: true });
  }
  line([[plot.left, plot.top], [plot.left, plot.bottom], [plot.right, plot.bottom]], { color: "#475569", strokeWidth: 2 });
  const values = candles.flatMap((item) => [item.open, item.high, item.low, item.close].map(Number));
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Every candlestick entry needs numeric open/high/low/close");
  candles.forEach((item, index) => {
    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);
    if (low > high || open < low || open > high || close < low || close > high) {
      throw new Error(\`Candlestick \${index + 1} must satisfy low <= open/close <= high\`);
    }
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scaleY = (value) => plot.bottom - (value - min) / Math.max(1, max - min) * (plot.bottom - plot.top);
  const slot = (plot.right - plot.left) / candles.length;
  candles.forEach((item, index) => {
    const cx = plot.left + slot * (index + 0.5);
    const rising = item.close >= item.open;
    const tone = rising ? "success" : "danger";
    const highY = scaleY(item.high);
    const lowY = scaleY(item.low);
    const openY = scaleY(item.open);
    const closeY = scaleY(item.close);
    line([[cx, highY], [cx, lowY]], { color: style(tone).stroke, strokeWidth: 3 });
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.max(8, Math.abs(openY - closeY));
    filledRect(cx - Math.min(24, slot * 0.24), bodyTop, Math.min(48, slot * 0.48), bodyH, tone, { roundness: false });
    text(cx - slot * 0.35, plot.bottom + 14, item.label ?? String(index + 1), { size: 12, color: "#64748b", width: slot * 0.7, align: "center" });
  });
  text(x + 20, y + h - 38, options.caption ?? "wick = high–low • body = open–close", { size: 13, color: "#475569", width: w - 40, align: "center" });
  register(id, "candlestick_chart", bounds, scene.elements.slice(elementStart));
}

function arrayStrip(id, values, options = {}) {
  const elementStart = scene.elements.length;
  if (!Array.isArray(values) || values.length < 2 || values.length > 14) throw new Error("arrayStrip needs 2-14 values");
  const x = options.x ?? 100;
  const y = options.y ?? 220;
  const cell = options.cell ?? Math.min(92, Math.floor((options.w ?? 1200) / values.length));
  const labelH = options.label ? 40 : 0;
  const pointerLabels = (options.pointers ?? []).map((pointer) => wrapped(pointer.label, Math.max(6, Math.floor(cell / 9))));
  const maxPointerLines = Math.max(1, ...pointerLabels.map((label) => label.split("\\n").length));
  const pointerH = pointerLabels.length ? Math.max(76, 64 + maxPointerLines * 17) : 34;
  const w = cell * values.length;
  const h = labelH + cell + pointerH;
  const bounds = boundedRect(x, y, w, h, \`arrayStrip \${id}\`);
  if (options.label) text(x, y, wrapped(options.label, Math.max(12, Math.floor(w / 11))), { size: 20, color: "#0f172a", width: w });
  const top = y + labelH;
  const highlights = options.highlights ?? {};
  values.forEach((value, index) => {
    const tone = highlights[index] ?? "neutral";
    filledRect(x + index * cell, top, cell, cell, tone, { roundness: false });
    text(x + index * cell, top + cell * 0.27, String(value), { size: 22, color: style(tone).text, width: cell, align: "center" });
    if (options.indices !== false) text(x + index * cell, top + cell + 8, String(index), { size: 13, color: "#64748b", width: cell, align: "center" });
  });
  for (const [pointerIndex, pointer] of (options.pointers ?? []).entries()) {
    if (!Number.isInteger(pointer.index) || pointer.index < 0 || pointer.index >= values.length) throw new Error(\`Pointer index out of range in \${id}\`);
    const cx = x + pointer.index * cell + cell / 2;
    const py = top + cell + 58;
    text(cx - cell / 2, py, pointerLabels[pointerIndex], { size: 14, color: style(pointer.tone ?? "accent").stroke, width: cell, align: "center" });
    arrow([[cx, py - 4], [cx, top + cell + 2]], { color: style(pointer.tone ?? "accent").stroke, strokeWidth: 2 });
  }
  register(id, "array_strip", bounds, scene.elements.slice(elementStart));
}

function uiWindow(id, title, options = {}) {
  const elementStart = scene.elements.length;
  const x = options.x ?? 70;
  const y = options.y ?? 145;
  const w = options.w ?? 1460;
  const h = options.h ?? 790;
  const bounds = boundedRect(x, y, w, h, \`uiWindow \${id}\`);
  filledRect(x, y, w, h, "neutral", { fill: "#ffffff" });
  filledRect(x, y, w, 48, "neutral", { fill: "#e2e8f0", roundness: false, strokeWidth: 1 });
  [0, 1, 2].forEach((index) => {
    const dot = scene.ellipse(x + 18 + index * 22, y + 16, 12, 12, { color: ["#ef4444", "#f59e0b", "#22c55e"][index], strokeWidth: 1 });
    dot.backgroundColor = ["#fecaca", "#fde68a", "#bbf7d0"][index]; dot.fillStyle = "solid"; dot.roughness = 0;
  });
  text(x + 90, y + 13, wrapped(title, Math.max(20, Math.floor((w - 180) / 9))), { size: 16, color: "#334155", width: w - 180, align: "center" });
  const sidebarW = Math.max(190, w * 0.16);
  const listW = Math.max(310, w * 0.25);
  const contentTop = y + 48;
  filledRect(x, contentTop, sidebarW, h - 48, "neutral", { fill: "#f8fafc", roundness: false, strokeWidth: 1 });
  text(x + 18, contentTop + 20, options.workspace ?? "Workspace", { size: 19, width: sidebarW - 36 });
  (options.sidebar ?? ["Inbox", "Assigned", "Analytics"]).slice(0, 7).forEach((item, index) => {
    if (index === (options.activeSidebar ?? 0)) filledRect(x + 12, contentTop + 62 + index * 42, sidebarW - 24, 34, "accent", { strokeWidth: 1 });
    text(x + 24, contentTop + 70 + index * 42, item, { size: 14, color: index === (options.activeSidebar ?? 0) ? "#1d4ed8" : "#475569", width: sidebarW - 48 });
  });
  const listX = x + sidebarW;
  filledRect(listX, contentTop, listW, h - 48, "neutral", { fill: "#ffffff", roundness: false, strokeWidth: 1 });
  text(listX + 18, contentTop + 20, options.listTitle ?? "Queue", { size: 19, width: listW - 36 });
  (options.items ?? []).slice(0, 5).forEach((item, index) => {
    const iy = contentTop + 62 + index * 94;
    const active = index === (options.activeItem ?? 0);
    filledRect(listX + 12, iy, listW - 24, 80, active ? "accent" : "neutral", { strokeWidth: 1 });
    text(listX + 24, iy + 12, wrapped(item.title ?? item, Math.floor((listW - 48) / 9)), { size: 15, color: "#0f172a", width: listW - 48 });
    text(listX + 24, iy + 50, item.meta ?? "", { size: 12, color: "#64748b", width: listW - 48 });
  });
  const detailX = listX + listW;
  const detailW = w - sidebarW - listW;
  text(detailX + 28, contentTop + 22, options.detailTitle ?? "Selected item", { size: 22, width: detailW - 56 });
  const detailLines = (options.detail ?? []).flatMap((item) => wrapped(item, Math.max(20, Math.floor((detailW - 56) / 9))).split("\\n").map((part, index) => \`\${index === 0 ? "• " : "  "}\${part}\`));
  text(detailX + 28, contentTop + 66, detailLines.join("\\n"), { size: 15, color: "#334155", width: detailW - 56 });
  filledRect(detailX + 28, contentTop + h * 0.43, detailW - 56, h * 0.28, "neutral", { fill: "#f8fafc", strokeWidth: 1 });
  text(detailX + 46, contentTop + h * 0.43 + 18, options.composer ?? "Write a reply…", { size: 14, color: "#64748b", width: detailW - 92 });
  const actions = (options.actions ?? ["Save", "Send"]).slice(0, 4);
  const buttonW = Math.min(130, (detailW - 70) / Math.max(1, actions.length));
  actions.forEach((action, index) => {
    const bx = detailX + detailW - 28 - (actions.length - index) * (buttonW + 10);
    filledRect(bx, contentTop + h - 112, buttonW, 42, index === actions.length - 1 ? "accent" : "neutral", { strokeWidth: 1 });
    text(bx, contentTop + h - 102, action, { size: 14, color: index === actions.length - 1 ? "#1d4ed8" : "#334155", width: buttonW, align: "center" });
  });
  register(id, "ui_window", bounds, scene.elements.slice(elementStart));
}

function classScores(id, input, scores, options = {}) {
  const elementStart = scene.elements.length;
  if (!Array.isArray(scores) || scores.length !== 3) throw new Error("classScores requires exactly three classes");
  const x = options.x ?? 100;
  const y = options.y ?? 180;
  const w = options.w ?? 1400;
  const h = options.h ?? 570;
  const bounds = boundedRect(x, y, w, h, \`classScores \${id}\`);
  filledRect(x, y, w, h, "neutral", { fill: "#ffffff" });
  text(x + 24, y + 18, wrapped(options.title ?? "Prediction at a glance", Math.max(20, Math.floor((w - 48) / 12))), { size: 22, width: w - 48, align: "center" });
  const inputW = Math.min(300, w * 0.23);
  filledRect(x + 36, y + 105, inputW, 170, "neutral");
  text(x + 54, y + 126, "INPUT", { size: 13, color: "#64748b", width: inputW - 36 });
  text(x + 54, y + 165, wrapped(input, Math.floor((inputW - 36) / 10)), { size: 18, width: inputW - 36 });
  const scoreX = x + inputW + 120;
  const scoreW = w - inputW - 190;
  scores.forEach((score, index) => {
    const sy = y + 96 + index * 104;
    const value = Number(score.value);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Class score values must be between 0 and 1");
    const tone = score.tone ?? ["accent", "success", "purple"][index];
    text(scoreX, sy, score.label, { size: 17, color: style(tone).text, width: 190 });
    filledRect(scoreX + 200, sy, scoreW - 290, 34, "neutral", { fill: "#e2e8f0", strokeWidth: 1, roundness: false });
    filledRect(scoreX + 200, sy, Math.max(8, (scoreW - 290) * value), 34, tone, { strokeWidth: 1, roundness: false });
    text(scoreX + scoreW - 72, sy + 5, \`\${Math.round(value * 100)}%\`, { size: 15, color: "#334155", width: 70, align: "right" });
  });
  arrow([[x + 36 + inputW, y + 190], [scoreX - 20, y + 190]], { color: "#2563eb", strokeWidth: 3 });
  const winner = options.winner ?? scores.reduce((best, item) => item.value > best.value ? item : best, scores[0]).label;
  filledRect(x + w * 0.29, y + h - 118, w * 0.42, 76, options.uncertain ? "warning" : "success");
  text(x + w * 0.29 + 18, y + h - 98, options.uncertain ? \`Review: \${winner}\` : \`Winner: \${winner}\`, { size: 20, color: options.uncertain ? "#78350f" : "#14532d", width: w * 0.42 - 36, align: "center" });
  text(x + 28, y + h - 28, wrapped(options.caption ?? "Three mutually exclusive classes; uncertainty is a decision state, not a fourth class.", Math.max(30, Math.floor((w - 56) / 8))), { size: 13, color: "#64748b", width: w - 56, align: "center" });
  register(id, "class_scores", bounds, scene.elements.slice(elementStart));
}

function stepStrip(id, steps, options = {}) {
  const elementStart = scene.elements.length;
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 7) throw new Error("stepStrip needs 2-7 steps");
  const x = options.x ?? 80;
  const y = options.y ?? 720;
  const w = options.w ?? 1440;
  const h = options.h ?? 190;
  const bounds = boundedRect(x, y, w, h, \`stepStrip \${id}\`);
  if (options.label) text(x, y, options.label, { size: 20, width: w });
  const top = y + (options.label ? 42 : 8);
  const gap = 34;
  const boxW = (w - gap * (steps.length - 1)) / steps.length;
  steps.forEach((step, index) => {
    const bx = x + index * (boxW + gap);
    filledRect(bx, top, boxW, h - (options.label ? 50 : 16), step.tone ?? (index === steps.length - 1 ? "success" : "neutral"));
    text(bx + 10, top + 12, \`\${index + 1}. \${wrapped(step.title ?? step, Math.max(10, Math.floor((boxW - 20) / 10)))}\`, { size: 16, width: boxW - 20, align: "center" });
    if (step.caption) text(bx + 10, top + 58, wrapped(step.caption, Math.max(12, Math.floor((boxW - 20) / 9))), { size: 12, color: "#64748b", width: boxW - 20, align: "center" });
    if (index < steps.length - 1) arrow([[bx + boxW + 5, top + (h - 50) / 2], [bx + boxW + gap - 5, top + (h - 50) / 2]], { color: "#64748b", strokeWidth: 2 });
  });
  register(id, "step_strip", bounds, scene.elements.slice(elementStart));
}

function link(id, fromId, toId, label = "", options = {}) {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(\`Link id must be snake_case: \${id}\`);
  if (links.some((item) => item.id === id)) throw new Error(\`Duplicate link id: \${id}\`);
  const from = objects.get(fromId);
  const to = objects.get(toId);
  if (!from || !to) throw new Error(\`Unknown link endpoint: \${fromId} -> \${toId}\`);
  const horizontal = Math.abs(from.bounds.centerX - to.bounds.centerX) >= Math.abs(from.bounds.centerY - to.bounds.centerY);
  let points;
  if (horizontal) {
    const leftToRight = from.bounds.centerX < to.bounds.centerX;
    const start = [leftToRight ? from.bounds.right : from.bounds.left, from.bounds.centerY];
    const end = [leftToRight ? to.bounds.left : to.bounds.right, to.bounds.centerY];
    const midX = (start[0] + end[0]) / 2;
    points = [start, [midX, start[1]], [midX, end[1]], end];
  } else {
    const topToBottom = from.bounds.centerY < to.bounds.centerY;
    const start = [from.bounds.centerX, topToBottom ? from.bounds.bottom : from.bounds.top];
    const end = [to.bounds.centerX, topToBottom ? to.bounds.top : to.bounds.bottom];
    const midY = (start[1] + end[1]) / 2;
    points = [start, [start[0], midY], [end[0], midY], end];
  }
  arrow(points, { color: style(options.tone ?? "accent").stroke, strokeWidth: 2, dashed: options.dashed ?? false });
  let labelBounds = null;
  if (label) {
    const mid = points[Math.floor(points.length / 2)];
    const measured = measureText(label, { size: 13 });
    labelBounds = boundedRect(mid[0] - measured.width / 2 - 5, mid[1] - 12, measured.width + 10, 24, \`link \${id} label\`);
    const labelBox = filledRect(labelBounds.x, labelBounds.y, labelBounds.width, labelBounds.height, "neutral", { fill: "#ffffff", strokeWidth: 1 });
    labelBox.roundness = { type: 3 };
    text(mid[0] - measured.width / 2, mid[1] - 9, label, { size: 13, color: "#475569", width: measured.width, align: "center" });
  }
  links.push({ id, from: fromId, to: toId, label, points, labelBounds });
}

(() => {
${source}
})();

assert.ok(objects.size > 0, "Visual source must create at least one object");
const objectList = [...objects.values()];
const overlapPairs = [];
for (let leftIndex = 0; leftIndex < objectList.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < objectList.length; rightIndex += 1) {
    const left = objectList[leftIndex];
    const right = objectList[rightIndex];
    if (boundsOverlap(left.bounds, right.bounds)) overlapPairs.push(\`\${left.id} overlaps \${right.id}\`);
  }
}
assert.deepEqual(overlapPairs, [], "Top-level visual objects must not overlap");
const linkCrossings = [];
const linkLabelOverlaps = [];
for (const item of links) {
  for (const object of objectList) {
    if (object.id === item.from || object.id === item.to) continue;
    if (polylineIntersectsBounds(item.points, object.bounds)) {
      linkCrossings.push(\`\${item.id} crosses \${object.id}\`);
    }
    if (item.labelBounds && boundsOverlap(item.labelBounds, object.bounds)) {
      linkLabelOverlaps.push(\`\${item.id} label overlaps \${object.id}\`);
    }
  }
}
assert.deepEqual(linkCrossings, [], "Visual links must not cross unrelated objects");
assert.deepEqual(linkLabelOverlaps, [], "Visual link labels must not overlap unrelated objects");
const sceneBounds = boundsFor(scene.elements);
assert.ok(sceneBounds.left >= -20 && sceneBounds.top >= 0, "Scene escaped the top/left render margin");
assert.ok(sceneBounds.right <= CANVAS.width && sceneBounds.bottom <= CANVAS.height, "Scene escaped the fixed render canvas");

mkdirSync(dirname(EXCALIDRAW_PATH), { recursive: true });
scene.write(EXCALIDRAW_PATH);
const data = JSON.parse(readFileSync(EXCALIDRAW_PATH, "utf8"));
assert.equal(data.type, "excalidraw");
assert.ok(data.elements.length > 0);

const kinds = {};
for (const item of objects.values()) kinds[item.kind] = (kinds[item.kind] ?? 0) + 1;
writeFileSync(SUMMARY_PATH, JSON.stringify({
  scenario: ${JSON.stringify(meta.slug)},
  contract: "visual",
  excalidrawPath: EXCALIDRAW_PATH,
  elements: data.elements.length,
  files: Object.keys(data.files ?? {}).length,
  objects: objects.size,
  links: links.length,
  kinds,
  canvas: CANVAS,
  sceneBounds,
  quality: { overlapPairs, linkCrossings, linkLabelOverlaps },
  header: { title: boundsFor([diagramTitle]), thesis: boundsFor([diagramThesis]) },
  validation: { ok: true, errors: [], warnings: [] },
}, null, 2));
`;
}
