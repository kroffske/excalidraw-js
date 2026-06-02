# API Reference

Use this when you need method names, supported arguments, or the expected composition style.

## Imports

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";
```

Optional constants:

```ts
import { BLUE, GRAY, GREEN, LIGHT_GRAY, RED, TextStyle } from "@kroffske/excalidraw-diagrams";
```

## Scene

`new Scene({ seed: 7, assetRegistry: null, background: "#ffffff" })`

Core primitives:

- `scene.rect(x, y, w, h, { color: BLUE, strokeWidth: 2, dashed: false })`
- `scene.ellipse(x, y, w, h, { color: BLUE, strokeWidth: 2 })`
- `scene.line(points, { color: BLUE, strokeWidth: 2, dashed: false })`
- `scene.arrow(points, { color: BLUE, strokeWidth: 2, dashed: false })`
- `scene.text(x, y, content, { size: 18, color: BLUE, width, align: "left", valign: "top", style })`

SVG and bundled assets:

- `scene.embedSvg(path, x, y, w, h)`
- `scene.placeAsset(iconId, x, y, size, { registry })`
- `scene.placeAssetRect(iconId, x, y, w, h, { registry })`

Serialization:

- `scene.toObject()`
- `scene.toJson({ indent: 2 })`
- `scene.write(path)`

Grouping and bounds:

- `scene.bounds(elements=None)`
- `scene.group(elements)`

## AssetRegistry

Two bundled packs ship as package data:

- `AssetRegistry.bundled()` — default `core` pack (neutral `agents` + `data` groups, 64 icons).
- `AssetRegistry.bundled("trading")` — thematic fintech pack (64 icons in a single `trading` group).

```ts
const core = AssetRegistry.bundled();
core.ids();
core.groups();
core.resolve("robot_agent");
core.resolveGroup("agents", "robot_agent");
core.resolveIndex(1, 1);

const trading = AssetRegistry.bundled("trading");
trading.resolve("bull");
```

Use `core.ids().length` for counts and `core.ids()` for iteration. Do not call
`core.size` or `core.keys()`; those are not part of the API.

Custom assets:

```ts
const registry = AssetRegistry.fromDirectory("my-icons/svg");
registry.register("company_logo", "brand/logo.svg");
```

## Layout Helpers

Most helpers return `PlacedBlock(elements, bounds)`.

- `layout.iconWithLabel(scene, iconId, x, y, { label: "...", iconSize: 64 })`
- `layout.iconTextRow(scene, iconId, x, y, text, { iconSize: 32, textWidth: 150 })`
- `layout.iconTextList(scene, rows, x, y, { rowGap: 42 })`
- `layout.bulletList(scene, x, y, items, { width: 220 })`
- `layout.panel(scene, x, y, w, h, { title: null })`
- `layout.card(scene, x, y, w, h, { iconId: "...", title: "...", description: "" })`
- `layout.iconPanel(scene, x, y, w, h, { title: "...", iconId: "...", bullets: [...] })`
- `layout.tree(scene, { root, secondaryEdges, sidecars }, { x, y, nodeWidth, levelGap, siblingGap })`
- `layout.routeEdges(scene, diagram, secondaryEdges, { gutter: 48 })`
- `layout.distributeHorizontal(blocks, x, y, { gap: 20 })`
- `layout.distributeVertical(blocks, x, y, { gap: 20 })`
- `layout.connect(scene, source, target, { direction: "left-to-right", path: "orthogonal" })`
- `layout.connectSmart(scene, source, target)`
- `layout.fromMermaid(scene, mermaidText, { x: 0, y: 0, direction: "TD", scenario: "draft" })`
- `layout.alignLeft/right/center/top/bottom/middle(...)`
- `layout.centerIn(block, bounds)`

`layout.connect(scene, source, target)` keeps the old left-to-right straight
arrow by default. For readable trees and branching diagrams, prefer explicit
direction and orthogonal routing:

```ts
layout.connect(scene, parent, child, {
  direction: "top-down",
  path: "orthogonal",
});

layout.connect(scene, left, right, {
  direction: "left-to-right",
  path: "orthogonal",
});
```

Connection directions choose edge anchors:

- `top-down` / `td`: source bottom edge to target top edge.
- `bottom-up` / `bt`: source top edge to target bottom edge.
- `left-to-right` / `lr`: source right edge to target left edge.
- `right-to-left` / `rl`: source left edge to target right edge.

Use `layout.connectSmart(scene, source, target)` after placing blocks when the
helper should infer the direction from relative positions. Use `from` and `to`
when you need exact sides:

```ts
layout.connect(scene, source, target, {
  from: "bottom",
  to: "top",
  path: "orthogonal",
});
```

## Tree Layout

Use `layout.tree(...)` when an agent should describe a top-down hierarchy as
data instead of hand-placing every node. The helper creates measured
`iconPanel` nodes, computes row heights and subtree widths, then connects
parent/child relations as primary top-down edges.

```ts
const diagram = layout.tree(scene, {
  root: {
    id: "session",
    title: "Session",
    iconId: "memory_database",
    bullets: ["shared state"],
    children: [
      { id: "plan", title: "plan", iconId: "agent_planner", bullets: ["tasks"] },
      { id: "loop", title: "loop", iconId: "model_refresh", bullets: ["turns"] },
    ],
  },
  secondaryEdges: [
    { from: "loop", to: "plan", kind: "feedback", label: "restore", lane: "rightOuter" },
  ],
  sidecars: [
    { id: "hook-note", attachTo: "loop", side: "right", title: "hook", bullets: ["restores state"] },
  ],
}, { x: 80, y: 120, nodeWidth: 240, levelGap: 72 });
```

Tree node fields are `id`, `title`, `iconId`, optional `bullets`, and optional
`children`. Secondary edge fields are `from`, `to`, optional `kind`, optional
`label`, optional `lane`, and optional `forceArrow`. Sidecar fields are `id`,
`attachTo`, optional `side`, `title`, and optional `bullets`.

The return value includes `{ nodes, primaryEdges, primaryConnectors,
secondaryEdges, sidecars, sidecarConnectors, bounds }` plus snake_case aliases
for the edge and connector arrays.

Use `secondaryEdges` for meaningful cross-links that should remain arrows. Use
`sidecars` for weak or explanatory relationships that would otherwise create a
long reverse arrow through the tree.

For weak/local models, prefer a data-only JSON spec when TypeScript generation
is brittle:

```bash
excalidraw-diagrams tree-spec examples/plan_todo_tree_spec.json \
  --out examples/out/local-llm-layout-v1/plan-todo-session-tree.excalidraw \
  --png examples/out/local-llm-layout-v1/plan-todo-session-tree.png
```

The JSON fields are the same as `layout.tree(...)`:

```json
{
  "root": {
    "id": "session",
    "title": "Session sharedState",
    "iconId": "memory_database",
    "children": []
  },
  "secondaryEdges": [],
  "sidecars": [],
  "options": { "nodeWidth": 265 }
}
```

## Mermaid Drafts

`layout.fromMermaid(...)` converts a small Mermaid flowchart subset into
Excalidraw blocks and orthogonal arrows. This is intended as an agent-friendly
drafting format, not a complete Mermaid parser.

Supported shape:

```ts
const diagram = layout.fromMermaid(scene, `
  graph TD
    A["Root"] --> B["Left child"]
    A --> C["Right child"]
    B --> D["Leaf"]
`, { x: 240, y: 80 });
```

Supported graph directions are `TD`, `TB`, `BT`, `LR`, and `RL`. Supported node
labels are `A[Label]`, `A["Label"]`, `A(Label)`, and `A{Label}`. The return
value is `{ nodes, arrows, bounds }`, so generated blocks can be adjusted after
the first draft.

Use `scenario: "tree"` when Mermaid should become a measured `layout.tree(...)`
diagram:

```ts
const diagram = layout.fromMermaid(scene, `
  graph TD
    Session["Session"] --> Plan["plan"]
    Session --> Loop["loop"]
    Loop -. restores .-> Plan
`, {
  scenario: "tree",
  icons: {
    Session: "memory_database",
    Plan: "agent_planner",
    Loop: "model_refresh",
  },
});
```

In tree scenario, solid unlabeled arrows become primary hierarchy. Dotted or
labeled arrows become routed `secondaryEdges`. Use `icons` or `defaultIconId`
because tree nodes render as `iconPanel` blocks.

## Output Contract

Generated files should be `.excalidraw` JSON with:

- `type == "excalidraw"`
- non-empty `elements`
- embedded `files` when SVG assets are used
- deterministic-enough ids from a fixed `Scene(seed=...)`
