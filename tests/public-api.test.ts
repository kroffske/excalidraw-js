import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AssetRegistry, Bounds, Scene, TextStyle, layout } from "../src/index.js";
import { PointTuple, boundsFor, inflateBounds, polylineIntersectsBounds, translate } from "../src/geometry.js";

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

  it("grows icon panels to contain explicit multiline bullet text", () => {
    const scene = new Scene({ seed: 33, assetRegistry: AssetRegistry.bundled() });
    const panel = layout.iconPanel(scene, 10, 20, 220, 80, {
      title: "State",
      iconId: "memory_database",
      bullets: [
        "executionApproved\nis explicit multiline",
        "before_agent_start\ncontext is multiline",
        "todo:update dev event",
      ],
      bulletSize: 13,
      bulletGap: 18,
    });
    const rectangle = panel.elements.find((element) => element.type === "rectangle");
    const multilineText = panel.elements.find((element) => element.type === "text" && String(element.text).includes("\n"));

    expect(rectangle?.height).toBeGreaterThan(80);
    expect(rectangle?.y).toBe(20);
    expect((rectangle?.y ?? 0) + (rectangle?.height ?? 0)).toBeGreaterThanOrEqual(panel.bounds.bottom - 1e-6);
    expect(String(multilineText?.text)).toContain("\n");
  });

  it("measures collapsed gaps after icon panels auto-grow", () => {
    const scene = new Scene({ seed: 37, assetRegistry: AssetRegistry.bundled() });
    const root = layout.iconPanel(scene, 360, 90, 240, 140, {
      title: "sharedState (in-memory singleton)",
      iconId: "memory_database",
      bullets: ["goal", "plan", "loop", "todos", "agents", "toolPreset"],
    });
    const child = layout.iconPanel(scene, 340, 280, 260, 260, {
      title: "plan (PlanState)",
      iconId: "agent_planner",
      bullets: [
        "active: boolean",
        "executionApproved: boolean",
        "tasks: PlanTask[]",
        "raw: string | null",
        "PlanTask:",
        "index, text, status",
      ],
    });

    const gap = child.bounds.top - root.bounds.bottom;

    expect(root.bounds.height).toBeGreaterThan(140);
    expect(gap).toBeLessThan(32);
  });

  it("does not insert automatic bullet line breaks", () => {
    const scene = new Scene({ seed: 34, assetRegistry: AssetRegistry.bundled() });
    const list = layout.bulletList(scene, 0, 0, ["executionApproved intentionally stays on one line"], {
      width: 60,
      textSize: 13,
    });
    const bullet = list.elements.find((element) => element.type === "text");

    expect(String(bullet?.text)).toBe("- executionApproved intentionally stays on one line");
  });

  it("routes top-down connections from bottom edge to top edge", () => {
    const scene = new Scene({ seed: 35, assetRegistry: AssetRegistry.bundled() });
    const parent = layout.iconWithLabel(scene, "agent_planner", 100, 10, { label: "Parent", iconSize: 40 });
    const child = layout.iconWithLabel(scene, "tool_call", 20, 150, { label: "Child", iconSize: 40 });
    const arrow = layout.connect(scene, parent, child, { direction: "top-down", path: "orthogonal" });

    const points = arrow.points as Array<[number, number]>;
    expect(points).toHaveLength(4);
    expect(Number(arrow.x) + points[0][0]).toBeCloseTo(parent.bounds.centerX);
    expect(Number(arrow.y) + points[0][1]).toBeCloseTo(parent.bounds.bottom);
    expect(Number(arrow.x) + points.at(-1)![0]).toBeCloseTo(child.bounds.centerX);
    expect(Number(arrow.y) + points.at(-1)![1]).toBeCloseTo(child.bounds.top);
  });

  it("routes connections through explicit side slots", () => {
    const scene = new Scene({ seed: 39 });
    const source = new Bounds(10, 20, 100, 80);
    const target = new Bounds(220, 60, 120, 100);
    const left = new layout.PlacedBlock([scene.rect(source.x, source.y, source.width, source.height)], source);
    const right = new layout.PlacedBlock([scene.rect(target.x, target.y, target.width, target.height)], target);
    const arrow = layout.connect(scene, left, right, {
      from: { side: "right", slot: 0.25 },
      to: { side: "left", slot: 0.75 },
    });

    const points = absoluteElementPoints(arrow);
    expect(points[0]).toEqual([source.right, source.top + source.height * 0.25]);
    expect(points.at(-1)).toEqual([target.left, target.top + target.height * 0.75]);
  });

  it("uses edge kind to style feedback arrows by default", () => {
    const scene = new Scene({ seed: 40 });
    const source = layout.iconWithLabel(scene, "monitoring_dashboard", 0, 0, { label: "Monitor" });
    const target = layout.iconWithLabel(scene, "model_refresh", 180, 0, { label: "Refresh" });
    const arrow = layout.connect(scene, source, target, { kind: "feedback" });

    expect(arrow.strokeStyle).toBe("dashed");
  });

  it("detects reverse hook arrows crossing protected panel bounds", () => {
    const scene = new Scene({ seed: 38, assetRegistry: AssetRegistry.bundled() });
    const persistence = layout.iconPanel(scene, 360, 580, 240, 140, {
      title: "Pi Persistence",
      iconId: "historical_database",
      bullets: ["goal-state entries", "loop-state entries", "Restored on session_start"],
    });
    layout.iconWithLabel(scene, "tool_call", 560, 800, { label: "tool_call" });
    const arrow = scene.arrow([
      [592, 800],
      [592, 670],
      [470, 670],
      [470, 540],
    ]);
    const absolutePoints = absoluteElementPoints(arrow);

    expect(polylineIntersectsBounds(absolutePoints, inflateBounds(persistence.bounds, 4))).toBe(true);
  });
});

function absoluteElementPoints(element: Record<string, unknown>): PointTuple[] {
  const x = Number(element.x ?? 0);
  const y = Number(element.y ?? 0);
  const points = element.points as PointTuple[];
  return points.map(([pointX, pointY]) => [x + pointX, y + pointY]);
}
