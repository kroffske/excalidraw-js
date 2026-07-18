import { describe, expect, it } from "vitest";
import {
  NativeBindingValidationError,
  assertNativeBindings,
  validateNativeBindings,
} from "../src/index.js";
import type {
  NativeBindingIssueCode,
  NativeBindingMode,
  NativeBoundElement,
  NativeFixedPointBinding,
} from "../src/index.js";

type RawElement = Record<string, unknown>;

const TARGET_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "text",
  "image",
  "iframe",
  "embeddable",
  "frame",
  "magicframe",
] as const;

const MODES: NativeBindingMode[] = ["inside", "orbit", "skip"];

function binding(
  elementId: string,
  mode: NativeBindingMode = "inside",
  fixedPoint: [number, number] = [0.25, 0.75],
): NativeFixedPointBinding {
  return { elementId, mode, fixedPoint };
}

function target(
  id: string,
  type: string = "rectangle",
  boundElements: NativeBoundElement[] | null = [],
  overrides: RawElement = {},
): RawElement {
  return {
    id,
    type,
    angle: 0,
    isDeleted: false,
    boundElements,
    ...overrides,
  };
}

function arrow(
  id: string,
  startBinding: NativeFixedPointBinding | null = null,
  endBinding: NativeFixedPointBinding | null = null,
  overrides: RawElement = {},
): RawElement {
  return {
    id,
    type: "arrow",
    angle: 0,
    isDeleted: false,
    boundElements: [],
    startBinding,
    endBinding,
    ...overrides,
  };
}

function issueCodes(elements: readonly unknown[]): NativeBindingIssueCode[] {
  return validateNativeBindings(elements).issues.map((issue) => issue.code);
}

describe("native binding validator", () => {
  it("accepts unbound scenes, nullable boundElements, and unrelated text entries", () => {
    const elements = [
      target("plain", "rectangle", null),
      target("text-owner", "rectangle", [{ id: "missing-text-is-outside-arrow-validation", type: "text" }]),
      { id: "line", type: "line", angle: 0, isDeleted: false },
      arrow("unbound"),
    ];

    expect(validateNativeBindings(elements)).toEqual({ valid: true, issues: [] });
    expect(() => assertNativeBindings(elements)).not.toThrow();
  });

  it("accepts every current target type and binding mode", () => {
    const elements: RawElement[] = [];

    for (const [targetIndex, type] of TARGET_TYPES.entries()) {
      for (const [modeIndex, mode] of MODES.entries()) {
        const targetId = `${type}-${mode}`;
        const arrowId = `arrow-${targetIndex}-${modeIndex}`;
        elements.push(target(targetId, type, [{ id: arrowId, type: "arrow" }], {
          angle: targetIndex + modeIndex / 10,
          ...(type === "text" ? { containerId: null } : {}),
        }));
        elements.push(arrow(arrowId, binding(targetId, mode)));
      }
    }

    expect(validateNativeBindings(elements)).toEqual({ valid: true, issues: [] });
  });

  it("accepts normalized finite fixed points across the full [-10, 10] range", () => {
    const elements = [
      target("left", "rectangle", [{ id: "wide-arrow", type: "arrow" }], { angle: -Math.PI / 3 }),
      target("right", "ellipse", [{ id: "wide-arrow", type: "arrow" }], { angle: Math.PI * 5 }),
      arrow(
        "wide-arrow",
        binding("left", "orbit", [-10, 1.25]),
        binding("right", "skip", [0.5001, 10]),
      ),
    ];

    expect(validateNativeBindings(elements)).toEqual({ valid: true, issues: [] });
  });

  it("deduplicates same-target endpoint expectations and supports multiple arrows per target", () => {
    const elements = [
      target("shared", "diamond", [
        { id: "same-target", type: "arrow" },
        { id: "second", type: "arrow" },
      ]),
      arrow("same-target", binding("shared"), binding("shared", "orbit")),
      arrow("second", null, binding("shared", "skip")),
    ];

    expect(validateNativeBindings(elements)).toEqual({ valid: true, issues: [] });
  });

  it("ignores deleted elements' own binding graphs but keeps tombstones in id uniqueness", () => {
    const ignoredDeletedGraph = [
      arrow("deleted-arrow", null, null, {
        isDeleted: true,
        startBinding: "not-a-binding",
        endBinding: { elementId: "missing", focus: 0, gap: 1 },
      }),
      target("deleted-target", "rectangle", [], {
        isDeleted: true,
        boundElements: "not-an-array",
      }),
    ];

    expect(validateNativeBindings(ignoredDeletedGraph)).toEqual({ valid: true, issues: [] });

    const duplicateWithTombstone = [
      target("same-id"),
      target("same-id", "rectangle", [], { isDeleted: true }),
    ];
    expect(issueCodes(duplicateWithTombstone)).toEqual(["duplicate-element-id"]);
  });

  it.each([
    {
      code: "duplicate-element-id",
      elements: [target("duplicate"), target("duplicate", "ellipse")],
    },
    {
      code: "malformed-binding",
      elements: [arrow("arrow", "bad" as unknown as NativeFixedPointBinding)],
    },
    {
      code: "legacy-binding",
      elements: [
        target("target", "rectangle", [{ id: "arrow", type: "arrow" }]),
        arrow("arrow", { ...binding("target"), focus: 0, gap: 5 } as NativeFixedPointBinding),
      ],
    },
    {
      code: "invalid-binding-mode",
      elements: [
        target("target", "rectangle", [{ id: "arrow", type: "arrow" }]),
        arrow("arrow", { ...binding("target"), mode: "outside" } as unknown as NativeFixedPointBinding),
      ],
    },
    {
      code: "invalid-fixed-point",
      elements: [
        target("target", "rectangle", [{ id: "arrow", type: "arrow" }]),
        arrow("arrow", { ...binding("target"), fixedPoint: [0.5, Number.NaN] } as NativeFixedPointBinding),
      ],
    },
    {
      code: "dangling-binding-target",
      elements: [arrow("arrow", binding("missing"))],
    },
    {
      code: "deleted-binding-target",
      elements: [
        target("target", "rectangle", [], { isDeleted: true }),
        arrow("arrow", binding("target")),
      ],
    },
    {
      code: "unsupported-binding-target",
      elements: [
        target("target", "line", [{ id: "arrow", type: "arrow" }]),
        arrow("arrow", binding("target")),
      ],
    },
    {
      code: "malformed-bound-elements",
      elements: [
        target("target", "rectangle", [] as NativeBoundElement[], { boundElements: {} }),
        arrow("arrow", binding("target")),
      ],
    },
    {
      code: "missing-arrow-reciprocal",
      elements: [
        target("target"),
        arrow("arrow", binding("target")),
      ],
    },
    {
      code: "duplicate-arrow-reciprocal",
      elements: [
        target("target", "rectangle", [
          { id: "arrow", type: "arrow" },
          { id: "arrow", type: "arrow" },
        ]),
        arrow("arrow", binding("target")),
      ],
    },
    {
      code: "dangling-arrow-reciprocal",
      elements: [
        target("target", "rectangle", [{ id: "missing", type: "arrow" }]),
      ],
    },
    {
      code: "non-arrow-reciprocal",
      elements: [
        target("target", "rectangle", [{ id: "not-arrow", type: "arrow" }]),
        target("not-arrow", "ellipse"),
      ],
    },
    {
      code: "stale-arrow-reciprocal",
      elements: [
        target("target", "rectangle", [{ id: "arrow", type: "arrow" }]),
        arrow("arrow"),
      ],
    },
  ] satisfies Array<{
    code: NativeBindingIssueCode;
    elements: RawElement[];
  }>)("reports $code", ({ code, elements }) => {
    expect(issueCodes(elements)).toContain(code);
  });

  it("rejects non-normalized midpoint, out-of-range, and non-finite fixed points", () => {
    const invalidPoints = [
      [0.5, 0.25],
      [0.49995, 0.25],
      [-10.00001, 0.25],
      [0.25, Number.POSITIVE_INFINITY],
    ];

    for (const [index, fixedPoint] of invalidPoints.entries()) {
      const targetId = `target-${index}`;
      const arrowId = `arrow-${index}`;
      const elements = [
        target(targetId, "rectangle", [{ id: arrowId, type: "arrow" }]),
        arrow(arrowId, binding(targetId, "inside", fixedPoint as [number, number])),
      ];
      expect(issueCodes(elements)).toContain("invalid-fixed-point");
    }
  });

  it("rejects bound text containers and targets with non-finite angles", () => {
    const boundTextElements = [
      target("text-target", "text", [{ id: "text-arrow", type: "arrow" }], { containerId: "container" }),
      arrow("text-arrow", binding("text-target")),
    ];
    const invalidAngleElements = [
      target("angle-target", "rectangle", [{ id: "angle-arrow", type: "arrow" }], { angle: Number.NaN }),
      arrow("angle-arrow", binding("angle-target")),
    ];

    expect(issueCodes(boundTextElements)).toContain("unsupported-binding-target");
    expect(issueCodes(invalidAngleElements)).toContain("unsupported-binding-target");
  });

  it("reports malformed reciprocal entries but otherwise ignores text reciprocals", () => {
    const malformed = [
      target("target", "rectangle", [
        { id: "", type: "text" },
        { id: "arrow", type: "line" },
      ] as unknown as NativeBoundElement[]),
    ];
    expect(issueCodes(malformed)).toEqual([
      "malformed-bound-elements",
      "malformed-bound-elements",
    ]);

    const textEntries = [
      target("target", "rectangle", [
        { id: "missing", type: "text" },
        { id: "arrow", type: "text" },
        { id: "arrow", type: "text" },
      ]),
      arrow("arrow"),
    ];
    expect(validateNativeBindings(textEntries)).toEqual({ valid: true, issues: [] });
  });

  it("treats an active target reciprocal to a deleted arrow as stale", () => {
    const elements = [
      target("target", "rectangle", [{ id: "arrow", type: "arrow" }]),
      arrow("arrow", binding("target"), null, { isDeleted: true }),
    ];

    expect(issueCodes(elements)).toEqual(["stale-arrow-reciprocal"]);
  });

  it("returns issues in deterministic order", () => {
    const elements = [
      target("target", "rectangle", [
        { id: "missing", type: "arrow" },
        { id: "not-arrow", type: "arrow" },
        { id: "stale", type: "arrow" },
      ]),
      target("not-arrow", "ellipse"),
      arrow("stale"),
      arrow("bound", binding("target")),
    ];

    const first = validateNativeBindings(elements);
    const second = validateNativeBindings(elements);

    expect(first).toEqual(second);
    expect(first.issues.map((issue) => issue.code)).toEqual([
      "missing-arrow-reciprocal",
      "dangling-arrow-reciprocal",
      "non-arrow-reciprocal",
      "stale-arrow-reciprocal",
    ]);
  });

  it("is total and non-throwing for malformed runtime input", () => {
    const throwingBinding = new Proxy({}, {
      get() {
        throw new Error("unreadable");
      },
    });

    expect(() => validateNativeBindings([arrow("arrow", throwingBinding as NativeFixedPointBinding)])).not.toThrow();
    expect(validateNativeBindings([arrow("arrow", throwingBinding as NativeFixedPointBinding)]).valid).toBe(false);
    expect(validateNativeBindings(null as unknown as readonly unknown[]).issues[0]?.field).toBe("elements");
    expect(validateNativeBindings([null, 42, "element"])).toEqual({ valid: true, issues: [] });
  });

  it("asserts once with the aggregate result", () => {
    const elements = [
      target("target"),
      arrow("arrow", {
        ...binding("target"),
        mode: "bad",
        fixedPoint: [11, 0.5],
      } as unknown as NativeFixedPointBinding),
    ];

    try {
      assertNativeBindings(elements);
      throw new Error("Expected assertion to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NativeBindingValidationError);
      const validationError = error as NativeBindingValidationError;
      expect(validationError.name).toBe("NativeBindingValidationError");
      expect(validationError.result.valid).toBe(false);
      expect(validationError.result.issues.map((issue) => issue.code)).toEqual([
        "invalid-binding-mode",
        "invalid-fixed-point",
        "missing-arrow-reciprocal",
      ]);
      expect(validationError.message).toContain("3 issues");
    }
  });
});
