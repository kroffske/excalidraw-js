import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { AssetRegistry } from "./assets.js";
import { Scene } from "./core.js";
import * as layout from "./layout.js";

export interface TreeSpecDocument {
  title?: string;
  subtitle?: string;
  seed?: number;
  assetPack?: "core" | "trading";
  asset_pack?: "core" | "trading";
  root: layout.TreeNodeSpec;
  secondaryEdges?: layout.SecondaryEdgeSpec[];
  secondary_edges?: layout.SecondaryEdgeSpec[];
  sidecars?: layout.SidecarSpec[];
  options?: layout.TreeLayoutOptions;
}

export interface TreeSpecResult {
  excalidrawPath: string;
  elements: number;
  files: number;
}

export function readTreeSpec(path: string): TreeSpecDocument {
  return JSON.parse(readFileSync(path, "utf8")) as TreeSpecDocument;
}

export function writeTreeSpecDiagram(spec: TreeSpecDocument, excalidrawPath: string): TreeSpecResult {
  validateTreeSpec(spec);
  mkdirSync(dirname(excalidrawPath), { recursive: true });

  const pack = spec.assetPack ?? spec.asset_pack ?? "core";
  const scene = new Scene({
    seed: spec.seed ?? 20260602,
    assetRegistry: AssetRegistry.bundled(pack === "trading" ? "trading" : undefined),
  });

  const options = spec.options ?? {};
  const titleOffset = spec.title || spec.subtitle ? 130 : 0;
  const x = options.x ?? 80;
  const y = Math.max(options.y ?? titleOffset, titleOffset);
  if (spec.title) {
    scene.text(40, 24, spec.title, { size: 30, width: 1120, align: "center" });
  }
  if (spec.subtitle) {
    scene.text(40, 64, spec.subtitle, { size: 16, color: "#475569", width: 1120, align: "center" });
  }

  layout.tree(scene, {
    root: spec.root,
    secondaryEdges: spec.secondaryEdges ?? spec.secondary_edges ?? [],
    sidecars: spec.sidecars ?? [],
  }, {
    ...options,
    x,
    y,
  });

  scene.write(excalidrawPath);
  const data = JSON.parse(readFileSync(excalidrawPath, "utf8")) as {
    type?: string;
    elements?: unknown[];
    files?: Record<string, unknown>;
  };
  if (data.type !== "excalidraw" || !data.elements?.length) {
    throw new Error(`Invalid tree spec diagram: ${excalidrawPath}`);
  }
  return {
    excalidrawPath,
    elements: data.elements.length,
    files: Object.keys(data.files ?? {}).length,
  };
}

function validateTreeSpec(spec: TreeSpecDocument): void {
  if (!spec.root?.id || !spec.root.title) {
    throw new Error("Tree spec requires root.id and root.title");
  }
  validateTreeNode(spec.root);
}

function validateTreeNode(node: layout.TreeNodeSpec): void {
  const iconId = node.iconId ?? node.icon_id;
  if (!iconId) {
    throw new Error(`Tree node '${node.id}' requires iconId`);
  }
  for (const child of node.children ?? []) {
    validateTreeNode(child);
  }
}
