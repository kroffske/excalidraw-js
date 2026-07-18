import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { platform, release } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { Scene } from "../../src/core.js";
import {
  RENDERER_VERSION,
  defaultCacheDir,
  renderMain,
  rendererBrowserReady,
  rendererReady,
} from "../../src/render.js";
import type { MeasuredFixture, PlanGraphResult, Rect } from "./model.js";

const GROUP_COLOR = "#475569";
const NODE_COLOR = "#0b1fb3";
const SUPPORT_COLOR = "#64748b";
const FEEDBACK_COLOR = "#8b5cf6";

export interface PngIdentity {
  sha256: string;
  width: number;
  height: number;
  bytes: number;
}

export function writeResultScene(
  measured: MeasuredFixture,
  result: PlanGraphResult,
  path: string,
): void {
  const { fixture } = measured;
  const scene = new Scene({ seed: 20260718, background: "#ffffff" });
  scene.text(40, 24, `${fixture.title} — arm ${result.arm}`, {
    size: 28,
    color: "#0f172a",
  });
  addResult(scene, measured, result, 40, 88);
  stabilizeScene(scene);
  scene.write(path);
}

export function writeComparisonScene(
  measured: MeasuredFixture,
  armA: PlanGraphResult,
  armB: PlanGraphResult,
  path: string,
): void {
  const { fixture } = measured;
  const scene = new Scene({ seed: 20260718, background: "#ffffff" });
  const commonWidth = Math.max(resultWidth(armA), resultWidth(armB));
  scene.text(40, 24, `${fixture.title} — equal-scale A/B`, {
    size: 28,
    color: "#0f172a",
  });
  scene.text(40, 64, "A — current compact placement", {
    size: 18,
    color: "#0f172a",
  });
  scene.text(80 + commonWidth, 64, "B — bounded grouped layered candidate", {
    size: 18,
    color: "#0f172a",
  });
  addResult(scene, measured, armA, 40, 104);
  addResult(scene, measured, armB, 80 + commonWidth, 104);
  stabilizeScene(scene);
  scene.write(path);
}

export function renderPng(scenePath: string, pngPath: string): PngIdentity {
  const rendererDir = defaultCacheDir();
  if (!rendererReady(rendererDir) || !rendererBrowserReady(rendererDir)) {
    throw new Error(
      "PNG renderer unavailable; run `npm run render:setup` before the experiment",
    );
  }
  const status = renderMain([
    scenePath,
    pngPath,
    "--scale",
    "2",
    "--background",
    "#ffffff",
    "--browser-log",
  ]);
  if (status !== 0 || !existsSync(pngPath)) {
    throw new Error(`PNG_RENDER_FAILED:${scenePath}`);
  }
  return readPngIdentity(pngPath);
}

export function readPngIdentity(path: string): PngIdentity {
  const bytes = readFileSync(path);
  if (
    bytes.length < 24 ||
    bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a"
  ) {
    throw new Error(`INVALID_PNG:${path}`);
  }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
  };
}

export function rendererIdentity(): Record<string, string> {
  const rendererDir = defaultCacheDir();
  if (!rendererReady(rendererDir) || !rendererBrowserReady(rendererDir)) {
    throw new Error("PNG renderer unavailable; run `npm run render:setup`");
  }
  const requireFromRenderer = createRequire(join(rendererDir, "package.json"));
  const playwright = requireFromRenderer("playwright/package.json") as {
    version: string;
  };
  const chromium = requireFromRenderer("playwright").chromium as {
    executablePath(): string;
  };
  const browserPath = chromium.executablePath();
  return {
    rendererVersion: RENDERER_VERSION,
    playwrightVersion: playwright.version,
    browser: execFileSync(browserPath, ["--version"], {
      encoding: "utf8",
    }).trim(),
    font: "Excalifont:renderer-bundle",
    os: `${platform()} ${release()}`,
  };
}

function stabilizeScene(scene: Scene): void {
  for (const element of scene.elements) {
    element.updated = 0;
  }
}

function addResult(
  scene: Scene,
  measured: MeasuredFixture,
  result: PlanGraphResult,
  dx: number,
  dy: number,
): void {
  for (const group of measured.fixture.groups) {
    const frame = translated(result.groupBounds[group.id], dx, dy);
    scene.rect(frame.x, frame.y, frame.width, frame.height, {
      color: GROUP_COLOR,
      strokeWidth: 1,
      dashed: true,
    });
    scene.text(frame.x + 18, frame.y + 14, group.label, {
      size: 17,
      color: GROUP_COLOR,
      width: frame.width - 36,
    });
  }
  for (const edge of measured.fixture.edges) {
    scene.arrow(
      result.routes[edge.id].map(([x, y]) => [x + dx, y + dy]),
      {
        color:
          edge.kind === "feedback"
            ? FEEDBACK_COLOR
            : edge.kind === "support"
              ? SUPPORT_COLOR
              : NODE_COLOR,
        strokeWidth: edge.kind === "primary" ? 2 : 1.5,
        dashed: edge.kind !== "primary",
        roundness: null,
      },
    );
  }
  for (const node of measured.fixture.nodes) {
    const frame = translated(result.nodeBounds[node.id], dx, dy);
    const fitted = measured.nodes[node.id];
    scene.rect(frame.x, frame.y, frame.width, frame.height, {
      color: NODE_COLOR,
      strokeWidth: 2,
    });
    scene.text(
      frame.x + fitted.titleX,
      frame.y + fitted.titleY,
      fitted.titleText,
      {
        size: fitted.titleSize,
        color: NODE_COLOR,
        width: fitted.titleWidth,
        lineHeight: fitted.titleLineHeight,
      },
    );
  }
}

function resultWidth(result: PlanGraphResult): number {
  return Math.max(
    ...Object.values(result.groupBounds).map((rect) => rect.x + rect.width),
    ...Object.values(result.nodeBounds).map((rect) => rect.x + rect.width),
  );
}

function translated(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}
