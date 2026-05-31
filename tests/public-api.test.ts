import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AssetRegistry, Bounds, Scene, TextStyle, layout } from "../src/index.js";
import { boundsFor, translate } from "../src/geometry.js";

describe("scene API", () => {
  it("serializes deterministic Excalidraw scenes", () => {
    const first = new Scene({ seed: 5 });
    const second = new Scene({ seed: 5 });

    const firstRect = first.rect(0, 0, 100, 80);
    const secondRect = second.rect(0, 0, 100, 80);
    first.text(10, 12, "Hello", { width: 80, align: "center" });

    expect(firstRect.id).toBe(secondRect.id);
    expect(first.toObject().type).toBe("excalidraw");
    expect(first.toJson()).toContain("\"elements\"");
  });

  it("embeds bundled SVG assets", () => {
    const registry = AssetRegistry.bundled();
    const scene = new Scene({ seed: 1, assetRegistry: registry });
    const element = scene.placeAsset("agents_robot_agent_01-01", 10, 20, 64);

    expect(element.type).toBe("image");
    expect(Object.values(scene.files)).toHaveLength(1);
    expect(Object.values(scene.files)[0]?.dataURL).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("supports text styles, lines, groups, and writes files", () => {
    const scene = new Scene({ seed: 11, background: "#fafafa" });
    const style = new TextStyle({ size: 42, color: "#123456", align: "right", lineHeight: 1.5 });
    const text = scene.text(0, 0, "styled", { size: 8, color: "#000000", align: "left", style });
    const line = scene.line([[50, 50], [150, 90]]);
    const arrow = scene.arrow([[0, 0], [200, 0]]);
    const a = scene.rect(0, 100, 10, 10);
    const b = scene.rect(20, 100, 10, 10);
    const block = scene.group([a, b]);

    expect(text.fontSize).toBe(42);
    expect(text.strokeColor).toBe("#123456");
    expect(line.points).toEqual([[0, 0], [100, 40]]);
    expect(arrow.endArrowhead).toBe("arrow");
    expect(a.groupIds).toEqual(b.groupIds);
    expect(block.bounds.width).toBe(30);
    expect(scene.toObject().appState.viewBackgroundColor).toBe("#fafafa");

    const root = mkdtempSync(join(tmpdir(), "excalidraw-scene-"));
    const out = join(root, "nested", "scene.excalidraw");
    scene.write(out);
    expect(JSON.parse(readFileSync(out, "utf8")).type).toBe("excalidraw");
  });
});

describe("assets", () => {
  it("loads bundled assets and lookup aliases", () => {
    const registry = AssetRegistry.bundled();
    const expected = "agents_robot_agent_01-01";

    expect(registry.ids()).toContain(expected);
    expect(registry.resolve("robot_agent").id).toBe(expected);
    expect(registry.resolve("01-01").id).toBe(expected);
    expect(registry.resolveGroup("agents", "robot agent").id).toBe(expected);
    expect(registry.resolveIndex(1, 1).id).toBe(expected);
    expect(() => registry.resolve("missing_icon")).toThrow(/Unknown asset id 'missing_icon'.*agents_robot_agent/s);
  });

  it("loads trading and custom asset registries", () => {
    const trading = AssetRegistry.bundled("trading");
    expect(trading.resolve("bull").id).toMatch(/^trading_bull_/);

    const root = mkdtempSync(join(tmpdir(), "excalidraw-assets-"));
    writeFileSync(join(root, "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>", "utf8");
    const registry = AssetRegistry.fromDirectory(root);
    expect(registry.ids()).toEqual(["logo"]);
  });
});

describe("layout and geometry", () => {
  it("returns blocks with finite bounds and connects them", () => {
    const scene = new Scene({ seed: 2, assetRegistry: AssetRegistry.bundled() });
    const left = layout.iconWithLabel(scene, "robot_agent", 0, 0, { label: "Agent" });
    const right = layout.iconWithLabel(scene, "tool_call", 160, 0, { label: "Tool" });
    const arrow = layout.connect(scene, left, right);
    const centered = layout.centerIn(left, new Bounds(0, 0, 300, 200));

    expect(left.bounds.width).toBeGreaterThan(0);
    expect(arrow.type).toBe("arrow");
    expect(centered.bounds.centerX).toBeCloseTo(150);
  });

  it("translates and distributes blocks", () => {
    const elements = [
      { x: 10, y: 10, width: 20, height: 30 },
      { x: 50, y: 60, width: 10, height: 5 },
    ];
    translate(elements, 5, -5);
    const bounds = boundsFor(elements);
    expect([bounds.left, bounds.top, bounds.right, bounds.bottom]).toEqual([15, 5, 65, 60]);

    const scene = new Scene({ seed: 22, assetRegistry: AssetRegistry.bundled() });
    const a = layout.iconWithLabel(scene, "robot_agent", 0, 0, { label: "A", iconSize: 40 });
    const b = layout.iconWithLabel(scene, "tool_call", 0, 0, { label: "B", iconSize: 40 });
    const [placedA, placedB] = layout.distributeHorizontal([a, b], 100, 50, { gap: 20 });
    expect(boundsFor(a.elements).left).toBeCloseTo(100);
    expect(boundsFor(a.elements).top).toBeCloseTo(50);
    expect(a.bounds.left).toBeCloseTo(100);
    expect(a.bounds.top).toBeCloseTo(50);
    expect(placedA).toBe(a);
    expect(placedB).toBe(b);
    expect(b.bounds.left).toBeGreaterThanOrEqual(a.bounds.left + a.bounds.width + 20 - 1e-6);
    expect(boundsFor(b.elements).left).toBeGreaterThanOrEqual(boundsFor(a.elements).left + a.bounds.width + 20 - 1e-6);

    const c = layout.iconWithLabel(scene, "model_training", 0, 0, { label: "C", iconSize: 40 });
    const d = layout.iconWithLabel(scene, "model_validation", 0, 0, { label: "D", iconSize: 40 });
    layout.distributeVertical([c, d], 20, 90, { gap: 30 });
    expect(c.bounds.left).toBeCloseTo(20);
    expect(c.bounds.top).toBeCloseTo(90);
    expect(d.bounds.top).toBeGreaterThanOrEqual(c.bounds.top + c.bounds.height + 30 - 1e-6);
  });
});
