import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as publicApi from "../src/index.js";
import {
  buildDiagramSpec,
  validateDiagramSpec,
  validateNativeBindings,
} from "../src/index.js";
import type {
  DiagramSpec,
  SemanticDiagramSpec,
  SemanticPaletteName,
  SemanticStatus,
  SequenceInteractionSpec,
  SwimlaneFlowSpec,
} from "../src/index.js";
import { elementBounds } from "../src/geometry.js";
import type { Bounds, ElementLike } from "../src/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TemplateName = SemanticDiagramSpec["template"];
type LegacyCase = {
  normalizedBytes: number;
  normalizedSha256: string;
  sceneBytes: number;
  sceneSha256: string;
};
type LegacyHashes = {
  clock: number;
  seed: number;
  cases: Record<string, LegacyCase>;
};

const testRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testRoot, "fixtures");
const legacy = readJson<LegacyHashes>(
  join(fixtureRoot, "semantic-palettes", "v1", "legacy-hashes.json"),
);
const palettes: SemanticPaletteName[] = [
  "semantic-neutral",
  "change-diff",
  "high-contrast",
  "c4-blue",
];
const statuses: SemanticStatus[] = [
  "added",
  "changed",
  "removed",
  "risk",
];
const templates: TemplateName[] = [
  "c4.container",
  "sequence.interaction",
  "flow.swimlane",
];
const statusLabels: Record<SemanticStatus, string> = {
  added: "Added",
  changed: "Changed",
  removed: "Removed",
  risk: "Risk",
};
const paletteCases = palettes.flatMap((palette) =>
  templates.map((template) => ({ palette, template }))
);
const statusCases = statuses.flatMap((status) =>
  templates.map((template) => ({ status, template }))
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(legacy.clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("named semantic palette contract", () => {
  it.each(paletteCases)(
    "renders $palette for $template deterministically with healthy geometry",
    ({ palette, template }) => {
      const spec = specFor(template, palette, "added");
      const first = buildDiagramSpec(spec, { seed: legacy.seed });
      const second = buildDiagramSpec(
        structuredClone(spec),
        { seed: legacy.seed },
      );

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }
      expect(first.geometry).toEqual({
        ok: true,
        issues: [],
        errors: [],
        warnings: [],
      });
      expect(first.metadata).toMatchObject({ template, palette });
      expect(first.scene.toJson({ indent: 2 })).toBe(
        second.scene.toJson({ indent: 2 }),
      );
      expectExpectedBindings(first.scene.elements, template);
    },
  );

  it.each(templates)(
    "uses four distinct root title colors for $template",
    (template) => {
      const colors = palettes.map((palette) => {
        const result = buildDiagramSpec(specFor(template, palette, "added"));
        expect(result.ok).toBe(true);
        return result.ok
          ? String(result.scene.elements.find(
            (element) => element.type === "text",
          )?.strokeColor)
          : "";
      });

      expect(new Set(colors).size).toBe(palettes.length);
    },
  );

  it("keeps resolver functions and token records out of the root API", () => {
    expect(publicApi).not.toHaveProperty("resolveSemanticPalette");
    expect(publicApi).not.toHaveProperty("semanticStatusColor");
    expect(publicApi).not.toHaveProperty("PALETTES");
  });
});

describe("redundant status cues", () => {
  it.each(statusCases)(
    "renders $status on node and edge surfaces for $template",
    ({ status, template }) => {
      const result = buildDiagramSpec(
        specFor(template, "change-diff", status),
        { seed: legacy.seed },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.geometry.ok).toBe(true);
      const label = statusLabels[status];
      const expectedNodeText = template === "c4.container"
        ? `TypeScript · Status: ${label}`
        : template === "sequence.interaction"
          ? `Status: ${label}`
          : `ARTIFACT · Status: ${label}`;
      const expectedEdgeText = template === "c4.container"
        ? `calls · HTTPS · Status: ${label}`
        : template === "sequence.interaction"
          ? `1. request · Status: ${label}`
          : `Status: ${label}`;
      const texts = textElements(result.scene.elements);

      expect(texts.map((element) => element.text)).toContain(expectedNodeText);
      expect(texts.map((element) => element.text)).toContain(expectedEdgeText);
      expectBadgeTextFits(result.scene.elements, expectedNodeText);
      expectExpectedBindings(result.scene.elements, template);
      if (template === "flow.swimlane") {
        expect(validateNativeBindings(result.scene.elements).valid).toBe(true);
      }
    },
  );

  it("preserves labeled swimlane transition text before the status cue", () => {
    const spec = swimlaneSpec("c4-blue", "risk");
    spec.transitions[0].label = "request gate";

    const result = buildDiagramSpec(spec);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(textValues(result.scene.elements)).toContain(
        "request gate · Status: Risk",
      );
    }
  });

  it.each(templates)(
    "keeps maximum-length status text measured for $template",
    (template) => {
      const spec = specFor(template, "high-contrast", "changed");
      let expectedBadge: string;
      if (spec.template === "c4.container") {
        spec.system.containers[0].technology = "T".repeat(60);
        spec.relationships![0].description = "D".repeat(100);
        spec.relationships![0].technology = "T".repeat(60);
        expectedBadge = `${"T".repeat(60)} · Status: Changed`;
      } else if (spec.template === "sequence.interaction") {
        spec.participants[0].name = "N".repeat(60);
        spec.messages[0].label = "L".repeat(100);
        expectedBadge = "Status: Changed";
      } else {
        spec.activities[0].title = "X".repeat(80);
        spec.transitions[0].label = "L".repeat(48);
        expectedBadge = "ARTIFACT · Status: Changed";
      }

      const result = buildDiagramSpec(spec, { seed: legacy.seed });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.geometry.ok).toBe(true);
        expectBadgeTextFits(result.scene.elements, expectedBadge);
      }
    },
  );
});

describe("sequence call/return legend", () => {
  it("renders fixed ordered entries in a measured band for explicit mixed kinds", () => {
    const mixed = buildDiagramSpec(
      sequenceSpec("change-diff", "changed"),
      { seed: legacy.seed },
    );
    const callOnly = buildDiagramSpec(
      callOnlySequence("change-diff"),
      { seed: legacy.seed },
    );

    expect(mixed.ok).toBe(true);
    expect(callOnly.ok).toBe(true);
    if (!mixed.ok || !callOnly.ok) {
      return;
    }
    expect(mixed.scene.elements.slice(0, 6).map((element) => element.type))
      .toEqual(["text", "line", "text", "line", "text", "rectangle"]);
    expect(mixed.scene.elements[1]).toMatchObject({ strokeStyle: "solid" });
    expect(mixed.scene.elements[2]).toMatchObject({ text: "Call" });
    expect(mixed.scene.elements[3]).toMatchObject({ strokeStyle: "dashed" });
    expect(mixed.scene.elements[4]).toMatchObject({ text: "Return" });

    const title = elementBounds(mixed.scene.elements[0]);
    const callLabel = elementBounds(mixed.scene.elements[2]);
    const returnLabel = elementBounds(mixed.scene.elements[4]);
    const mixedHeader = elementBounds(mixed.scene.elements[5]);
    const callOnlyHeader = elementBounds(
      callOnly.scene.elements.find(
        (element) => element.type === "rectangle",
      )!,
    );
    expect(callLabel.top).toBeGreaterThan(title.bottom);
    expect(returnLabel.bottom).toBeLessThanOrEqual(mixedHeader.top);
    expect(mixedHeader.top - callOnlyHeader.top).toBe(
      Math.ceil(returnLabel.height + 16),
    );
  });

  it.each([
    ["palette omitted", sequenceSpec(undefined, "risk")],
    ["call only", callOnlySequence("change-diff")],
    ["return only", returnOnlySequence("change-diff")],
    ["status only", statusOnlySequence("change-diff")],
    ["C4", c4Spec("change-diff", "risk")],
    ["swimlane", swimlaneSpec("change-diff", "risk")],
  ])("suppresses legend and reserves no sequence band for %s", (_name, spec) => {
    const result = buildDiagramSpec(spec, { seed: legacy.seed });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(textValues(result.scene.elements)).not.toContain("Call");
    expect(textValues(result.scene.elements)).not.toContain("Return");
    if (spec.template === "sequence.interaction") {
      const firstHeader = result.scene.elements.find(
        (element) => element.type === "rectangle",
      );
      expect(firstHeader?.y).toBe(112);
    }
  });
});

describe("strict palette and status diagnostics", () => {
  it.each(templates)("rejects an unknown root palette at $.palette for $template", (
    template,
  ) => {
    const spec = specFor(template, "change-diff", "added") as unknown as {
      palette: string;
    };
    spec.palette = "brand-colors";
    expectDiagnostic(spec, "INVALID_STRING", "$.palette");
  });

  it.each(templates)(
    "rejects unknown node and edge status values at exact paths for $template",
    (template) => {
      const spec = specFor(template, "change-diff", "added") as unknown as {
        system?: { containers: Array<{ status: string }> };
        relationships?: Array<{ status: string }>;
        participants?: Array<{ status: string }>;
        messages?: Array<{ status: string }>;
        activities?: Array<{ status: string }>;
        transitions?: Array<{ status: string }>;
      };
      const [node, edge] = statusTargets(spec, template);
      node.target.status = "pending";
      expectDiagnostic(spec, "INVALID_STRING", node.path);

      const edgeSpec = specFor(
        template,
        "change-diff",
        "added",
      ) as typeof spec;
      const edgeTarget = statusTargets(edgeSpec, template)[1];
      edgeTarget.target.status = "pending";
      expectDiagnostic(edgeSpec, "INVALID_STRING", edgeTarget.path);
    },
  );

  it.each([
    ["C4 per-container palette", c4Spec("change-diff", "added"), "$.system.containers[0].palette", (value: unknown) => {
      const spec = value as DiagramSpec & {
        system: { containers: Array<Record<string, unknown>> };
      };
      spec.system.containers[0].palette = "c4-blue";
    }],
    ["sequence per-message palette", sequenceSpec("change-diff", "added"), "$.messages[0].palette", (value: unknown) => {
      const spec = value as SequenceInteractionSpec & {
        messages: Array<Record<string, unknown>>;
      };
      spec.messages[0].palette = "c4-blue";
    }],
    ["swimlane per-activity palette", swimlaneSpec("change-diff", "added"), "$.activities[0].palette", (value: unknown) => {
      const spec = value as SwimlaneFlowSpec & {
        activities: Array<Record<string, unknown>>;
      };
      spec.activities[0].palette = "c4-blue";
    }],
    ["raw color", c4Spec("change-diff", "added"), "$.system.containers[0].color", (value: unknown) => {
      const spec = value as DiagramSpec & {
        system: { containers: Array<Record<string, unknown>> };
      };
      spec.system.containers[0].color = "#ff00ff";
    }],
    ["nested style", sequenceSpec("change-diff", "added"), "$.participants[0].style", (value: unknown) => {
      const spec = value as SequenceInteractionSpec & {
        participants: Array<Record<string, unknown>>;
      };
      spec.participants[0].style = { color: "#ff00ff" };
    }],
    ["token bag", swimlaneSpec("change-diff", "added"), "$.tokens", (value: unknown) => {
      (value as Record<string, unknown>).tokens = { primary: "#ff00ff" };
    }],
  ])("rejects forbidden styling field: %s", (_name, source, path, mutate) => {
    const spec = structuredClone(source);
    mutate(spec);
    expectDiagnostic(spec, "UNKNOWN_FIELD", path);
  });
});

describe("palette/status omitted compatibility", () => {
  it.each(Object.entries(legacy.cases))(
    "preserves full normalized and scene bytes for %s",
    (caseKey, expected) => {
      const [caseId, view] = caseKey.split("/");
      const sourceRoot = {
        c4: "semantic-c4",
        sequence: "semantic-sequence",
        swimlane: "semantic-swimlane",
      }[view];
      expect(sourceRoot).toBeDefined();
      const input = readJson<unknown>(
        join(fixtureRoot, sourceRoot!, "v1", `${caseId}.json`),
      );
      const validation = validateDiagramSpec(input, { seed: legacy.seed });
      const build = buildDiagramSpec(input, { seed: legacy.seed });

      expect(validation.ok).toBe(true);
      expect(build.ok).toBe(true);
      if (!validation.ok || !build.ok) {
        return;
      }
      const normalized = JSON.stringify(validation.value);
      const scene = build.scene.toJson({ indent: 2 });
      expect(Buffer.byteLength(normalized)).toBe(expected.normalizedBytes);
      expect(sha256(normalized)).toBe(expected.normalizedSha256);
      expect(Buffer.byteLength(scene)).toBe(expected.sceneBytes);
      expect(sha256(scene)).toBe(expected.sceneSha256);
    },
  );
});

function specFor(
  template: TemplateName,
  palette: SemanticPaletteName | undefined,
  status: SemanticStatus,
): SemanticDiagramSpec {
  switch (template) {
    case "c4.container":
      return c4Spec(palette, status);
    case "sequence.interaction":
      return sequenceSpec(palette, status);
    case "flow.swimlane":
      return swimlaneSpec(palette, status);
  }
}

function c4Spec(
  palette: SemanticPaletteName | undefined,
  status: SemanticStatus,
): DiagramSpec {
  return {
    template: "c4.container",
    title: "Status C4",
    ...(palette ? { palette } : {}),
    system: {
      id: "system",
      name: "System",
      description: "Status proof.",
      containers: [
        {
          id: "web",
          name: "Web",
          description: "Entry point.",
          technology: "TypeScript",
          status,
        },
        {
          id: "api",
          name: "API",
          description: "Owns policy.",
          technology: "Node.js",
        },
      ],
    },
    relationships: [{
      id: "calls",
      from: "web",
      to: "api",
      description: "calls",
      technology: "HTTPS",
      status,
    }],
  };
}

function sequenceSpec(
  palette: SemanticPaletteName | undefined,
  status: SemanticStatus,
): SequenceInteractionSpec {
  return {
    template: "sequence.interaction",
    title: "Status sequence",
    ...(palette ? { palette } : {}),
    participants: [
      { id: "client", name: "Client", status },
      { id: "server", name: "Server" },
    ],
    messages: [
      {
        id: "call",
        from: "client",
        to: "server",
        label: "request",
        kind: "call",
        status,
      },
      {
        id: "return",
        from: "server",
        to: "client",
        label: "response",
        kind: "return",
      },
    ],
  };
}

function swimlaneSpec(
  palette: SemanticPaletteName | undefined,
  status: SemanticStatus,
): SwimlaneFlowSpec {
  return {
    template: "flow.swimlane",
    title: "Status swimlane",
    ...(palette ? { palette } : {}),
    lanes: [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
    ],
    activities: [
      {
        id: "start",
        lane: "one",
        type: "artifact",
        title: "Start",
        status,
      },
      {
        id: "end",
        lane: "two",
        type: "decision",
        title: "End",
      },
    ],
    transitions: [{ id: "go", from: "start", to: "end", status }],
  };
}

function callOnlySequence(
  palette: SemanticPaletteName,
): SequenceInteractionSpec {
  const spec = sequenceSpec(palette, "added");
  spec.messages = [spec.messages[0]];
  return spec;
}

function returnOnlySequence(
  palette: SemanticPaletteName,
): SequenceInteractionSpec {
  const spec = sequenceSpec(palette, "added");
  spec.messages = [spec.messages[1]];
  return spec;
}

function statusOnlySequence(
  palette: SemanticPaletteName,
): SequenceInteractionSpec {
  const spec = sequenceSpec(palette, "added");
  spec.messages = [
    spec.messages[0],
    {
      id: "second-call",
      from: "server",
      to: "client",
      label: "follow-up",
      kind: "call",
      status: "removed",
    },
  ];
  return spec;
}

function statusTargets(
  spec: {
    system?: { containers: Array<{ status: string }> };
    relationships?: Array<{ status: string }>;
    participants?: Array<{ status: string }>;
    messages?: Array<{ status: string }>;
    activities?: Array<{ status: string }>;
    transitions?: Array<{ status: string }>;
  },
  template: TemplateName,
): [
  { target: { status: string }; path: string },
  { target: { status: string }; path: string },
] {
  switch (template) {
    case "c4.container":
      return [
        {
          target: spec.system!.containers[0],
          path: "$.system.containers[0].status",
        },
        { target: spec.relationships![0], path: "$.relationships[0].status" },
      ];
    case "sequence.interaction":
      return [
        { target: spec.participants![0], path: "$.participants[0].status" },
        { target: spec.messages![0], path: "$.messages[0].status" },
      ];
    case "flow.swimlane":
      return [
        { target: spec.activities![0], path: "$.activities[0].status" },
        { target: spec.transitions![0], path: "$.transitions[0].status" },
      ];
  }
}

function expectDiagnostic(
  value: unknown,
  code: string,
  path: string,
): void {
  const validation = validateDiagramSpec(value);
  expect(validation.ok).toBe(false);
  expect(validation.diagnostics).toContainEqual(
    expect.objectContaining({ code, path, severity: "error" }),
  );
  const build = buildDiagramSpec(value);
  expect(build.ok).toBe(false);
  expect("scene" in build).toBe(false);
}

function expectExpectedBindings(
  elements: ElementLike[],
  template: TemplateName,
): void {
  const arrows = elements.filter((element) => element.type === "arrow");
  expect(arrows.length).toBeGreaterThan(0);
  for (const arrow of arrows) {
    if (template === "flow.swimlane") {
      expect(arrow.startBinding).toMatchObject({ mode: "inside" });
      expect(arrow.endBinding).toMatchObject({ mode: "inside" });
    } else {
      expect(arrow.startBinding).toBeNull();
      expect(arrow.endBinding).toBeNull();
    }
  }
}

function expectBadgeTextFits(
  elements: ElementLike[],
  content: string,
): void {
  const normalizedContent = content.replace(/\s/g, "");
  const text = textElements(elements).find(
    (element) =>
      typeof element.text === "string"
      && element.text.replace(/\s/g, "") === normalizedContent,
  );
  expect(text).toBeDefined();
  if (!text) {
    return;
  }
  const textBounds = elementBounds(text);
  const containingFrame = elements
    .filter((element) => element.type === "rectangle")
    .map(elementBounds)
    .find((bounds) => contains(bounds, textBounds));
  expect(containingFrame).toBeDefined();
}

function contains(outer: Bounds, inner: Bounds): boolean {
  const epsilon = 0.5;
  return inner.left >= outer.left - epsilon
    && inner.right <= outer.right + epsilon
    && inner.top >= outer.top - epsilon
    && inner.bottom <= outer.bottom + epsilon;
}

function textElements(elements: ElementLike[]): ElementLike[] {
  return elements.filter((element) => element.type === "text");
}

function textValues(elements: ElementLike[]): unknown[] {
  return textElements(elements).map((element) => element.text);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
