import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../src/assets.js";
import { Scene } from "../src/core.js";
import { boundsFor, elementBounds } from "../src/geometry.js";
import { connectRouted, distributeVertical, section } from "../src/layout.js";
import {
  SEMANTIC_FIGURE_NAMES,
  SemanticFigureName,
  SemanticFigureSpec,
  renderSemanticFigure,
} from "../src/semantic-figure.js";

const CONNECTABLE = new Set<SemanticFigureName>([
  "card",
  "actor",
  "store",
  "queue",
  "decision",
]);
const CHANGE_DIFF_THEME = {
  actor: "#312e81",
  activity: "#4338ca",
  evidence: "#7e22ce",
  context: "#64748b",
  text: "#334155",
} as const;
const FIGURE_ACCENTS: Readonly<Record<SemanticFigureName, string>> = {
  actor: CHANGE_DIFF_THEME.actor,
  card: CHANGE_DIFF_THEME.activity,
  queue: CHANGE_DIFF_THEME.activity,
  decision: CHANGE_DIFF_THEME.activity,
  store: CHANGE_DIFF_THEME.evidence,
  bullets: CHANGE_DIFF_THEME.evidence,
  badge: CHANGE_DIFF_THEME.context,
  note: CHANGE_DIFF_THEME.context,
};
const FIGURE_BADGES: Partial<Record<SemanticFigureName, string>> = {
  actor: "Actor",
  store: "Store",
  queue: "Queue",
  decision: "Decision",
  note: "Note",
};

describe("semantic figure renderer", () => {
  it("exposes exactly the reviewed eight-name vocabulary", () => {
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
  });

  it.each(SEMANTIC_FIGURE_NAMES)(
    "renders %s as measured editable native elements",
    (figure) => {
      const scene = new Scene({ seed: 130 });
      const rendered = renderSemanticFigure(scene, figureSpec(figure));
      const frameBounds = elementBounds(rendered.frame);

      expect(rendered.overflowed).toBe(false);
      expect(rendered.warnings).toEqual([]);
      expect(rendered.frame.type).toBe("rectangle");
      expect(rendered.block.bounds).toEqual(frameBounds);
      expect(rendered.block.elements).toContain(rendered.frame);
      expect(rendered.block.elements.every((element) =>
        ["rectangle", "text", "image", "line", "diamond"].includes(String(element.type)))).toBe(true);

      const title = rendered.block.elements.find((element) =>
        element.type === "text" && element.originalText === `${figure} title`);
      expect(title).toMatchObject({ textAlign: "left", type: "text" });

      for (const element of rendered.block.elements) {
        expectInside(elementBounds(element), frameBounds);
      }

      const sharedGroups = rendered.block.elements
        .map((element) => element.groupIds as string[])
        .reduce((shared, groupIds) =>
          shared.filter((groupId) => groupIds.includes(groupId)));
      expect(sharedGroups.length).toBeGreaterThan(0);
      expect(boundsFor(rendered.block.elements)).toEqual(rendered.block.bounds);
    },
  );

  it("renders written recipe cues and recipe-specific content", () => {
    const bullets = renderSemanticFigure(
      new Scene({ seed: 1 }),
      figureSpec("bullets"),
    );
    const badge = renderSemanticFigure(
      new Scene({ seed: 2 }),
      figureSpec("badge"),
    );

    expect(texts(bullets.block.elements)).toEqual(
      expect.arrayContaining(["- first item", "- second item"]),
    );
    expect(texts(badge.block.elements)).toContain("Compact class");

    for (const [figure, cue] of [
      ["actor", "Actor"],
      ["store", "Store"],
      ["queue", "Queue"],
      ["decision", "Decision"],
      ["note", "Note"],
    ] as const) {
      const rendered = renderSemanticFigure(
        new Scene({ seed: 3 }),
        figureSpec(figure),
      );
      expect(texts(rendered.block.elements)).toContain(cue);
    }
  });

  it("uses native queue, decision, and folded-note decorations inside the frame", () => {
    const queue = renderSemanticFigure(
      new Scene({ seed: 4 }),
      figureSpec("queue"),
    );
    const decision = renderSemanticFigure(
      new Scene({ seed: 5 }),
      figureSpec("decision"),
    );
    const note = renderSemanticFigure(
      new Scene({ seed: 6 }),
      figureSpec("note"),
    );

    expect(queue.block.elements.filter((element) => element.type === "rectangle"))
      .toHaveLength(5);
    expect(decision.block.elements.filter((element) => element.type === "diamond"))
      .toHaveLength(1);
    expect(note.block.elements.filter((element) => element.type === "line"))
      .toHaveLength(3);
  });

  it.each(SEMANTIC_FIGURE_NAMES)(
    "applies the private role accent to %s while keeping main text structural",
    (figure) => {
      const rendered = renderSemanticFigure(
        new Scene({ seed: 14 }),
        figureSpec(figure),
        CHANGE_DIFF_THEME,
      );
      const accent = FIGURE_ACCENTS[figure];
      const title = rendered.block.elements.find((element) =>
        element.type === "text"
        && element.originalText === `${figure} title`);
      const textElements = rendered.block.elements.filter((element) =>
        element.type === "text");

      expect(rendered.frame.strokeColor).toBe(accent);
      expect(title?.strokeColor).toBe(CHANGE_DIFF_THEME.text);
      for (const element of textElements) {
        if (isFigureBadgeText(figure, String(element.originalText))) {
          expect(element.strokeColor).toBe(accent);
        } else {
          expect(element.strokeColor).toBe(CHANGE_DIFF_THEME.text);
        }
      }
    },
  );

  it("uses the role accent for queue, decision, and note native cues", () => {
    const queue = renderSemanticFigure(
      new Scene({ seed: 15 }),
      figureSpec("queue"),
      CHANGE_DIFF_THEME,
    );
    const decision = renderSemanticFigure(
      new Scene({ seed: 16 }),
      figureSpec("decision"),
      CHANGE_DIFF_THEME,
    );
    const note = renderSemanticFigure(
      new Scene({ seed: 17 }),
      figureSpec("note"),
      CHANGE_DIFF_THEME,
    );
    const queueCues = queue.block.elements.filter((element) =>
      element.type === "rectangle"
      && element.width === 14
      && element.height === 18);

    expect(queueCues).toHaveLength(3);
    expect(queueCues.every((element) =>
      element.strokeColor === CHANGE_DIFF_THEME.activity)).toBe(true);
    expect(decision.block.elements.find((element) =>
      element.type === "diamond")?.strokeColor).toBe(
      CHANGE_DIFF_THEME.activity,
    );
    expect(note.block.elements.filter((element) => element.type === "line"))
      .toHaveLength(3);
    expect(note.block.elements
      .filter((element) => element.type === "line")
      .every((element) =>
        element.strokeColor === CHANGE_DIFF_THEME.context)).toBe(true);
  });

  it("does not recolor renderer-owned actor and store image assets", () => {
    for (const figure of ["actor", "store"] as const) {
      const legacyScene = new Scene({ seed: 18 });
      const themedScene = new Scene({ seed: 18 });
      const legacy = renderSemanticFigure(
        legacyScene,
        figureSpec(figure),
      );
      const themed = renderSemanticFigure(
        themedScene,
        figureSpec(figure),
        CHANGE_DIFF_THEME,
      );
      const legacyImage = legacy.block.elements.find((element) =>
        element.type === "image");
      const themedImage = themed.block.elements.find((element) =>
        element.type === "image");

      expect(themedImage?.fileId).toBe(legacyImage?.fileId);
      expect(themedImage?.strokeColor).toBe(legacyImage?.strokeColor);
      expect(Object.keys(themedScene.files)).toEqual(Object.keys(legacyScene.files));
    }
  });

  it.each([
    ["core", "actor", "agents_robot_agent_01-01"],
    ["trading", "actor", "agents_robot_agent_01-01"],
    ["core", "store", "data_memory_database_02-25"],
    ["trading", "store", "data_memory_database_02-25"],
  ] as const)(
    "uses the fixed core %s asset when the caller registry is %s",
    (callerPack, figure, assetId) => {
      const callerRegistry = AssetRegistry.bundled(callerPack);
      const coreRegistry = AssetRegistry.bundled("core");
      const scene = new Scene({ seed: 7, assetRegistry: callerRegistry });
      const rendered = renderSemanticFigure(scene, figureSpec(figure));
      const image = rendered.block.elements.find((element) => element.type === "image");
      const expectedFileId = `svg_${
        createHash("sha1")
          .update(coreRegistry.resolve(assetId).data)
          .digest("hex")
          .slice(0, 24)
      }`;

      expect(image?.fileId).toBe(expectedFileId);
      expect(scene.files).toHaveProperty(expectedFileId);
    },
  );

  it.each(SEMANTIC_FIGURE_NAMES)(
    "marks %s connectability and binding target from one closed catalog",
    (figure) => {
      const rendered = renderSemanticFigure(
        new Scene({ seed: 8 }),
        figureSpec(figure),
      );
      const expected = CONNECTABLE.has(figure);

      expect(rendered.connectable).toBe(expected);
      if (expected) {
        expect(rendered.block.bindingTarget).toBe(rendered.frame);
      } else {
        expect(rendered.block.bindingTarget).toBeUndefined();
      }
    },
  );

  it("preserves current bounds and binding ownership after translation", () => {
    const rendered = renderSemanticFigure(
      new Scene({ seed: 9 }),
      { ...figureSpec("decision"), x: 10, y: 20 },
    );
    const target = rendered.block.bindingTarget;
    const before = rendered.block.bounds;

    rendered.block.translated(75, 90);

    expect(rendered.block.bindingTarget).toBe(target);
    expect(rendered.block.bounds.x).toBe(before.x + 75);
    expect(rendered.block.bounds.y).toBe(before.y + 90);
    expect(boundsFor(rendered.block.elements)).toEqual(rendered.block.bounds);
    expect(elementBounds(target!)).toEqual(rendered.block.bounds);
  });

  it("binds from exact frame bounds after measured section placement", () => {
    const scene = new Scene({ seed: 13 });
    const actor = renderSemanticFigure(scene, figureSpec("actor"));
    const decision = renderSemanticFigure(scene, figureSpec("decision"));
    const children = distributeVertical(
      [actor.block, decision.block],
      0,
      0,
      { gap: 17 },
    );
    section(scene, {
      title: "Measured section",
      x: 37,
      y: 53,
      children,
    });

    expect(actor.block.bounds).toEqual(elementBounds(actor.frame));
    expect(decision.block.bounds).toEqual(elementBounds(decision.frame));
    expect(() =>
      connectRouted(scene, actor.block, decision.block, {
        bindings: true,
        direction: "top-down",
        path: "orthogonal",
      })).not.toThrow();
  });

  it("fails closed for content that does not match the selected recipe", () => {
    expect(() =>
      renderSemanticFigure(
        new Scene({ seed: 10 }),
        { id: "empty", figure: "bullets", title: "Empty", bullets: [] },
      )).toThrow(/requires 1-5 non-empty items/);
    expect(() =>
      renderSemanticFigure(
        new Scene({ seed: 11 }),
        { id: "missing", figure: "badge", title: "Missing" },
      )).toThrow(/requires a written classification/);
    expect(() =>
      renderSemanticFigure(
        new Scene({ seed: 12 }),
        { id: "wrong", figure: "card", title: "Wrong", bullets: ["no"] },
      )).toThrow(/does not accept bullets/);
  });
});

function figureSpec(figure: SemanticFigureName): SemanticFigureSpec {
  const common = {
    id: figure,
    figure,
    title: `${figure} title`,
    width: 320,
    strict: true,
  };
  if (figure === "bullets") {
    return { ...common, bullets: ["first item", "second item"] };
  }
  if (figure === "badge") {
    return { ...common, badge: "Compact class" };
  }
  return { ...common, description: "Measured short description." };
}

function texts(elements: Array<Record<string, unknown>>): string[] {
  return elements
    .filter((element) => element.type === "text")
    .map((element) => String(element.text));
}

function isFigureBadgeText(
  figure: SemanticFigureName,
  text: string,
): boolean {
  if (figure === "badge") {
    return text === "Compact class";
  }
  return FIGURE_BADGES[figure] === text;
}

function expectInside(
  inner: ReturnType<typeof elementBounds>,
  outer: ReturnType<typeof elementBounds>,
): void {
  const epsilon = 0.001;
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - epsilon);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - epsilon);
  expect(inner.right).toBeLessThanOrEqual(outer.right + epsilon);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + epsilon);
}
