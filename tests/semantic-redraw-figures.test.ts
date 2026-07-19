import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateNativeBindings } from "../src/bindings.js";
import {
  SEMANTIC_FIGURE_NAMES,
  type SemanticRedrawSpecDocument,
  validateSemanticRedrawSpec,
  writeSemanticRedrawDiagram,
} from "../src/index.js";

function explicitSpec(assetPack: "core" | "trading" = "core"): SemanticRedrawSpecDocument {
  return {
    title: "Semantic figure vocabulary",
    seed: 130,
    assetPack,
    layout: { type: "sections", density: "compact" },
    sections: [
      {
        id: "runtime",
        title: "Runtime",
        order: 1,
        cards: [
          { id: "operator", title: "Operator", figure: "actor", description: "Starts and accepts the session." },
          { id: "runtime", title: "Coordinator", figure: "card", description: "Delegates bounded work." },
          { id: "queue", title: "Review queue", figure: "queue", description: "Buffers independent findings." },
          { id: "decision", title: "Ready to publish?", figure: "decision", description: "Checks both review lanes." },
        ],
      },
      {
        id: "evidence",
        title: "Evidence",
        order: 2,
        cards: [
          { id: "store", title: "Evidence store", figure: "store", description: "Persists accepted artifacts." },
          { id: "facts", title: "Required facts", figure: "bullets", bullets: ["agent ownership", "directed handoffs"] },
          { id: "status", title: "Acceptance", figure: "badge", badge: "Owner decision" },
          { id: "note", title: "Scope note", figure: "note", description: "No direct model call." },
        ],
      },
    ],
    edges: [
      { from: "operator", to: "runtime", label: "starts" },
      { from: "runtime", to: "queue", label: "delegates" },
      { from: "queue", to: "decision", label: "joins" },
      { from: "decision", to: "store", label: "accepted" },
      { from: "decision", to: "runtime", label: "revise", kind: "feedback" },
    ],
  };
}

function mixedSpec(): SemanticRedrawSpecDocument {
  return {
    title: "Mixed legacy and semantic figures",
    seed: 131,
    sections: [
      {
        id: "first",
        title: "First",
        order: 1,
        cards: [
          {
            id: "legacy",
            title: "Legacy card",
            iconId: "server_stack",
            bullets: ["unchanged icon panel"],
          },
          {
            id: "actor",
            title: "Reviewer",
            figure: "actor",
            description: "Reads the frozen target.",
          },
        ],
      },
      {
        id: "second",
        title: "Second",
        order: 2,
        cards: [
          {
            id: "store",
            title: "Review journal",
            figure: "store",
            description: "Stores immutable findings.",
          },
        ],
      },
    ],
    edges: [
      { from: "actor", to: "legacy", label: "reads" },
      { from: "legacy", to: "store", label: "records" },
    ],
  };
}

interface LegacyMatrixCase {
  name: string;
  density: "iconic" | "compact" | "default" | "expanded";
  pack: "core" | "trading";
  snake: boolean;
  subtitle: boolean;
  icons: [string, string, string, string];
}

const LEGACY_MATRIX: LegacyMatrixCase[] = [
  {
    name: "iconic-core-camel-subtitle",
    density: "iconic",
    pack: "core",
    snake: false,
    subtitle: true,
    icons: ["server_stack", "robot_agent", "memory_database", "tool_call"],
  },
  {
    name: "compact-core-snake",
    density: "compact",
    pack: "core",
    snake: true,
    subtitle: false,
    icons: ["server_stack", "robot_agent", "memory_database", "tool_call"],
  },
  {
    name: "default-trading-camel-subtitle",
    density: "default",
    pack: "trading",
    snake: false,
    subtitle: true,
    icons: [
      "trading_tech_chart_up_01-01",
      "trading_trader_person_01-02",
      "trading_bull_01-03",
      "trading_bear_01-04",
    ],
  },
  {
    name: "expanded-trading-snake",
    density: "expanded",
    pack: "trading",
    snake: true,
    subtitle: false,
    icons: [
      "trading_tech_chart_up_01-01",
      "trading_trader_person_01-02",
      "trading_bull_01-03",
      "trading_bear_01-04",
    ],
  },
];

function legacyMatrixSpec(entry: LegacyMatrixCase): SemanticRedrawSpecDocument {
  const card = (id: string, title: string, icon: string) => entry.snake
    ? { id, title, icon_id: icon, bullets: [`${title} responsibility`] }
    : { id, title, iconId: icon, bullets: [`${title} responsibility`] };
  return {
    title: `Legacy ${entry.name}`,
    ...(entry.subtitle ? { subtitle: "Frozen omitted-figure compatibility." } : {}),
    seed: 130,
    assetPack: entry.pack,
    layout: { type: "sections", density: entry.density },
    sections: [
      {
        id: "left",
        title: "Left",
        order: 1,
        cards: [
          card("a", "A", entry.icons[0]),
          card("b", "B", entry.icons[1]),
        ],
      },
      {
        id: "right",
        title: "Right",
        order: 2,
        cards: [
          card("c", "C", entry.icons[2]),
          card("d", "D", entry.icons[3]),
        ],
      },
    ],
    edges: [
      { from: "a", to: "c", kind: "primary", label: "primary" },
      { from: "b", to: "d", kind: "support", label: "support" },
      { from: "c", to: "d", kind: "feedback", label: "feedback" },
      {
        from: "d",
        to: "a",
        kind: "provenance",
        label: "provenance",
        direction: "left-to-right",
      },
    ],
  };
}

function pointToSegmentDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (
      (point[0] - start[0]) * dx + (point[1] - start[1]) * dy
    ) / lengthSquared));
  return Math.hypot(
    point[0] - (start[0] + t * dx),
    point[1] - (start[1] + t * dy),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("semantic redraw figure integration", () => {
  it("preserves frozen omitted-figure bytes across densities, packs, aliases, subtitles, and edge kinds", () => {
    const baseline = JSON.parse(readFileSync(
      join(import.meta.dirname, "fixtures", "semantic-figures", "v1", "legacy-hashes.json"),
      "utf8",
    )) as {
      fixedNow: number;
      cases: Array<{ name: string; sha256: string; elements: number; files: number }>;
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(baseline.fixedNow));
    const root = mkdtempSync(join(tmpdir(), "semantic-figure-legacy-"));

    for (const entry of LEGACY_MATRIX) {
      const out = join(root, `${entry.name}.excalidraw`);
      const result = writeSemanticRedrawDiagram(legacyMatrixSpec(entry), out);
      const bytes = readFileSync(out);
      const expected = baseline.cases.find((candidate) => candidate.name === entry.name);
      expect(expected).toBeDefined();
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected?.sha256);
      expect(result.elements).toBe(expected?.elements);
      expect(result.files).toBe(expected?.files);
      expect(result.warnings).toContainEqual(expect.objectContaining({
        code: "EDGE_DIRECTION_OVERRIDDEN",
        path: "$.edges[3].direction",
      }));
      const scene = JSON.parse(bytes.toString("utf8")) as {
        elements: Array<Record<string, unknown>>;
      };
      expect(scene.elements
        .filter((element) => element.type === "arrow")
        .every((arrow) => arrow.startBinding === null && arrow.endBinding === null)).toBe(true);
      expect(() => writeSemanticRedrawDiagram(
        legacyMatrixSpec(entry),
        join(root, `${entry.name}-strict.excalidraw`),
        { failOnDirectionMismatch: true },
      )).toThrow(/EDGE_DIRECTION_MISMATCH/);
    }
  });

  it("exports exactly eight names and renders all recipes under both caller packs", () => {
    expect(SEMANTIC_FIGURE_NAMES).toEqual([
      "card",
      "bullets",
      "badge",
      "actor",
      "store",
      "queue",
      "decision",
      "note",
    ]);

    for (const pack of ["core", "trading"] as const) {
      const root = mkdtempSync(join(tmpdir(), `semantic-figures-${pack}-`));
      const out = join(root, "figures.excalidraw");
      const result = writeSemanticRedrawDiagram(explicitSpec(pack), out);
      const scene = JSON.parse(readFileSync(out, "utf8")) as {
        elements: Array<Record<string, unknown>>;
        files: Record<string, unknown>;
      };

      expect(result.cards).toBe(8);
      expect(Object.keys(scene.files)).toHaveLength(2);
      expect(validateNativeBindings(scene.elements)).toEqual({ valid: true, issues: [] });
      const text = scene.elements
        .filter((element) => element.type === "text")
        .map((element) => String(element.text));
      expect(text).toEqual(expect.arrayContaining([
        "Actor",
        "Store",
        "Queue",
        "Decision",
        "Note",
        "Owner decision",
      ]));
    }
  });

  it("binds explicit/explicit and explicit/legacy edges while leaving all-legacy edges unbound", () => {
    const root = mkdtempSync(join(tmpdir(), "semantic-figure-bindings-"));
    const mixedOut = join(root, "mixed.excalidraw");
    writeSemanticRedrawDiagram(mixedSpec(), mixedOut);
    const mixed = JSON.parse(readFileSync(mixedOut, "utf8")) as {
      elements: Array<Record<string, unknown>>;
    };
    const mixedArrows = mixed.elements.filter((element) => element.type === "arrow");
    expect(mixedArrows).toHaveLength(2);
    expect(mixedArrows.every((arrow) => arrow.startBinding && arrow.endBinding)).toBe(true);
    expect(validateNativeBindings(mixed.elements)).toEqual({ valid: true, issues: [] });

    const legacy = mixedSpec();
    legacy.sections[0].cards[1] = {
      id: "actor",
      title: "Reviewer",
      iconId: "robot_agent",
      bullets: ["reads the frozen target"],
    };
    legacy.sections[1].cards[0] = {
      id: "store",
      title: "Review journal",
      iconId: "memory_database",
      bullets: ["stores immutable findings"],
    };
    const legacyOut = join(root, "legacy.excalidraw");
    writeSemanticRedrawDiagram(legacy, legacyOut);
    const legacyScene = JSON.parse(readFileSync(legacyOut, "utf8")) as {
      elements: Array<Record<string, unknown>>;
    };
    const legacyArrows = legacyScene.elements.filter((element) => element.type === "arrow");
    expect(legacyArrows.every((arrow) => arrow.startBinding === null && arrow.endBinding === null)).toBe(true);
  });

  it("keeps explicit edge labels visually attached to their own routed line", () => {
    const root = mkdtempSync(join(tmpdir(), "semantic-figure-labels-"));
    const out = join(root, "labels.excalidraw");
    writeSemanticRedrawDiagram(explicitSpec(), out);
    const scene = JSON.parse(readFileSync(out, "utf8")) as {
      elements: Array<Record<string, unknown>>;
    };

    for (const label of ["starts", "delegates", "joins", "accepted", "revise"]) {
      const labelIndex = scene.elements.findIndex(
        (element) => element.type === "text" && element.text === label,
      );
      expect(labelIndex).toBeGreaterThan(0);
      const labelElement = scene.elements[labelIndex];
      const arrow = scene.elements[labelIndex - 1];
      expect(arrow.type).toBe("arrow");

      const arrowX = Number(arrow.x);
      const arrowY = Number(arrow.y);
      const points = (arrow.points as Array<[number, number]>)
        .map(([x, y]) => [arrowX + x, arrowY + y] as [number, number]);
      const left = Number(labelElement.x);
      const top = Number(labelElement.y);
      const right = left + Number(labelElement.width);
      const bottom = top + Number(labelElement.height);
      const labelEdges: Array<[number, number]> = [
        [left, (top + bottom) / 2],
        [right, (top + bottom) / 2],
        [(left + right) / 2, top],
        [(left + right) / 2, bottom],
      ];
      const distance = labelEdges.reduce(
        (nearestEdge, labelPoint) => Math.min(
          nearestEdge,
          ...points.slice(0, -1).map(
            (start, index) => pointToSegmentDistance(labelPoint, start, points[index + 1]),
          ),
        ),
        Number.POSITIVE_INFINITY,
      );
      expect(distance).toBeLessThanOrEqual(4);
    }
  });

  it("rejects unknown, arbitrary, incompatible, and non-connectable figure input at exact paths", () => {
    const spec = explicitSpec() as unknown as Record<string, unknown>;
    const sections = spec.sections as Array<Record<string, unknown>>;
    const firstCards = sections[0].cards as Array<Record<string, unknown>>;
    const secondCards = sections[1].cards as Array<Record<string, unknown>>;
    firstCards[0].figure = "hexagon";
    firstCards[1].iconId = "robot_agent";
    firstCards[2].style = { stroke: "#fff" };
    secondCards[0].bullets = ["not legal for store"];
    const edges = spec.edges as Array<Record<string, unknown>>;
    edges.push({ from: "facts", to: "status", label: "invalid" });

    const result = validateSemanticRedrawSpec(spec);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INVALID_FIGURE", path: "$.sections[0].cards[0].figure" }),
      expect.objectContaining({ code: "FORBIDDEN_FIGURE_FIELD", path: "$.sections[0].cards[1].iconId" }),
      expect.objectContaining({ code: "FORBIDDEN_FIGURE_FIELD", path: "$.sections[0].cards[2].style" }),
      expect.objectContaining({ code: "UNKNOWN_FIGURE_FIELD", path: "$.sections[1].cards[0].bullets" }),
      expect.objectContaining({ code: "NON_CONNECTABLE_EDGE_FROM", path: "$.edges[5].from" }),
      expect.objectContaining({ code: "NON_CONNECTABLE_EDGE_TO", path: "$.edges[5].to" }),
    ]));
  });

  it("requires two distinct written outcomes for every decision", () => {
    const missing = explicitSpec();
    missing.edges = missing.edges?.filter((edge) => edge.from !== "decision");
    const missingResult = validateSemanticRedrawSpec(missing);
    expect(missingResult.errors).toContainEqual(expect.objectContaining({
      code: "DECISION_OUTCOMES_REQUIRED",
      path: "$.sections[0].cards[3].figure",
    }));

    const duplicate = explicitSpec();
    duplicate.edges = duplicate.edges?.map((edge) =>
      edge.from === "decision" ? { ...edge, label: "same" } : edge);
    const duplicateResult = validateSemanticRedrawSpec(duplicate);
    expect(duplicateResult.errors).toContainEqual(expect.objectContaining({
      code: "DUPLICATE_DECISION_OUTCOME",
      path: "$.edges[4].label",
    }));

    const unlabeled = explicitSpec();
    if (unlabeled.edges) {
      delete unlabeled.edges[4].label;
    }
    const unlabeledResult = validateSemanticRedrawSpec(unlabeled);
    expect(unlabeledResult.errors).toContainEqual(expect.objectContaining({
      code: "DECISION_OUTCOME_LABEL_REQUIRED",
      path: "$.edges[4].label",
    }));
  });
});
