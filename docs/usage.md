# Usage Guide

This guide covers direct package usage, CLI commands, bundled assets, and local
checkout checks. The short public introduction lives in the root `README.md`.

## Generate A Diagram From A Script

Install the package in a project:

```bash
npm install @kroffske/excalidraw-diagrams
```

Create `diagram.mjs`:

```js
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

const api = layout.iconWithLabel(scene, "api_connector", 0, 90, { label: "API" });
const agent = layout.iconWithLabel(scene, "robot_agent", 180, 90, { label: "Agent" });
const db = layout.iconWithLabel(scene, "historical_database", 360, 90, { label: "Database" });

scene.text(0, 20, "Service flow", { size: 28, width: 470, align: "center" });
layout.connect(scene, api, agent, { direction: "left-to-right", path: "orthogonal" });
layout.connect(scene, agent, db, { direction: "left-to-right", path: "orthogonal" });

scene.write("out/service-flow.excalidraw");
```

Run it and render a PNG:

```bash
node diagram.mjs
npx --no-install excalidraw-render --setup out/service-flow.excalidraw out/service-flow.png
```

## API

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({
  seed: 123,
  assetRegistry: AssetRegistry.bundled(),
});

const prompt = layout.iconWithLabel(scene, "prompt_template", 0, 0, { label: "Prompt" });
const worker = layout.iconWithLabel(scene, "robot_agent", 180, 0, { label: "Agent" });
layout.connect(scene, prompt, worker, { direction: "left-to-right", path: "orthogonal" });

scene.write("examples/out/agent-flow.excalidraw");
```

Main exports:

- `Scene`: Excalidraw JSON scene builder.
- `AssetRegistry`: bundled or custom SVG asset lookup.
- `layout`: helpers for icon labels, cards, panels, bullets, distribution, alignment, arrows, tree layout, and process-flow layout.
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
  : layout.tree(scene, spec, plan.options);
```

`auto` chooses a wrapped `process-flow` for long linear spines, a `wide-tree`
for deep vertical hierarchies, and the regular measured `tree` for compact
branching structures.

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
excalidraw-diagrams setup [--agent auto|codex|claude|generic] [--project] [--force]
excalidraw-diagrams example excalidraw-js-architecture [--out-dir examples/out/baseline]
excalidraw-diagrams tree-spec spec.json --out output.excalidraw [--png output.png] [--layout auto|tree|wide-tree|process-flow]
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
npm run eval:agent-diagrams
```

The eval command writes scenario artifacts and a report to `examples/out/agent-evals/`.

Generate the baseline architecture proof for this repository:

```bash
npx --no-install excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline
npx --no-install excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png
```

For weak or local models, use a data-only tree spec instead of asking the model
to write a full script:

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

Agent evaluation scenarios live in `evals/agent-diagram-scenarios.json` and
`evals/agent-diagram-scenarios.md`.

For the layout-selection design and user-flow diagrams, see
`docs/system-design/layout-rendering/layout-rendering-std.md`.

```bash
npm run eval:agent-diagrams
npm run release:check
```

`npm run eval:agent-diagrams` generates:

- `examples/out/agent-evals/*.excalidraw`
- `examples/out/agent-evals/*.png`
- `examples/out/agent-evals/report.html`

`npm run release:check` runs the build, tests, eval generation, and
`npm pack --dry-run` with pack output scoped under `build/npm/`. See
`RELEASE.md` for the publish checklist.
