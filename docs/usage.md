# Usage Guide

This guide covers direct package usage, CLI commands, bundled assets, and local
checkout checks. The short public introduction lives in the root `README.md`.

## Generate A Diagram From A Script

Install the package in a project:

```bash
npm install @kroffske/excalidraw-diagrams
```

Create `diagram.mjs` with the default named-graph authoring path:

```js
import { Scene, diagram } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({ seed: 42 });
const g = diagram.flow(scene, {
  title: "Service flow",
  defaults: { layout: { preset: "lr-flow" }, node: { strict: true } },
});

g.node("api", { title: "API", bullets: ["accepts request"] });
g.node("agent", { title: "Agent", bullets: ["runs workflow"] });
g.node("database", { title: "Database", bullets: ["stores result"] });
g.edge("api", "agent", { label: "request" });
g.edge("agent", "database", { label: "write" });

g.layout();
g.assertHealthy();

scene.write("out/service-flow.excalidraw");
```

Run it and render a PNG:

```bash
node diagram.mjs
npx --no-install excalidraw-render --setup out/service-flow.excalidraw out/service-flow.png
```

## API

```ts
import { AssetRegistry, Scene, diagram } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({
  seed: 123,
  assetRegistry: AssetRegistry.bundled(),
});

const g = diagram.flow(scene, {
  title: "Agent flow",
  nodes: {
    prompt: { title: "Prompt", bullets: ["user intent"] },
    worker: { title: "Agent", bullets: ["executes tools"] },
  },
  edges: [{ from: "prompt", to: "worker", label: "instruction" }],
});
g.layout();
g.assertHealthy();

scene.write("examples/out/agent-flow.excalidraw");
```

Main exports:

- `Scene`: Excalidraw JSON scene builder.
- `AssetRegistry`: bundled or custom SVG asset lookup.
- `diagram`: default named-graph authoring layer for architecture/system-flow diagrams.
- `layout`: helpers for icon labels, cards, panels, bullets, distribution, alignment, arrows, top-down tree layout, horizontal tree layout, and process-flow layout.
- `Bounds` and `PlacedBlock`: geometry primitives used by layout helpers.

For top-down trees, describe the hierarchy as data. Put true parent/child
relationships under `children`; put cross-links in `secondaryEdges`; put weak
non-hierarchy details in `sidecars` instead of drawing long reverse arrows:

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
  secondaryEdges: [{ from: "loop", to: "plan", kind: "feedback", label: "restore" }],
  sidecars: [{ id: "hook-note", attachTo: "loop", side: "right", title: "hook", bullets: ["restores state"] }],
}, { x: 80, y: 120, nodeWidth: 240 });
```

When the source is a long process chain rather than a real hierarchy, plan the
layout before drawing:

```ts
const plan = layout.planTreeLayout(spec, { x: 80, y: 130 }, "auto");
const diagram = plan.family === "process-flow"
  ? layout.processFlow(scene, spec, plan.options)
  : plan.family === "horizontal-tree"
    ? layout.horizontalTree(scene, spec, plan.options)
  : layout.tree(scene, spec, plan.options);
```

`auto` chooses a wrapped `process-flow` for long linear spines, a `wide-tree`
for deep vertical hierarchies, and the regular measured `tree` for compact
branching structures.

Use `layout.horizontalTree(...)` or request `"horizontal-tree"` when the
hierarchy should read from left to right. The layout places depths as columns,
centers each parent over its child group, and supports `leafGap` so final leaf
rows can stay tighter than the larger `siblingGap` between bigger branches.

For quick drafts, convert a small Mermaid flowchart subset. Use
`scenario: "tree"` when solid arrows should become hierarchy and dotted or
labeled arrows should become routed secondary edges:

```ts
const diagram = layout.fromMermaid(scene, `
  graph TD
    Session["Session"] --> Plan["plan"]
    Session --> Loop["loop"]
    Loop -. restores .-> Plan
`, {
  scenario: "tree",
  icons: { Session: "memory_database", Plan: "agent_planner", Loop: "model_refresh" },
});
```

## CLI Commands

```bash
npm install -g @kroffske/excalidraw-diagrams
excalidraw-diagrams setup [--agents agents,codex|all] [--project] [--force] [--with-png|--no-png]
excalidraw-diagrams example excalidraw-js-architecture [--out-dir examples/out/baseline]
excalidraw-diagrams example architecture-semantic-redraw [--out-dir examples/out/architecture-semantic-redraw]
excalidraw-diagrams semantic-redraw-spec spec.json --out output.excalidraw [--png output.png]
excalidraw-diagrams tree-spec spec.json --out output.excalidraw [--png output.png] [--layout auto|tree|wide-tree|process-flow|horizontal-tree]
excalidraw-assets packs
excalidraw-assets groups
excalidraw-assets --pack trading list --group trading
excalidraw-assets show robot_agent
excalidraw-assets export ./asset-catalog
excalidraw-render-setup
excalidraw-render input.excalidraw output.png --scale 2 --background "#ffffff"
```

## Assets

The package ships two bundled SVG packs:

- `core`: neutral agent and data workflow icons.
- `trading`: fintech and market workflow icons.

Resolve assets by full id, short alias such as `robot_agent`, or numeric code
such as `01-01`.

## From A Checkout

```bash
npm install
npm run build
npm test
```

Generate the baseline architecture proof for this repository:

```bash
npx --no-install excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline
npx --no-install excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png
```

Generate the component-style semantic redraw proof:

```bash
npx --no-install excalidraw-diagrams example architecture-semantic-redraw --out-dir examples/out/architecture-semantic-redraw
npx --no-install excalidraw-render --setup examples/out/architecture-semantic-redraw/architecture-semantic-redraw.excalidraw examples/out/architecture-semantic-redraw/architecture-semantic-redraw.png
```

For weak or local models that need a semantic redraw, ask for restricted
TypeScript graph code first. The model should create named cards with
`layout.node(...)`, compose them with `layout.row(...)` / `layout.column(...)`,
wrap groups with `layout.section(...)`, and connect named blocks with
`layout.connect(...)`:

```ts
const source = layout.column({
  repository: layout.node(scene, { title: "Repository", iconId: "server_stack", bullets: ["source folders"] }),
  scripts: layout.node(scene, { title: "scripts", iconId: "tool_call", bullets: ["automation commands"] }),
}, { gap: 24 });
layout.section(scene, { title: "Source", x: 40, y: 112, children: [source] });

const runtime = layout.column({
  packageApi: layout.node(scene, { title: "package API", iconId: "data_catalog", bullets: ["shared helpers"] }),
  renderer: layout.node(scene, { title: "PNG renderer", iconId: "model_deployment", bullets: ["image export"] }),
}, { gap: 24 });
layout.section(scene, { title: "Runtime", x: 380, y: 112, children: [runtime] });

layout.connect(scene, source.repository, source.scripts, { label: "contains" });
layout.connect(scene, source.repository, runtime.packageApi, { label: "publishes" });
layout.connect(scene, runtime.packageApi, runtime.renderer, { label: "renders" });
```

Unknown icon ids remain hard failures from `AssetRegistry`, so feed concise
errors back to the model and retry the TypeScript source. Do not use numeric
child indexes such as `source[0]`.

The JSON `semantic-redraw-spec` command remains available for older data-only
specs:

```bash
excalidraw-diagrams semantic-redraw-spec semantic-redraw.json \
  --out examples/out/local-llm-semantic-redraw/semantic-redraw.excalidraw \
  --png examples/out/local-llm-semantic-redraw/semantic-redraw.png
```

This compatibility path fails before writing when bullets are strings, icon ids
are unknown, edge endpoints are missing, section order is duplicated, or every
card uses the same icon. Model-supplied edge directions are advisory by default;
the renderer warns and uses inferred geometry unless `--strict-edge-directions`
is passed.

For a pure hierarchy or process where a CLI data fallback is explicitly useful,
use a data-only tree spec:

```bash
excalidraw-diagrams tree-spec examples/plan_todo_tree_spec.json \
  --layout auto \
  --out examples/out/local-llm-layout-v1/plan-todo-session-tree.excalidraw \
  --png examples/out/local-llm-layout-v1/plan-todo-session-tree.png
```

Use `--layout process-flow` for long process descriptions such as document
ingestion, answer generation, or validation chains. Use `--layout tree` when
the top-down hierarchy is the actual message.

## Evaluation And Release

Weak/local-model diagram evals live under `evals/` — one prompt per `evalN/`,
driven by a single runner. See `evals/README.md` for how to run an eval and read
the rendered output.

For the layout-selection design and user-flow diagrams, see
`docs/system-design/layout-rendering/layout-rendering-std.md`.

```bash
npm run release:check
```

`npm run release:check` runs the build, tests, and `npm pack --dry-run` with pack
output scoped under `build/npm/`. See `RELEASE.md` for the publish checklist.
