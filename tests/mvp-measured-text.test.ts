import { describe, expect, it } from "vitest";
import {
  BLUE,
  Bounds,
  CHAR_WIDTH_RATIO,
  Colors,
  GREEN,
  PlacedBlock,
  Scene,
  accentRoles,
  assertDiagramHealthy,
  avoidOverlap,
  fitText,
  legendNeeded,
  nodeCard,
  resolveColor,
  validateDiagram,
} from "../src/index.js";
import { boundsFor, elementBounds } from "../src/geometry.js";

const LONG_TOKEN = "approve_batch_with_optional_reaper";

describe("fitText measured text", () => {
  it("wraps a long code token by delimiters within the available width", () => {
    const width = 180;
    const size = 14;
    const fitted = fitText(LONG_TOKEN, { width, size });

    expect(fitted.lines.length).toBeGreaterThan(1);
    expect(fitted.text).toContain("\n");
    expect(fitted.height).toBeGreaterThan(size * fitted.lineHeight); // taller than one line

    for (const line of fitted.lines) {
      expect(line.length * size * CHAR_WIDTH_RATIO).toBeLessThanOrEqual(width + 1);
    }
  });

  it("throws in strict overflow mode with a message naming the id", () => {
    expect(() =>
      fitText(LONG_TOKEN, {
        width: 60,
        size: 18,
        minSize: 14,
        maxLines: 1,
        overflow: "error",
        id: "reaper_node",
      }),
    ).toThrowError(/reaper_node/);
  });

  it("reports overflow without throwing in shrink mode (default)", () => {
    const fitted = fitText(LONG_TOKEN, { width: 60, size: 18, minSize: 14, maxLines: 1 });
    expect(fitted.overflowed).toBe(true);
    expect(fitted.warnings.length).toBeGreaterThan(0);
  });
});

describe("nodeCard primitive", () => {
  function buildCard(): ReturnType<typeof nodeCard> {
    const scene = new Scene({ seed: 11 });
    return nodeCard(scene, {
      id: "reaper",
      title: "approve_batch_with_optional_reaper handler",
      bullets: [
        "RiskDecision.attributes carries the full decision payload",
        "Strategy.decide is invoked once per execution row",
      ],
      width: 320,
      padding: 16,
    });
  }

  it("keeps every text inside the frame padding and shares one group", () => {
    const card = buildCard();
    const frame = card.bounds;
    const padding = 16;
    const eps = 1;

    expect(card.texts.length).toBeGreaterThanOrEqual(3); // title + 2 bullets
    for (const text of card.texts) {
      const tb = elementBounds(text);
      expect(tb.left).toBeGreaterThanOrEqual(frame.left + padding - eps);
      expect(tb.right).toBeLessThanOrEqual(frame.right - padding + eps);
      expect(tb.top).toBeGreaterThanOrEqual(frame.top + padding - eps);
      expect(tb.bottom).toBeLessThanOrEqual(frame.bottom - padding + eps);
    }

    expect(card.groupId).not.toBe("");
    for (const element of card.block.elements) {
      expect(Array.isArray(element.groupIds)).toBe(true);
      expect(element.groupIds as string[]).toContain(card.groupId);
    }
  });

  it("emits ordinary editable rectangle/text elements (no flattened SVG)", () => {
    const scene = new Scene({ seed: 12 });
    const card = nodeCard(scene, { id: "n1", title: "Service", bullets: ["does a thing"], width: 300 });

    expect(card.frame.type).toBe("rectangle");
    for (const text of card.texts) {
      expect(text.type).toBe("text");
    }
    for (const element of card.block.elements) {
      expect(["rectangle", "text", "image"]).toContain(element.type);
    }

    const json = JSON.parse(scene.toJson());
    const types = (json.elements as Array<{ type: string }>).map((element) => element.type);
    expect(types).toContain("rectangle");
    expect(types.filter((type) => type === "text").length).toBeGreaterThanOrEqual(2);
  });

  it("throws in strict mode when text cannot fit", () => {
    const scene = new Scene({ seed: 13 });
    expect(() =>
      nodeCard(scene, {
        id: "tight",
        title: LONG_TOKEN,
        width: 80,
        titleMaxLines: 1,
        strict: true,
      }),
    ).toThrowError(/tight/);
  });
});

describe("avoidOverlap resolver", () => {
  function note(scene: Scene, id: string, x: number, y: number): { id: string; block: PlacedBlock; kind: "note" } {
    const rect = scene.rect(x, y, 120, 48);
    return { id, block: new PlacedBlock([rect], boundsFor([rect])), kind: "note" };
  }

  it("pushes the later overlapping note down and preserves reading order", () => {
    const scene = new Scene({ seed: 21 });
    const first = note(scene, "note_a", 0, 0);
    const second = note(scene, "note_b", 12, 12); // overlaps first
    const items = [first, second];

    const result = avoidOverlap(items, { gap: 16 });

    // Reading order unchanged
    expect(items[0].id).toBe("note_a");
    expect(items[1].id).toBe("note_b");
    // First note did not move; second moved down clear of the first
    expect(first.block.bounds.top).toBe(0);
    expect(second.block.bounds.top).toBeGreaterThanOrEqual(first.block.bounds.bottom + 16 - 1);
    expect(result.moved.find((m) => m.id === "note_b")?.dy ?? 0).toBeGreaterThan(0);
  });
});

describe("validateDiagram gate", () => {
  it("catches a block collision and names both ids", () => {
    const result = validateDiagram({
      blocks: [
        { id: "alpha", bounds: new Bounds(0, 0, 100, 100) },
        { id: "beta", bounds: new Bounds(50, 50, 100, 100) },
      ],
      gap: 8,
    });

    expect(result.ok).toBe(false);
    const overlap = result.errors.find((issue) => issue.code === "block-overlap");
    expect(overlap).toBeTruthy();
    expect(overlap?.ids).toEqual(expect.arrayContaining(["alpha", "beta"]));
  });

  it("catches an arrow passing through an unrelated block, ignoring source/target", () => {
    const result = validateDiagram({
      blocks: [
        { id: "src", bounds: new Bounds(0, 0, 80, 80) },
        { id: "mid", bounds: new Bounds(150, 0, 80, 80) },
        { id: "dst", bounds: new Bounds(300, 0, 80, 80) },
      ],
      edges: [{ id: "edge1", points: [[80, 40], [300, 40]], from: "src", to: "dst" }],
      gap: 8,
    });

    const through = result.errors.find((issue) => issue.code === "arrow-through-block");
    expect(through).toBeTruthy();
    expect(through?.ids).toEqual(expect.arrayContaining(["edge1", "mid"]));
    // Source/target must not be reported as arrow-through.
    expect(result.errors.some((issue) => issue.code === "arrow-through-block" && issue.ids.includes("src"))).toBe(false);
    expect(result.errors.some((issue) => issue.code === "arrow-through-block" && issue.ids.includes("dst"))).toBe(false);
  });

  it("reports an overlapping arrow label as a collision", () => {
    const result = validateDiagram({
      blocks: [{ id: "node", bounds: new Bounds(0, 0, 120, 80) }],
      edges: [
        {
          id: "edge_lbl",
          points: [[120, 40], [220, 40]],
          from: "node",
          label: { id: "edge_lbl_text", bounds: new Bounds(60, 30, 140, 24) },
        },
      ],
    });

    const overlap = result.errors.find((issue) => issue.code === "block-overlap");
    expect(overlap).toBeTruthy();
    expect(overlap?.ids).toEqual(expect.arrayContaining(["node", "edge_lbl_text"]));
  });

  it("tolerateEdgeLabelOverlap lets a label overlap its own edge's endpoint card", () => {
    const result = validateDiagram({
      blocks: [{ id: "node", bounds: new Bounds(0, 0, 120, 80) }],
      edges: [
        {
          id: "edge_lbl",
          points: [[120, 40], [220, 40]],
          from: "node",
          label: { id: "edge_lbl_text", bounds: new Bounds(60, 30, 140, 24) },
        },
      ],
      tolerateEdgeLabelOverlap: true,
    });

    expect(result.errors.some((issue) => issue.code === "block-overlap")).toBe(false);
  });

  it("tolerateEdgeLabelOverlap warns (never errors) on residual label-label overlap", () => {
    const minor = validateDiagram({
      edges: [
        { id: "e1", points: [[0, 0], [400, 0]], from: "x", label: { id: "l1", bounds: new Bounds(0, 0, 120, 24) } },
        { id: "e2", points: [[0, 0], [400, 0]], from: "y", label: { id: "l2", bounds: new Bounds(110, 0, 120, 24) } },
      ],
      tolerateEdgeLabelOverlap: true,
    });
    expect(minor.issues.some((issue) => issue.code === "label-overlap")).toBe(false); // below threshold

    const notable = validateDiagram({
      edges: [
        { id: "e1", points: [[0, 0], [400, 0]], from: "x", label: { id: "l1", bounds: new Bounds(180, 100, 120, 24) } },
        { id: "e2", points: [[0, 0], [400, 0]], from: "y", label: { id: "l2", bounds: new Bounds(185, 104, 120, 24) } },
      ],
      tolerateEdgeLabelOverlap: true,
    });
    // A residual notable overlap is a cosmetic warning, not a failure.
    expect(notable.ok).toBe(true);
    expect(notable.errors).toHaveLength(0);
    const overlap = notable.warnings.find((issue) => issue.code === "label-overlap");
    expect(overlap).toBeTruthy();
    expect(overlap?.ids).toEqual(expect.arrayContaining(["l1", "l2"]));
  });

  it("assertDiagramHealthy passes for a clean diagram and throws for a dirty one", () => {
    expect(() =>
      assertDiagramHealthy({
        blocks: [
          { id: "a", bounds: new Bounds(0, 0, 100, 80) },
          { id: "b", bounds: new Bounds(200, 0, 100, 80) },
        ],
        edges: [{ id: "e", points: [[100, 40], [200, 40]], from: "a", to: "b" }],
        gap: 8,
      }),
    ).not.toThrow();

    expect(() =>
      assertDiagramHealthy({
        blocks: [
          { id: "a", bounds: new Bounds(0, 0, 100, 80) },
          { id: "b", bounds: new Bounds(20, 20, 100, 80) },
        ],
      }),
    ).toThrowError(/validation failed/);
  });
});

describe("Colors glossary", () => {
  it("defaults to monotone blue and resolves roles", () => {
    expect(resolveColor(undefined)).toBe(BLUE);
    expect(resolveColor("added")).toBe(Colors.added);
    expect(Colors.added).toBe(GREEN);
    expect(resolveColor("#abcdef")).toBe("#abcdef");
  });

  it("recommends a legend only when more than one accent role is used", () => {
    expect(legendNeeded(["added"])).toBe(false);
    expect(legendNeeded(["default", "note", "external"])).toBe(false);
    expect(legendNeeded(["added", "changed"])).toBe(true);
    expect(accentRoles(["default", "added", "note", "added"])).toEqual(["added"]);
  });
});
