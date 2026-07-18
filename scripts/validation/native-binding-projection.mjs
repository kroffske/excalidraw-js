#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const toleranceArg = args.find((arg) => arg.startsWith("--tolerance="));
const files = args.filter((arg) => !arg.startsWith("--"));
const [sceneArg, referenceArg] = files;
const tolerance = Number(toleranceArg?.slice("--tolerance=".length) ?? 1e-6);

if (!sceneArg || !Number.isFinite(tolerance) || tolerance < 0) {
  console.error(
    "Usage: node scripts/validation/native-binding-projection.mjs SCENE.excalidraw "
    + "[REFERENCE.excalidraw] [--tolerance=0.000001]",
  );
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { assertNativeBindings } = await import(resolve(root, "dist/index.js"));

const inspect = (path) => {
  const bytes = readFileSync(resolve(path));
  const scene = JSON.parse(bytes.toString("utf8"));
  assertNativeBindings(scene.elements);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    projection: project(scene.elements),
  };
};

const project = (elements) => {
  const active = elements.filter((element) => element?.isDeleted !== true);
  const arrows = active
    .filter((element) => element?.type === "arrow" && (element.startBinding || element.endBinding))
    .map((element) => ({
      id: element.id,
      startBinding: bindingProjection(element.startBinding),
      endBinding: bindingProjection(element.endBinding),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const targets = active
    .map((element) => ({
      id: element?.id,
      arrowIds: (Array.isArray(element?.boundElements) ? element.boundElements : [])
        .filter((entry) => entry?.type === "arrow")
        .map((entry) => entry.id)
        .sort(),
    }))
    .filter((entry) => entry.arrowIds.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  return { arrows, targets };
};

const bindingProjection = (binding) => binding === null || binding === undefined
  ? null
  : {
    elementId: binding.elementId,
    fixedPoint: [...binding.fixedPoint],
    mode: binding.mode,
  };

const compare = (actual, expected) => {
  const issues = [];
  if (actual.arrows.length !== expected.arrows.length) {
    issues.push(`arrow count ${actual.arrows.length} != ${expected.arrows.length}`);
  }
  if (actual.targets.length !== expected.targets.length) {
    issues.push(`target count ${actual.targets.length} != ${expected.targets.length}`);
  }

  const expectedArrows = new Map(expected.arrows.map((arrow) => [arrow.id, arrow]));
  for (const arrow of actual.arrows) {
    const reference = expectedArrows.get(arrow.id);
    if (!reference) {
      issues.push(`unexpected arrow '${arrow.id}'`);
      continue;
    }
    compareBinding(arrow.id, "startBinding", arrow.startBinding, reference.startBinding, issues);
    compareBinding(arrow.id, "endBinding", arrow.endBinding, reference.endBinding, issues);
  }

  const expectedTargets = new Map(expected.targets.map((target) => [target.id, target.arrowIds]));
  for (const target of actual.targets) {
    const reference = expectedTargets.get(target.id);
    if (!reference || JSON.stringify(target.arrowIds) !== JSON.stringify(reference)) {
      issues.push(`target '${target.id}' reciprocal arrows changed`);
    }
  }
  return issues;
};

const compareBinding = (arrowId, field, actual, expected, issues) => {
  if (actual === null || expected === null) {
    if (actual !== expected) {
      issues.push(`arrow '${arrowId}' ${field} presence changed`);
    }
    return;
  }
  if (actual.elementId !== expected.elementId || actual.mode !== expected.mode) {
    issues.push(`arrow '${arrowId}' ${field} target or mode changed`);
  }
  for (let index = 0; index < 2; index += 1) {
    if (Math.abs(actual.fixedPoint[index] - expected.fixedPoint[index]) > tolerance) {
      issues.push(`arrow '${arrowId}' ${field}.fixedPoint[${index}] changed`);
    }
  }
};

const actual = inspect(sceneArg);
const output = { scene: resolve(sceneArg), tolerance, ...actual };
if (referenceArg) {
  const reference = inspect(referenceArg);
  const issues = compare(actual.projection, reference.projection);
  Object.assign(output, {
    reference: resolve(referenceArg),
    referenceSha256: reference.sha256,
    projectionMatches: issues.length === 0,
    issues,
  });
  if (issues.length > 0) {
    process.exitCode = 1;
  }
}
console.log(JSON.stringify(output, null, 2));
