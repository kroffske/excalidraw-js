import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/validate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/validate.js")>();
  return {
    ...original,
    validateDiagram: vi.fn(() => {
      const issue = {
        code: "arrow-through-block" as const,
        severity: "error" as const,
        message: "forced geometry proof failure",
        ids: ["calls", "container-3"],
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

import { buildDiagramSpec } from "../src/index.js";

describe("c4.container geometry failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a hard geometry issue to its semantic path and exposes no scene", () => {
    const result = buildDiagramSpec({
      template: "c4.container",
      title: "Failure proof",
      system: {
        id: "system",
        name: "System",
        description: "System description.",
        containers: [
          {
            id: "container-1",
            name: "One",
            description: "First container.",
            technology: "TypeScript",
          },
          {
            id: "container-2",
            name: "Two",
            description: "Second container.",
            technology: "TypeScript",
          },
          {
            id: "container-3",
            name: "Three",
            description: "Third container.",
            technology: "TypeScript",
          },
        ],
      },
      relationships: [{
        id: "calls",
        from: "container-1",
        to: "container-2",
        description: "calls",
      }],
    });

    expect(result.ok).toBe(false);
    expect("scene" in result).toBe(false);
    expect(result.geometry?.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "GEOMETRY_ERROR",
        path: "$.relationships[0]",
        severity: "error",
      }),
    ]);
  });
});
