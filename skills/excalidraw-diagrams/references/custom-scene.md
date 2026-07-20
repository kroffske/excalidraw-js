# Custom Scene Composition

Read this when `diagram.flow(...)` is too constrained because the diagram needs
custom sections, swimlanes, semantic-redraw columns, icon-only nodes, or a
canvas-specific composition.

## Advanced custom scene pattern

Build child nodes first, distribute them, then wrap them in a
`layout.section(...)` so the frame is computed from the children. Bundled SVG
assets are embedded into the `.excalidraw` `files` automatically when you place
them.

```ts
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

mkdirSync("examples/out", { recursive: true });
const scene = new Scene({ seed: 42, assetRegistry: AssetRegistry.bundled() });

// Title + subtitle set the frame; start the body below them.
scene.text(40, 24, "Service request flow", { size: 28, width: 1160, align: "center" });
scene.text(40, 60, "Two measured sections, icon nodes inside each, arrows for the request path.", { size: 15, color: "#475569", width: 1160, align: "center" });

// Build named nodes, compose them into rows, then wrap each row in a measured section.
const edge = layout.row({
  client: layout.iconWithLabel(scene, "api_connector", 0, 0, { label: "Client" }),
  gateway: layout.iconWithLabel(scene, "function_router", 0, 0, { label: "Gateway" }),
  service: layout.iconWithLabel(scene, "robot_agent", 0, 0, { label: "Service" }),
}, { gap: 110 });
layout.section(scene, { title: "Edge", x: 40, y: 90, minWidth: 1160, minHeight: 200, children: [edge] });
layout.connect(scene, edge.client, edge.gateway);
layout.connect(scene, edge.gateway, edge.service);

const data = layout.row({
  store: layout.iconWithLabel(scene, "historical_database", 0, 0, { label: "Store" }),
  lake: layout.iconWithLabel(scene, "data_lake", 0, 0, { label: "Lake" }),
  metrics: layout.iconWithLabel(scene, "monitoring_dashboard", 0, 0, { label: "Metrics" }),
}, { gap: 110 });
layout.section(scene, { title: "Data", x: 40, y: 340, minWidth: 1160, minHeight: 200, children: [data] });
layout.connect(scene, data.store, data.lake);
layout.connect(scene, data.lake, data.metrics);
layout.connect(scene, edge.service, data.store, { dashed: true });

scene.write("examples/out/foundational.excalidraw");
const out = JSON.parse(readFileSync("examples/out/foundational.excalidraw", "utf8"));
assert.equal(out.type, "excalidraw");
assert.ok(out.elements.length > 0);
assert.ok(Object.keys(out.files ?? {}).length > 0);
```

Run a `.ts`/`.mjs` generator with `node`/`tsx`, then render the PNG with
`excalidraw-render --setup examples/out/foundational.excalidraw examples/out/foundational.png`.

## Containers and sections

- For named node/box diagrams, prefer `diagram.flow(...)` before scene-level
  helpers. Use `layout.node`, `layout.row`, `layout.column`, `layout.section`,
  `layout.fitPanel`, and `layout.connect` when the diagram is a custom scene
  rather than a GraphSpec flow.
- Use `layout.panel(...)` only as a low-level fixed rectangle primitive. For
  nested containers, sections, phases, swimlanes, or parent regions with child
  blocks inside, use `layout.section(...)` or `layout.fitPanel(...)` so the
  parent is computed from real child bounds plus padding and a title band.
- A container earns its width from its children: group **multiple** child blocks.
  Do not stretch a section or panel around a single element — a lone actor or
  durable surface should look like one node (`iconWithLabel`/`card`), not a
  full-width band. Drop `minWidth`/`minHeight` so the frame hugs its content, or
  just draw the bare node and connect to it.

## Layout family choice

Before drawing, choose a layout family and write down the reason in your working
notes or final answer:

- `tree` for real top-down hierarchy.
- `horizontal-tree` for left-to-right concept trees with compact leaf spacing.
- `wide-tree` for deep vertical hierarchy that needs wider panels.
- `process-flow` for long linear process spines that would otherwise become a
  tall narrow tree.
- `pipeline`/`swimlane` for phase ownership.
- `contract comparison` for two formats or two responsibilities.

In `layout.tree(...)`, put hierarchy in `children`, cross-links in
`secondaryEdges`, and weak/non-hierarchy details in `sidecars`. This keeps
reverse arrows outside the main tree or replaces them with readable notes.

When a diagram has a canvas title or subtitle, start the main layout below it and
pass `reservedTopBand` to `layout.tree(...)`, `layout.processFlow(...)`, or
`layout.fromMermaid(..., { scenario: "tree" })`. This keeps `sidecars` and routed
`secondaryEdges` out of the title area.

## Connections and routing

- Use `layout.connect(scene, source, target)` as the default connection helper.
  It infers the nearest sensible sides from placed blocks and uses orthogonal
  routing. Add `direction`, `from`, `to`, `path: "auto"`, or `obstacles` only
  when the diagram needs a local routing override.
- Avoid drawing arrows through titles, labels, or icon panels. Route arrows along
  empty corridors between levels. For provenance, audit, restore, and feedback
  links, prefer `secondaryEdges` with an outer lane or a `sidecar` note over a
  hand-drawn reverse arrow through the primary trunk.

## Weak/local model fallbacks

- For weak/local models, choose graph-shaped TypeScript before drawing
  coordinates. Prefer `layout.node(...)` for cards, `layout.row(...)` /
  `layout.column(...)` for composition, and `layout.tree(...)` /
  `layout.processFlow(...)` when the relationship is a hierarchy or process. The
  restricted graph contract and its validation rules live in
  `semantic-redraw.md`.
- If the model is struggling with a pure hierarchy/process, use the data-only
  fallback: copy the bundled template `assets/tree-spec.example.json` (next to
  this skill) or author your own JSON, then run
  `excalidraw-diagrams tree-spec spec.json --layout auto --out diagram.excalidraw --png diagram.png`.
  See `tree-spec.md`.
- For quick non-tree drafts, write a small Mermaid `graph TD` or `graph LR` first
  and convert it with `layout.fromMermaid(scene, mermaidText, { x, y })`; then
  refine the generated blocks. Solid unlabeled arrows become primary hierarchy;
  dotted or labeled arrows become routed secondary edges. See `mermaid.md`.

## Output placement

- Use a fixed `new Scene({ seed: ... })` so generated ids are deterministic
  enough for review.
- Write outputs under an ignored directory such as `examples/out/` unless the
  user asks to commit the diagram artifact.
- When a diagram belongs to a Markdown, STD, or docs page and no output directory
  is specified, save generated diagram artifacts under a sibling `resources/`
  directory next to that Markdown file.
