import { vi } from "vitest";

const forced = vi.hoisted(() => ({
  geometry: false,
  bindings: false,
}));

vi.mock("../src/validate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/validate.js")>();
  return {
    ...original,
    validateDiagram: vi.fn((input: Parameters<typeof original.validateDiagram>[0]) => {
      if (!forced.geometry) {
        return original.validateDiagram(input);
      }
      const issue = {
        code: "arrow-through-block" as const,
        severity: "error" as const,
        message: "forced swimlane geometry failure",
        ids: ["review", "approve"],
      };
      return {
        ok: false,
        issues: [issue],
        errors: [issue],
        warnings: [],
      };
    }),
  };
});

vi.mock("../src/bindings.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/bindings.js")>();
  return {
    ...original,
    validateNativeBindings: vi.fn((elements: readonly unknown[]) => {
      if (!forced.bindings) {
        return original.validateNativeBindings(elements);
      }
      const raw = elements as Array<Record<string, unknown>>;
      const arrows = raw.filter((element) => element.type === "arrow");
      const sharedTarget = raw.find(
        (element) =>
          element.type === "rectangle"
          && Array.isArray(element.boundElements)
          && element.boundElements.length > 1,
      );
      return {
        valid: false,
        issues: [
          {
            code: "malformed-binding" as const,
            message: "forced arrow issue",
            elementId: String(arrows[1]?.id),
            field: "endBinding",
          },
          {
            code: "stale-arrow-reciprocal" as const,
            message: "forced reciprocal issue",
            elementId: String(sharedTarget?.id),
            field: "boundElements",
            targetId: String(arrows[1]?.id),
          },
          {
            code: "malformed-bound-elements" as const,
            message: "forced shared endpoint issue",
            elementId: String(sharedTarget?.id),
            field: "boundElements",
          },
          {
            code: "malformed-binding" as const,
            message: "forced root issue",
            field: "elements",
          },
        ],
      };
    }),
  };
});

import {
  SwimlaneFlowSpec,
  buildDiagramSpec,
} from "../src/index.js";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  forced.geometry = false;
  forced.bindings = false;
  vi.clearAllMocks();
});

function spec(): SwimlaneFlowSpec {
  return {
    template: "flow.swimlane",
    title: "Failure mapping",
    lanes: [
      { id: "product", label: "Product" },
      { id: "engineering", label: "Engineering" },
    ],
    activities: [
      { id: "request", lane: "product", type: "step", title: "Request" },
      { id: "approve", lane: "engineering", type: "decision", title: "Approve" },
      { id: "report", lane: "product", type: "artifact", title: "Report" },
    ],
    transitions: [
      { id: "review", from: "request", to: "approve" },
      { id: "publish", from: "approve", to: "report" },
    ],
  };
}

describe("flow.swimlane fail-closed checks", () => {
  it("maps a forced geometry failure to its transition and exposes no scene", () => {
    forced.geometry = true;

    const result = buildDiagramSpec(spec(), { seed: 5 });

    expect(result.ok).toBe(false);
    expect("scene" in result).toBe(false);
    expect(result.geometry?.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "GEOMETRY_ERROR",
        path: "$.transitions[0]",
        severity: "error",
      }),
    ]);
  });

  it("preserves binding-validator order and maps arrow, reciprocal, shared endpoint, and root issues", () => {
    forced.bindings = true;

    const result = buildDiagramSpec(spec(), { seed: 6 });

    expect(result.ok).toBe(false);
    expect("scene" in result).toBe(false);
    expect(result.geometry?.ok).toBe(true);
    expect(result.diagnostics.map(({ code, path, message }) => ({
      code,
      path,
      message,
    }))).toEqual([
      {
        code: "NATIVE_BINDING_ERROR",
        path: "$.transitions[1]",
        message: "[malformed-binding] forced arrow issue",
      },
      {
        code: "NATIVE_BINDING_ERROR",
        path: "$.transitions[1]",
        message: "[stale-arrow-reciprocal] forced reciprocal issue",
      },
      {
        code: "NATIVE_BINDING_ERROR",
        path: "$.transitions[0]",
        message: "[malformed-bound-elements] forced shared endpoint issue",
      },
      {
        code: "NATIVE_BINDING_ERROR",
        path: "$",
        message: "[malformed-binding] forced root issue",
      },
    ]);
  });
});
