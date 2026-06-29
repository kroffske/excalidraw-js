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

  it("renders title-only icon panels without an empty bullet area", () => {
    const scene = new Scene({ seed: 38, assetRegistry: AssetRegistry.bundled() });
    const panel = layout.iconPanel(scene, 10, 20, 220, 80, {
      title: "PlanState",
      iconId: "agent_planner",
      bullets: [],
    });

    const textElements = panel.elements.filter((element) => element.type === "text");
    const imageElement = panel.elements.find((element) => element.type === "image");

    expect(textElements).toHaveLength(1);
    expect(textElements[0]?.text).toBe("PlanState");
    expect(textElements[0]?.textAlign).toBe("center");
    expect(imageElement?.x).toBeCloseTo(10 + (220 - 58) / 2);
  });

  it("fits section panels around real child bounds and keeps children below the header", () => {
    const scene = new Scene({ seed: 47 });
    const childRect = scene.rect(0, 0, 80, 40);
    const child = new layout.PlacedBlock([childRect], boundsFor([childRect]));
    const section = layout.section(scene, {
      title: "Container",
      x: 100,
      y: 120,
      padding: 20,
      titleHeight: 44,
      headerGap: 10,
      minWidth: 180,
      minHeight: 120,
      children: [child],
    });

    const frame = section.elements.find((element) => element.type === "rectangle" && element !== childRect);
    const title = section.elements.find((element) => element.type === "text");
    const headerBottom = 120 + 20 + 44 + 10;

    expect(frame?.x).toBe(100);
    expect(frame?.y).toBe(120);
    expect(frame?.width).toBeGreaterThanOrEqual(180);
    expect(frame?.height).toBeGreaterThanOrEqual(120);
    expect(title?.y).toBeGreaterThanOrEqual(120);
    expect(child.bounds.left).toBeGreaterThanOrEqual(100 + 20);
    expect(child.bounds.top).toBeGreaterThanOrEqual(headerBottom);
    expect(Number(frame?.x) + Number(frame?.width)).toBeGreaterThanOrEqual(child.bounds.right + 20);
    expect(Number(frame?.y) + Number(frame?.height)).toBeGreaterThanOrEqual(child.bounds.bottom + 20);
    expect(scene.elements.indexOf(frame!)).toBeLessThan(scene.elements.indexOf(childRect));
    expect(frame?.groupIds).toEqual(childRect.groupIds);
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

  it("builds measured top-down trees from data", () => {
    const scene = new Scene({ seed: 41, assetRegistry: AssetRegistry.bundled() });
    const diagram = layout.tree(scene, {
      root: {
        id: "state",
        title: "sharedState (in-memory singleton)",
        iconId: "memory_database",
        bullets: ["goal", "plan", "loop", "todos", "agents", "toolPreset"],
        children: [
          {
            id: "plan",
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
          },
          {
            id: "loop",
            title: "loop (LoopState)",
            iconId: "model_refresh",
            bullets: ["policy", "turns", "toolCalls", "active"],
          },
        ],
      },
    }, {
      x: 60,
      y: 80,
      nodeWidth: 260,
      nodeHeight: 120,
      levelGap: 72,
      siblingGap: 44,
    });

    expect(Object.keys(diagram.nodes)).toEqual(["state", "plan", "loop"]);
    expect(diagram.primaryEdges.map((edge) => [edge.from, edge.to])).toEqual([["state", "plan"], ["state", "loop"]]);
    expect(diagram.primaryConnectors).toHaveLength(2);
    expect(diagram.nodes.state.bounds.height).toBeGreaterThan(120);
    expect(diagram.nodes.plan.bounds.top - diagram.nodes.state.bounds.bottom).toBeGreaterThanOrEqual(72 - 1e-6);
    expect(diagram.nodes.loop.bounds.left).toBeGreaterThan(diagram.nodes.plan.bounds.right);
    expect(diagram.bounds.width).toBeGreaterThan(diagram.nodes.state.bounds.width);

    const verticalTrunk = absoluteElementPoints(diagram.primaryConnectors[0]);
    const horizontalTrunk = absoluteElementPoints(diagram.primaryConnectors[1]);
    const [firstArrowStart] = absoluteElementPoints(diagram.primaryEdges[0].arrow);
    const [secondArrowStart] = absoluteElementPoints(diagram.primaryEdges[1].arrow);

    expect(verticalTrunk[0][0]).toBeCloseTo(diagram.nodes.state.bounds.centerX);
    expect(horizontalTrunk[0][1]).toBeCloseTo(horizontalTrunk[1][1]);
    expect(firstArrowStart[1]).toBeCloseTo(horizontalTrunk[0][1]);
    expect(secondArrowStart[1]).toBeCloseTo(horizontalTrunk[0][1]);
  });

  it("builds compact left-to-right trees with tight leaf spacing", () => {
    const scene = new Scene({ seed: 50, assetRegistry: AssetRegistry.bundled() });
    const spec = {
      root: {
        id: "root",
        title: "Advanced LLM Architectures",
        iconId: "brain_ai",
        children: [
          {
            id: "domain",
            title: "LLM Domain Adaptation",
            iconId: "model_training",
            children: [
              { id: "cpt", title: "CPT", iconId: "model_refresh" },
              { id: "sft", title: "SFT", iconId: "human_review" },
              { id: "lora", title: "LoRA", iconId: "optimization_sliders" },
            ],
          },
          {
            id: "retrieval",
            title: "Text Search Systems",
            iconId: "rag_retriever",
            children: [
              { id: "bm25", title: "Full-text", iconId: "filter_funnel" },
              { id: "vector", title: "Vector", iconId: "embedding_vector" },
            ],
          },
        ],
      },
    };

    const plan = layout.planTreeLayout(spec, { x: 80, y: 80, siblingGap: 72, leafGap: 14 }, "left-right-tree");
    const diagram = layout.horizontalTree(scene, spec, plan.options);

    expect(plan.family).toBe("horizontal-tree");
    expect(diagram.primaryEdges.map((edge) => [edge.from, edge.to])).toEqual([
      ["root", "domain"],
      ["domain", "cpt"],
      ["domain", "sft"],
      ["domain", "lora"],
      ["root", "retrieval"],
      ["retrieval", "bm25"],
      ["retrieval", "vector"],
    ]);
    expect(diagram.nodes.domain.bounds.left).toBeGreaterThan(diagram.nodes.root.bounds.right);
    expect(diagram.nodes.cpt.bounds.left).toBeGreaterThan(diagram.nodes.domain.bounds.right);
    expect(diagram.nodes.sft.bounds.top - diagram.nodes.cpt.bounds.bottom).toBeCloseTo(14);
    expect(diagram.nodes.lora.bounds.top - diagram.nodes.sft.bounds.bottom).toBeCloseTo(14);
    expect(diagram.nodes.retrieval.bounds.top - diagram.nodes.domain.bounds.bottom).toBeGreaterThanOrEqual(72 - 1e-6);
    expect(diagram.nodes.domain.bounds.centerY).toBeCloseTo(
      (diagram.nodes.cpt.bounds.centerY + diagram.nodes.lora.bounds.centerY) / 2,
    );
    expect(diagram.nodes.root.bounds.centerY).toBeCloseTo(
      (diagram.nodes.cpt.bounds.top + diagram.nodes.vector.bounds.bottom) / 2,
    );
    expect(diagram.bounds.width).toBeGreaterThan(diagram.bounds.height);
  });

  it("routes secondary tree edges through outer lanes", () => {
    const scene = new Scene({ seed: 42, assetRegistry: AssetRegistry.bundled() });
    const diagram = layout.tree(scene, {
      root: {
        id: "session",
        title: "Session",
        iconId: "memory_database",
        bullets: ["shared state"],
        children: [
          {
            id: "plan",
            title: "plan",
            iconId: "agent_planner",
            bullets: ["tasks"],
          },
          {
            id: "persistence",
            title: "Pi Persistence",
            iconId: "historical_database",
            bullets: ["goal-state", "loop-state"],
          },
          {
            id: "hook",
            title: "session_start hook",
            iconId: "tool_call",
            bullets: ["restores state"],
          },
        ],
      },
      secondaryEdges: [
        {
          from: "hook",
          to: "plan",
          kind: "feedback",
          label: "restore",
          lane: "rightOuter",
        },
      ],
    }, {
      x: 80,
      y: 80,
      nodeWidth: 240,
      nodeHeight: 120,
      levelGap: 72,
      siblingGap: 42,
    });

    const [edge] = diagram.secondaryEdges;
    const points = absoluteElementPoints(edge.arrow);

    expect(diagram.secondary_edges).toBe(diagram.secondaryEdges);
    expect(edge.from).toBe("hook");
    expect(edge.to).toBe("plan");
    expect(edge.kind).toBe("feedback");
    expect(edge.lane).toBe("rightOuter");
    expect(edge.arrow.strokeStyle).toBe("dashed");
    expect(edge.label?.type).toBe("text");
    expect(points.some(([pointX]) => pointX > diagram.nodes.hook.bounds.right)).toBe(true);
    expect(polylineIntersectsBounds(points, inflateBounds(diagram.nodes.persistence.bounds, 4))).toBe(false);
  });

  it("routes cross-level secondary tree edges through side lanes instead of below the whole tree", () => {
    const scene = new Scene({ seed: 45, assetRegistry: AssetRegistry.bundled() });
    const diagram = layout.tree(scene, {
      root: {
        id: "pack",
        title: "Durable Pack JSON",
        iconId: "schema_registry",
        bullets: ["factProvenance"],
        children: [
          {
            id: "grounding",
            title: "GroundingTopic data",
            iconId: "rag_retriever",
            bullets: ["selected facts"],
            children: [
              {
                id: "llm",
                title: "Transient LLM JSON",
                iconId: "llm_chat",
                bullets: ["question array"],
                children: [
                  {
                    id: "validated",
                    title: "Validated Question",
                    iconId: "data_quality_check",
                    bullets: ["bank id + evidence"],
                  },
                ],
              },
            ],
          },
        ],
      },
      secondaryEdges: [
        {
          from: "pack",
          to: "validated",
          kind: "provenance",
          label: "evidence",
          lane: "rightOuter",
        },
      ],
    }, {
      x: 80,
      y: 80,
      nodeWidth: 280,
      nodeHeight: 120,
      levelGap: 72,
    });

    const [edge] = diagram.secondaryEdges;
    const points = absoluteElementPoints(edge.arrow);
    const maxY = Math.max(...points.map(([, pointY]) => pointY));

    expect(edge.lane).toBe("rightOuter");
    expect(maxY).toBeLessThanOrEqual(diagram.nodes.validated.bounds.centerY + 1e-6);
    expect(points.some(([pointX]) => pointX > diagram.nodes.pack.bounds.right)).toBe(true);
    expect(polylineIntersectsBounds(points, inflateBounds(diagram.nodes.grounding.bounds, 4))).toBe(false);
    expect(polylineIntersectsBounds(points, inflateBounds(diagram.nodes.llm.bounds, 4))).toBe(false);
  });

  it("plans long linear tree specs as wrapped process flows", () => {
    const scene = new Scene({ seed: 46, assetRegistry: AssetRegistry.bundled() });
    const spec = {
      root: {
        id: "docs",
        title: "User documents",
        iconId: "news_document",
        bullets: [".txt / .md files"],
        children: [
          {
            id: "wiki",
            title: "Editable wiki layer",
            iconId: "knowledge_graph",
            bullets: ["markdown pages"],
            children: [
              {
                id: "build",
                title: "Build runtime Pack",
                iconId: "etl_pipeline_dag",
                bullets: ["PackCompiler.compile"],
                children: [
                  {
                    id: "pack",
                    title: "Durable Pack JSON",
                    iconId: "schema_registry",
                    bullets: ["topics, facts"],
                    children: [
                      {
                        id: "grounding",
                        title: "GroundingTopic data",
                        iconId: "rag_retriever",
                        bullets: ["selected facts"],
                        children: [
                          {
                            id: "llm",
                            title: "Transient LLM JSON",
                            iconId: "llm_chat",
                            bullets: ["question array"],
                            children: [
                              {
                                id: "question",
                                title: "Validated Question",
                                iconId: "data_quality_check",
                                bullets: ["quality gate"],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const plan = layout.planTreeLayout(spec, { x: 80, y: 120, nodeWidth: 280 }, "auto");
    const diagram = layout.processFlow(scene, spec, plan.options);

    expect(plan.family).toBe("process-flow");
    expect(plan.options.nodeWidth).toBeGreaterThanOrEqual(340);
    expect(diagram.primaryEdges).toHaveLength(6);
    expect(diagram.nodes.pack.bounds.top).toBeCloseTo(diagram.nodes.docs.bounds.top);
    expect(diagram.nodes.grounding.bounds.top).toBeGreaterThan(diagram.nodes.pack.bounds.bottom);
    expect(diagram.nodes.question.bounds.top).toBeCloseTo(diagram.nodes.grounding.bounds.top);
    expect(diagram.bounds.width).toBeGreaterThan(diagram.bounds.height);
  });

  it("places sidecar notes outside the primary tree body", () => {
    const scene = new Scene({ seed: 43, assetRegistry: AssetRegistry.bundled() });
    const diagram = layout.tree(scene, {
      root: {
        id: "session",
        title: "Session",
        iconId: "memory_database",
        bullets: ["shared state"],
        children: [
          {
            id: "plan",
            title: "plan",
            iconId: "agent_planner",
            bullets: ["tasks"],
          },
          {
            id: "loop",
            title: "loop",
            iconId: "model_refresh",
            bullets: ["turns"],
          },
        ],
      },
      sidecars: [
        {
          id: "restore-note",
          attachTo: "loop",
          side: "right",
          title: "Session hook",
          bullets: ["Restores loop state", "Avoids noisy reverse arrow"],
        },
      ],
    }, {
      x: 80,
      y: 80,
      nodeWidth: 240,
      nodeHeight: 120,
      levelGap: 72,
      siblingGap: 42,
    });

    const primaryBounds = boundsFor(Object.values(diagram.nodes).flatMap((block) => block.elements));
    const sidecar = diagram.sidecars["restore-note"];

    expect(sidecar.bounds.width).toBeGreaterThan(0);
    expect(sidecar.bounds.height).toBeGreaterThan(0);
    expect(sidecar.bounds.left).toBeGreaterThan(primaryBounds.right);
    expect(sidecar.bounds.left).toBeGreaterThan(diagram.nodes.loop.bounds.right);
    expect(sidecar.bounds.right).toBeLessThanOrEqual(diagram.bounds.right);
    expect(diagram.sidecarConnectors).toHaveLength(1);
    expect(diagram.sidecar_connectors).toBe(diagram.sidecarConnectors);
  });

  it("keeps routed overlays out of a reserved top title band", () => {
    const scene = new Scene({ seed: 48, assetRegistry: AssetRegistry.bundled() });
    const left = layout.iconPanel(scene, 100, 140, 220, 120, {
      title: "left",
      iconId: "agent_planner",
      bullets: ["target"],
    });
    const right = layout.iconPanel(scene, 420, 140, 220, 120, {
      title: "right",
      iconId: "model_refresh",
      bullets: ["source"],
    });
    const primaryBounds = boundsFor([...left.elements, ...right.elements]);
    const [edge] = layout.routeEdges(scene, {
      nodes: { left, right },
      bounds: primaryBounds,
    }, [
      { from: "right", to: "left", kind: "feedback", label: "restore", lane: "rightOuter" },
    ], {
      gutter: 48,
      reservedTopBand: 120,
    });
    const points = absoluteElementPoints(edge.arrow);

    expect(Math.min(...points.map(([, pointY]) => pointY))).toBeGreaterThanOrEqual(120);
    expect(Math.max(...points.map(([, pointY]) => pointY))).toBeGreaterThan(primaryBounds.bottom);
    expect(edge.label?.y).toBeGreaterThan(primaryBounds.bottom);
  });

  it("moves top process-flow sidecars below the diagram when the reserved top band is full", () => {
    const scene = new Scene({ seed: 49, assetRegistry: AssetRegistry.bundled() });
    const diagram = layout.processFlow(scene, {
      root: {
        id: "source",
        title: "Source",
        iconId: "api_connector",
        bullets: ["input"],
        children: [
          {
            id: "target",
            title: "Target",
            iconId: "model_deployment",
            bullets: ["output"],
          },
        ],
      },
      sidecars: [
        {
          id: "note",
          attachTo: "source",
          side: "auto",
          title: "Title-safe note",
          bullets: ["starts below reserved band"],
        },
      ],
    }, {
      x: 80,
      y: 130,
      nodeWidth: 220,
      nodeHeight: 120,
      columns: 2,
      reservedTopBand: 120,
    });

    const note = diagram.sidecars.note;

    expect(note.bounds.top).toBeGreaterThanOrEqual(120);
    expect(note.bounds.top).toBeGreaterThan(diagram.nodes.source.bounds.bottom);
  });

  it("detects reverse hook arrows crossing protected panel bounds", () => {
    const scene = new Scene({ seed: 38, assetRegistry: AssetRegistry.bundled() });
    const plan = layout.iconPanel(scene, 340, 280, 260, 260, {
      title: "plan (PlanState)",
      iconId: "agent_planner",
      bullets: ["active", "executionApproved", "tasks", "raw"],
    });
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
    expect(polylineIntersectsBounds(absolutePoints, inflateBounds(plan.bounds, 4))).toBe(true);
  });

  it("builds a simple tree diagram from Mermaid text", () => {
    const scene = new Scene({ seed: 36 });
    const diagram = layout.fromMermaid(scene, `
      graph TD
        A["Root"] --> B["Left child"]
        A --> C["Right child"]
        B --> D["Leaf"]
    `, { x: 200, y: 20 });

    expect(Object.keys(diagram.nodes)).toEqual(["A", "B", "C", "D"]);
    expect(diagram.arrows).toHaveLength(3);
    expect(String(diagram.nodes.A.elements.find((element) => element.type === "text")?.text)).toBe("Root");
    expect(String(diagram.nodes.B.elements.find((element) => element.type === "text")?.text)).toBe("Left child");
    expect(diagram.nodes.B.bounds.top).toBeGreaterThan(diagram.nodes.A.bounds.bottom);
    expect(diagram.nodes.D.bounds.top).toBeGreaterThan(diagram.nodes.B.bounds.bottom);
  });

  it("imports Mermaid tree scenarios with secondary dotted edges", () => {
    const scene = new Scene({ seed: 44, assetRegistry: AssetRegistry.bundled() });
    const diagram = layout.fromMermaid(scene, `
      graph TD
        Session["Session"] --> Plan["plan"]
        Session --> Loop["loop"]
        Loop -. restores .-> Plan
    `, {
      scenario: "tree",
      x: 60,
      y: 90,
      nodeWidth: 240,
      nodeHeight: 120,
      icons: {
        Session: "memory_database",
        Plan: "agent_planner",
        Loop: "model_refresh",
      },
    });

    const secondaryEdges = diagram.secondaryEdges ?? [];

    expect(diagram.primaryEdges?.map((edge) => [edge.from, edge.to])).toEqual([["Session", "Plan"], ["Session", "Loop"]]);
    expect(secondaryEdges).toHaveLength(1);
    expect(secondaryEdges[0].from).toBe("Loop");
    expect(secondaryEdges[0].to).toBe("Plan");
    expect(secondaryEdges[0].label?.type).toBe("text");
    expect(secondaryEdges[0].kind).toBe("feedback");
    expect(diagram.arrows).toHaveLength(3);
    expect(diagram.nodes.Plan.bounds.top).toBeGreaterThan(diagram.nodes.Session.bounds.bottom);
  });
});

function absoluteElementPoints(element: Record<string, unknown>): PointTuple[] {
  const x = Number(element.x ?? 0);
  const y = Number(element.y ?? 0);
  const points = element.points as PointTuple[];
  return points.map(([pointX, pointY]) => [x + pointX, y + pointY]);
}
