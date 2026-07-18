#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = resolve(root, "tests/fixtures/native-bindings/v1");
const {
  Scene,
  assertNativeBindings,
  layout,
  nodeCard,
} = await import(resolve(root, "dist/index.js"));
const frozenNow = 1_752_841_800_000;
const originalDateNow = Date.now;

const buildScene = (bindings) => {
  const scene = new Scene({ seed: 127 });
  const source = nodeCard(scene, {
    id: "source",
    title: "Source agent",
    bullets: ["Plans the change", "Publishes evidence"],
    x: 80,
    y: 120,
    width: 280,
  });
  const target = nodeCard(scene, {
    id: "target",
    title: "Target agent",
    bullets: ["Reviews the plan", "Returns a verdict"],
    x: 560,
    y: 120,
    width: 280,
  });
  layout.connectRouted(scene, source.block, target.block, {
    bindings,
    direction: "left-to-right",
    from: "right",
    to: "left",
    path: "straight",
    label: "hands off",
  });
  return scene.toObject();
};

try {
  Date.now = () => frozenNow;
  const unbound = buildScene(false);
  const bound = buildScene(true);
  assertNativeBindings(unbound.elements);
  assertNativeBindings(bound.elements);

  mkdirSync(outputDir, { recursive: true });
  const fixtures = { bound, unbound };
  const hashes = {};
  for (const [name, scene] of Object.entries(fixtures)) {
    const json = `${JSON.stringify(scene, null, 2)}\n`;
    writeFileSync(resolve(outputDir, `${name}.excalidraw`), json, "utf8");
    hashes[name] = createHash("sha256").update(json).digest("hex");
  }

  writeFileSync(
    resolve(outputDir, "manifest.json"),
    `${JSON.stringify({
      schema: "native-binding-fixtures.v1",
      frozenNow,
      seed: 127,
      hashes,
      allowedElementDelta: [
        "arrow.startBinding",
        "arrow.endBinding",
        "source.boundElements[type=arrow]",
        "target.boundElements[type=arrow]",
      ],
    }, null, 2)}\n`,
    "utf8",
  );
} finally {
  Date.now = originalDateNow;
}
