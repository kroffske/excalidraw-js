import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetRegistry } from "../src/assets.js";
import { validateNativeBindings } from "../src/bindings.js";
import { Scene } from "../src/core.js";
import {
  Bounds,
  PlacedBlock,
  alignBottom,
  alignCenter,
  alignLeft,
  alignMiddle,
  alignRight,
  alignTop,
  boundsFor,
  centerIn,
} from "../src/geometry.js";
import {
  card,
  connect,
  connectRouted,
  connectSmart,
  fitPanel,
  iconPanel,
  panel,
  row,
  section,
} from "../src/layout.js";
import { nodeCard } from "../src/node.js";

describe("native binding writer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserves explicit target ownership through geometry replacements", () => {
    const scene = new Scene({ seed: 1 });
    const original = framedBlock(scene, new Bounds(10, 20, 100, 80));
    const target = original.bindingTarget;

    expect(original.withBindingTarget(target!)).toBe(original);
    expect(original.translated(5, 7).bindingTarget).toBe(target);

    const replacements = [
      centerIn(original, new Bounds(0, 0, 200, 200)),
      alignLeft(original, 10),
      alignRight(original, 300),
      alignCenter(original, 200),
      alignTop(original, 30),
      alignBottom(original, 300),
      alignMiddle(original, 200),
    ];
    for (const replacement of replacements) {
      expect(replacement.bindingTarget).toBe(target);
      expect(replacement.elements).toContain(target);
    }

    const other = scene.rect(0, 0, 20, 20);
    const stale = new PlacedBlock([other], boundsFor([other])).withBindingTarget(target!);
    expect(centerIn(stale, new Bounds(0, 0, 40, 40)).bindingTarget).toBeUndefined();
  });

  it("marks only the closed automatic target catalog", () => {
    const scene = new Scene({ seed: 2, assetRegistry: AssetRegistry.bundled() });
    const icon = iconPanel(scene, 10, 20, 220, 90, {
      title: "Runtime",
      iconId: "agent_planner",
      bullets: [],
    });
    const fitted = fitPanel(scene, new Bounds(300, 20, 120, 80), { title: "Scope" });
    const child = iconPanel(scene, 0, 0, 180, 90, {
      title: "Child",
      iconId: "tool_call",
      bullets: [],
    });
    const fittedSection = section(scene, {
      title: "Section",
      x: 480,
      y: 20,
      children: [child],
    });
    const node = nodeCard(scene, { id: "node", title: "Node", x: 800, y: 20 });
    const rawPanel = panel(scene, 0, 300, 160, 80, { title: "Panel" });
    const rawCard = card(scene, 200, 300, 180, 100, {
      iconId: "tool_call",
      title: "Card",
    });
    const aggregate = row({ icon, fitted }, { gap: 20 });

    for (const block of [icon, fitted, fittedSection, node.block]) {
      expect(block.bindingTarget?.type).toBe("rectangle");
      expect(block.elements).toContain(block.bindingTarget);
      const targetBounds = boundsFor([block.bindingTarget!]);
      expect(Math.abs(targetBounds.x - block.bounds.x)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(targetBounds.y - block.bounds.y)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(targetBounds.width - block.bounds.width)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(targetBounds.height - block.bounds.height)).toBeLessThanOrEqual(1e-6);
    }
    expect(rawPanel.bindingTarget).toBeUndefined();
    expect(rawCard.bindingTarget).toBeUndefined();
    expect(aggregate.bindingTarget).toBeUndefined();
  });

  it("emits current inside bindings and preserves unrelated reciprocals", () => {
    const scene = new Scene({ seed: 3 });
    const source = framedBlock(scene, new Bounds(0, 0, 100, 80));
    const target = framedBlock(scene, new Bounds(240, 0, 120, 100));
    const textReciprocal = { id: "bound-text", type: "text" };
    target.bindingTarget!.boundElements = [textReciprocal];

    const arrow = connect(scene, source, target, { bindings: true });

    expect(arrow.startBinding).toEqual({
      elementId: source.bindingTarget!.id,
      fixedPoint: [1, 0.5001],
      mode: "inside",
    });
    expect(arrow.endBinding).toEqual({
      elementId: target.bindingTarget!.id,
      fixedPoint: [0, 0.5001],
      mode: "inside",
    });
    expect(source.bindingTarget!.boundElements).toEqual([
      { id: arrow.id, type: "arrow" },
    ]);
    expect(target.bindingTarget!.boundElements).toEqual([
      textReciprocal,
      { id: arrow.id, type: "arrow" },
    ]);
    expect((source.bindingTarget!.boundElements as unknown[])[0])
      .not.toBe((target.bindingTarget!.boundElements as unknown[])[1]);
  });

  it("derives routed, explicit side-slot, and top-down fixed points from absolute endpoints", () => {
    const scene = new Scene({ seed: 4 });
    const source = framedBlock(scene, new Bounds(10, 20, 100, 80));
    const target = framedBlock(scene, new Bounds(280, 140, 120, 100));

    const routed = connectRouted(scene, source, target, {
      bindings: true,
      direction: "left-to-right",
      path: "orthogonal",
      from: { side: "right", slot: 0.25 },
      to: { side: "left", slot: 0.75 },
    });

    expect(routed.points.length).toBeGreaterThan(2);
    expect(routed.arrow.startBinding).toEqual({
      elementId: source.bindingTarget!.id,
      fixedPoint: [1, 0.25],
      mode: "inside",
    });
    expect(routed.arrow.endBinding).toEqual({
      elementId: target.bindingTarget!.id,
      fixedPoint: [0, 0.75],
      mode: "inside",
    });

    const upper = framedBlock(scene, new Bounds(500, 10, 100, 80));
    const lower = framedBlock(scene, new Bounds(500, 220, 100, 80));
    const vertical = connect(scene, upper, lower, {
      bindings: true,
      direction: "top-down",
      path: "straight",
    });
    expect(vertical.startBinding).toMatchObject({ fixedPoint: [0.5001, 1] });
    expect(vertical.endBinding).toMatchObject({ fixedPoint: [0.5001, 0] });
  });

  it("adds one reciprocal when both endpoints bind to the same target", () => {
    const scene = new Scene({ seed: 5 });
    const shared = framedBlock(scene, new Bounds(0, 0, 120, 80));
    const sameTarget = new PlacedBlock(shared.elements, shared.bounds)
      .withBindingTarget(shared.bindingTarget!);

    const arrow = connect(scene, shared, sameTarget, {
      bindings: true,
      from: "right",
      to: "left",
      path: "straight",
    });

    expect(shared.bindingTarget!.boundElements).toEqual([
      { id: arrow.id, type: "arrow" },
    ]);
    expect(arrow.startBinding).toMatchObject({ elementId: shared.bindingTarget!.id });
    expect(arrow.endBinding).toMatchObject({ elementId: shared.bindingTarget!.id });
  });

  it("keeps omitted and false bindings deeply identical", () => {
    const omitted = new Scene({ seed: 6 });
    const explicitFalse = new Scene({ seed: 6 });
    const omittedSource = framedBlock(omitted, new Bounds(0, 0, 100, 80));
    const omittedTarget = framedBlock(omitted, new Bounds(220, 0, 100, 80));
    const falseSource = framedBlock(explicitFalse, new Bounds(0, 0, 100, 80));
    const falseTarget = framedBlock(explicitFalse, new Bounds(220, 0, 100, 80));

    connect(omitted, omittedSource, omittedTarget, { label: "same" });
    connect(explicitFalse, falseSource, falseTarget, {
      bindings: false,
      label: "same",
    });
    connectRouted(omitted, omittedSource, omittedTarget, { label: "routed" });
    connectRouted(explicitFalse, falseSource, falseTarget, {
      bindings: false,
      label: "routed",
    });
    connectSmart(omitted, omittedSource, omittedTarget);
    connectSmart(explicitFalse, falseSource, falseTarget, {
      bindings: false,
    });

    expect(explicitFalse.toObject()).toEqual(omitted.toObject());
  });

  it.each([
    {
      name: "targetless block",
      corrupt: (scene: Scene, source: PlacedBlock) => {
        source.bindingTarget = undefined;
      },
      error: /source block has no binding target/,
    },
    {
      name: "target outside block",
      corrupt: (scene: Scene, source: PlacedBlock) => {
        source.bindingTarget = scene.rect(500, 500, 20, 20);
      },
      error: /does not belong to its block/,
    },
    {
      name: "target outside scene",
      corrupt: (_scene: Scene, source: PlacedBlock) => {
        const foreignScene = new Scene({ seed: 100 });
        source.bindingTarget = foreignScene.rect(0, 0, 100, 80);
        source.elements = [source.bindingTarget];
      },
      error: /does not belong to the current scene/,
    },
    {
      name: "unsupported target type",
      corrupt: (scene: Scene, source: PlacedBlock) => {
        const rectangle = source.bindingTarget!;
        const ellipse = scene.ellipse(
          Number(rectangle.x),
          Number(rectangle.y),
          Number(rectangle.width),
          Number(rectangle.height),
        );
        source.elements = [ellipse];
        source.bindingTarget = ellipse;
      },
      error: /type 'ellipse' is unsupported/,
    },
    {
      name: "rotated target",
      corrupt: (_scene: Scene, source: PlacedBlock) => {
        source.bindingTarget!.angle = 0.01;
      },
      error: /must have zero rotation/,
    },
    {
      name: "non-positive dimensions",
      corrupt: (_scene: Scene, source: PlacedBlock) => {
        source.bindingTarget!.width = 0;
      },
      error: /dimensions must be positive/,
    },
    {
      name: "bounds mismatch",
      corrupt: (_scene: Scene, source: PlacedBlock) => {
        source.bounds = new Bounds(
          source.bounds.x + 1.1e-6,
          source.bounds.y,
          source.bounds.width,
          source.bounds.height,
        );
      },
      error: /bounds must match its block within 1e-6/,
    },
    {
      name: "duplicate target id",
      corrupt: (scene: Scene, source: PlacedBlock) => {
        const duplicate = scene.rect(500, 500, 20, 20);
        duplicate.id = source.bindingTarget!.id;
      },
      error: /is not unique in the current scene/,
    },
  ])("fails atomically for $name", ({ corrupt, error }) => {
    const scene = new Scene({ seed: 7 });
    const source = framedBlock(scene, new Bounds(0, 0, 100, 80));
    const target = framedBlock(scene, new Bounds(220, 0, 100, 80));
    corrupt(scene, source);
    const before = structuredClone(scene.elements);

    expect(() => connect(scene, source, target, {
      bindings: true,
      label: "must not allocate",
    })).toThrow(error);
    expect(scene.elements).toEqual(before);
  });

  it("accepts a bounds delta at the documented epsilon", () => {
    const scene = new Scene({ seed: 8 });
    const source = framedBlock(scene, new Bounds(0, 0, 100, 80));
    const target = framedBlock(scene, new Bounds(220, 0, 100, 80));
    source.bounds = new Bounds(0, 0, 100 - 1e-6, 80);

    expect(() => connect(scene, source, target, { bindings: true })).not.toThrow();
  });

  it("rejects explicitly marked wrapped panels and undersized cards whose frames do not match block bounds", () => {
    const scene = new Scene({ seed: 9, assetRegistry: AssetRegistry.bundled() });
    const peer = framedBlock(scene, new Bounds(600, 0, 100, 80));
    const wrapped = panel(scene, 0, 0, 90, 30, {
      title: "first\nsecond\nthird",
    }).withBindingTarget(scene.elements.find((element) =>
      element.type === "rectangle" && element.x === 0)!);
    const undersized = card(scene, 220, 0, 120, 30, {
      iconId: "tool_call",
      title: "Too small",
    }).withBindingTarget(scene.elements.find((element) =>
      element.type === "rectangle" && element.x === 220)!);

    const beforeWrapped = structuredClone(scene.elements);
    expect(() => connect(scene, wrapped, peer, { bindings: true }))
      .toThrow(/bounds must match its block/);
    expect(scene.elements).toEqual(beforeWrapped);

    const beforeCard = structuredClone(scene.elements);
    expect(() => connect(scene, undersized, peer, { bindings: true }))
      .toThrow(/bounds must match its block/);
    expect(scene.elements).toEqual(beforeCard);
  });

  it("preserves the next deterministic element after failed preflight", () => {
    const failed = new Scene({ seed: 10 });
    const control = new Scene({ seed: 10 });
    const failedSource = framedBlock(failed, new Bounds(0, 0, 100, 80));
    const failedTarget = framedBlock(failed, new Bounds(220, 0, 100, 80));
    framedBlock(control, new Bounds(0, 0, 100, 80));
    framedBlock(control, new Bounds(220, 0, 100, 80));
    failedSource.bounds = new Bounds(0, 0, 100 + 2e-6, 80);

    expect(() => connect(failed, failedSource, failedTarget, { bindings: true }))
      .toThrow(/bounds must match its block/);

    const failedNext = failed.rect(0, 200, 20, 20);
    const controlNext = control.rect(0, 200, 20, 20);
    expect(failedNext).toEqual(controlNext);
  });

  it("retries a colliding generated arrow id before committing bindings", () => {
    const actual = new Scene({ seed: 11 });
    const probe = new Scene({ seed: 11 });
    const actualSource = framedBlock(actual, new Bounds(0, 0, 100, 80));
    const actualTarget = framedBlock(actual, new Bounds(220, 0, 100, 80));
    const probeSource = framedBlock(probe, new Bounds(0, 0, 100, 80));
    const probeTarget = framedBlock(probe, new Bounds(220, 0, 100, 80));
    const decoy = actual.rect(500, 0, 40, 40);
    probe.rect(500, 0, 40, 40);
    const collidingId = connect(probe, probeSource, probeTarget).id;
    decoy.id = collidingId;

    const arrow = connect(actual, actualSource, actualTarget, {
      bindings: true,
    });

    expect(arrow.id).not.toBe(collidingId);
    expect(actual.elements.filter((element) => element.id === arrow.id)).toHaveLength(1);
    expect(validateNativeBindings(actual.elements)).toEqual({
      valid: true,
      issues: [],
    });
  });
});

function framedBlock(scene: Scene, bounds: Bounds): PlacedBlock {
  const frame = scene.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  return new PlacedBlock([frame], bounds).withBindingTarget(frame);
}
