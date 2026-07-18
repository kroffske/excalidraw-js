import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateNativeBindings } from "../src/index.js";

const fixtureRoot = join(import.meta.dirname, "fixtures", "native-bindings", "v1");

const readFixture = (name: string): {
  bytes: Buffer;
  scene: { elements: Array<Record<string, unknown>> };
} => {
  const bytes = readFileSync(join(fixtureRoot, name));
  return { bytes, scene: JSON.parse(bytes.toString("utf8")) };
};

describe("native binding visual proof fixtures", () => {
  it("keeps frozen hashes and structurally valid scenes", () => {
    const manifest = JSON.parse(readFileSync(join(fixtureRoot, "manifest.json"), "utf8"));
    for (const name of ["bound", "unbound"]) {
      const fixture = readFixture(`${name}.excalidraw`);
      expect(createHash("sha256").update(fixture.bytes).digest("hex")).toBe(manifest.hashes[name]);
      expect(validateNativeBindings(fixture.scene.elements)).toEqual({ valid: true, issues: [] });
    }
  });

  it("limits the visual pair delta to native binding metadata", () => {
    const bound = readFixture("bound.excalidraw").scene;
    const unbound = readFixture("unbound.excalidraw").scene;
    const normalized = structuredClone(bound);

    for (const element of normalized.elements) {
      if (element.type === "arrow") {
        element.startBinding = null;
        element.endBinding = null;
      }
      if (Array.isArray(element.boundElements)) {
        element.boundElements = element.boundElements.filter(
          (entry) => (
            typeof entry !== "object"
            || entry === null
            || (entry as Record<string, unknown>).type !== "arrow"
          ),
        );
      }
    }

    expect(normalized).toEqual(unbound);
  });
});
