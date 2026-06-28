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
  layout?: layout.TreeLayoutRequest;
  layout_family?: layout.TreeLayoutRequest;
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
  layout: layout.TreeLayoutFamily;
  layoutReason: string;
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
  const treeSpec = {
    root: spec.root,
    secondaryEdges: spec.secondaryEdges ?? spec.secondary_edges ?? [],
    sidecars: spec.sidecars ?? [],
  };
  const plan = layout.planTreeLayout(treeSpec, options, spec.layout ?? spec.layout_family ?? "auto");
  const titleOffset = spec.title || spec.subtitle ? 130 : 0;
  const x = plan.options.x ?? 80;
  const y = Math.max(plan.options.y ?? titleOffset, titleOffset);
  if (spec.title) {
    scene.text(40, 24, spec.title, { size: 30, width: plan.family === "process-flow" ? 1560 : 1120, align: "center" });
  }
  if (spec.subtitle) {
    scene.text(40, 64, spec.subtitle, {
      size: 16,
      color: "#475569",
      width: plan.family === "process-flow" ? 1560 : 1120,
      align: "center",
    });
  }

  const diagramOptions = {
    ...plan.options,
    x,
    y,
  };
  if (plan.family === "process-flow") {
    layout.processFlow(scene, treeSpec, diagramOptions);
  } else {
    layout.tree(scene, treeSpec, diagramOptions);
  }

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
    layout: plan.family,
    layoutReason: plan.reason,
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
