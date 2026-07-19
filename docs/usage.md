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

## Named Semantic Palettes And Status

The three strict `buildDiagramSpec` templates accept one optional root
`palette`:

```ts
type SemanticPaletteName =
  | "semantic-neutral"
  | "change-diff"
  | "high-contrast"
  | "c4-blue";

type SemanticStatus = "added" | "changed" | "removed" | "risk";
```

`c4-blue` is a descriptive preset name, not a claim that C4 prescribes colors.
The root palette applies to the complete strict template. Per-element palettes,
raw colors, nested style objects, and token bags are rejected as unknown
fields.

`status` is separate from semantic kind or type. It is accepted only on C4
containers and relationships, sequence participants and messages, and
swimlane activities and transitions. Node status becomes
`Status: <Label>` in a measured badge, composed as
`<existing badge> · Status: <Label>` when a technology or activity-type badge
already exists. Edge status appends ` · Status: <Label>` to existing text; an
unlabeled swimlane transition receives the status-only label.

An explicit-palette sequence containing both `call` and `return` messages adds
the fixed `Call` solid / `Return` dashed legend between the title and
participant headers. Palette omission, one-kind messages, and status-only
differences add no legend and reserve no extra band. C4 and swimlane templates
never add an automatic legend.

Omitting both `palette` and `status` preserves the legacy normalized value and
scene JSON under the same seed and clock.

## Semantic C4 Container Spec

Use the root `buildDiagramSpec` boundary when a model should describe one C4
Container view as data without choosing coordinates, colors, dimensions, ports,
or routing:

```js
import { buildDiagramSpec } from "@kroffske/excalidraw-diagrams";

const result = buildDiagramSpec({
  template: "c4.container",
  title: "Customer insights",
  palette: "c4-blue",
  system: {
    id: "customer-insights",
    name: "Customer insights",
    description: "Builds cohort reports for revenue analysts.",
    containers: [
      {
        id: "portal",
        name: "Customer portal",
        description: "Lets analysts request cohort reports.",
        technology: "React",
        status: "added",
      },
      {
        id: "api",
        name: "Insights API",
        description: "Applies reporting and access rules.",
        technology: "Node.js",
      },
    ],
  },
  relationships: [{
    id: "portal-api",
    from: "portal",
    to: "api",
    description: "requests cohort data",
    technology: "HTTPS/JSON",
    status: "changed",
  }],
});

if (!result.ok) {
  console.error(result.diagnostics);
} else {
  // File output remains an explicit caller decision; the compiler is in-memory.
  result.scene.write("out/customer-insights.excalidraw");
}
```

The boundary is strict: unknown fields, invalid or duplicate ids, missing
descriptions or technologies, unknown exact icon ids, dangling endpoints,
self/reverse/duplicate relationships, and invalid counts return stable
diagnostic `code` and `path` values. A failed build never exposes a partial
scene. Relationships are optional and default to `[]`; accepted diagrams have
two to six containers and at most eight relationships.

The tracked full fixture is
[`examples/c4_container_spec.json`](../examples/c4_container_spec.json). Run
`npx tsx examples/c4_container.ts` from a checkout to write its editable scene,
then render that output with the existing `excalidraw-render` command.

## Semantic Sequence Interaction Spec

Use the same root `buildDiagramSpec` boundary for a time-ordered interaction.
The model supplies participants, messages, and optional message notes; the
compiler owns participant spacing, lifeline length, event rows, label fitting,
colors, and arrow geometry:

```js
import { buildDiagramSpec } from "@kroffske/excalidraw-diagrams";

const result = buildDiagramSpec({
  template: "sequence.interaction",
  title: "Report request",
  palette: "high-contrast",
  participants: [
    { id: "analyst", name: "Analyst", status: "added" },
    { id: "portal", name: "Customer portal" },
    { id: "api", name: "Insights API" },
  ],
  messages: [
    {
      id: "request",
      from: "analyst",
      to: "portal",
      label: "request cohort report",
      status: "changed",
    },
    {
      id: "query",
      from: "portal",
      to: "api",
      label: "fetch cohort data",
    },
    {
      id: "report",
      from: "api",
      to: "portal",
      label: "return rendered report",
      kind: "return",
      status: "risk",
    },
  ],
  notes: [{
    id: "access-rule",
    message: "query",
    text: "Access rules are applied before aggregation.",
  }],
});

if (!result.ok) {
  console.error(result.diagnostics);
} else {
  result.scene.write("out/report-request.excalidraw");
}
```

Participant order is left to right. Message order is top to bottom. `kind`
defaults to `call`; `return` uses a dashed arrow so direction is not encoded by
color alone. With an explicit palette and both kinds present, a measured
`Call` / `Return` legend explains the solid/dashed distinction. The strict
boundary accepts two to six participants, one to twelve messages, and at most
eight notes. Repeated and reverse participant pairs are valid, but
self-messages, dangling references, duplicate ids, unknown fields, line breaks
inside scalar text, and caller-supplied geometry or styling are rejected.
Sequence specs never acquire or inspect an asset registry.

The tracked fixture is
[`examples/sequence_interaction_spec.json`](../examples/sequence_interaction_spec.json).
Run `npx tsx examples/sequence_interaction.ts` to write the editable scene,
then render it with:

```bash
npx --no-install excalidraw-render --setup \
  examples/out/sequence-interaction.excalidraw \
  examples/out/sequence-interaction.png
```

## Semantic Swimlane Flow Spec

Use `flow.swimlane` when a model needs to describe ownership handoffs and
parallel work without choosing coordinates or visual styles. The input is
deliberately small:

```js
import { buildDiagramSpec } from "@kroffske/excalidraw-diagrams";

const result = buildDiagramSpec({
  template: "flow.swimlane",
  title: "Review change with human gate",
  palette: "change-diff",
  lanes: [
    { id: "agent", label: "Agent" },
    { id: "owner", label: "Owner" },
  ],
  activities: [
    {
      id: "inspect",
      lane: "agent",
      type: "artifact",
      title: "Review evidence",
      status: "changed",
    },
    { id: "plan", lane: "agent", type: "step", title: "Draft plan" },
    { id: "approve", lane: "owner", type: "decision", title: "Approve plan?" },
  ],
  transitions: [
    {
      id: "inspect-plan",
      from: "inspect",
      to: "plan",
      status: "removed",
    },
    {
      id: "plan-approve",
      from: "plan",
      to: "approve",
      label: "request gate",
      status: "risk",
    },
  ],
});

if (!result.ok) {
  console.error(result.diagnostics);
} else {
  result.scene.write("out/review-flow.excalidraw");
}
```

The schema contains `template`, `title`, optional root `palette`, `lanes`,
`activities`, and `transitions`. Each activity uses one of `step`, `decision`,
or `artifact` and may carry `status`; a transition may include a short `label`
and `status`. Keep two to five lanes, two to sixteen activities, and one to
twenty-four transitions. Titles accept at most 80
characters, lane labels 48, and transition labels 48. Scalar strings are
single-line. The graph must be a bounded DAG: the longest path may use seven
columns (depth 0 through 6), and no `(lane, depth)` cell may contain more than
three activities. Empty lanes, dangling references, self-links, duplicate
pairs, cycles, and unknown fields return diagnostics before a `Scene` exists.

The compiler owns horizontal causal columns, measured owner-lane heights,
parallel activity stacking, route geometry, colors, and label fitting. Caller
input has no coordinates, dimensions, colors, ports, or arbitrary shapes. All
activities are editable rectangular `nodeCard` elements. Their measured badge
communicates the semantic type; steps and decisions use distinct accent
treatments, while artifacts use a dashed outer frame. The distinction does not
depend on color alone, and decision shapes remain rectangles for native
Excalidraw binding compatibility.

Every generated transition is emitted with native start/end bindings and is
validated by the compiler before success is returned. This binding guarantee is
internal to the template; callers do not pass a flag that can accidentally
disable editability. Binding failures are reported as stable
`NATIVE_BINDING_ERROR` diagnostics. Other stable diagnostics identify invalid
counts, activity types, lane or endpoint references, empty lanes, self or
duplicate transitions, cycles, depth overflow, and per-cell capacity overflow.

The tracked weak-model fixture is
[`examples/swimlane_flow_spec.json`](../examples/swimlane_flow_spec.json). It
includes all three activity types, two owner lanes, two parallel activities in
one cell, cross-lane transitions, and both labelled and unlabelled edges. Run
the generator to write an editable scene at the repository's `examples/` root:

```bash
npx tsx examples/swimlane_flow.ts
npx --no-install excalidraw-render --setup \
  examples/swimlane-flow.excalidraw \
  examples/swimlane-flow.png
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

To make a low-level connector follow its framed endpoints when the scene is
edited in a current Excalidraw app, opt in explicitly and validate the native
binding graph before writing:

```ts
import {
  Scene,
  assertNativeBindings,
  layout,
} from "@kroffske/excalidraw-diagrams";

const scene = new Scene({ seed: 42 });
const producer = layout.node(scene, {
  title: "Producer",
  iconId: "robot_agent",
  bullets: ["publishes evidence"],
  x: 80,
  y: 120,
});
const reviewer = layout.node(scene, {
  title: "Reviewer",
  iconId: "human_review",
  bullets: ["returns a verdict"],
  x: 480,
  y: 120,
});

layout.connectRouted(scene, producer, reviewer, {
  bindings: true,
  label: "hands off",
});
assertNativeBindings(scene.elements);
scene.write("out/editable-handoff.excalidraw");
```

`bindings` defaults to `false`; existing output is unchanged. The opt-in flag
works only when both blocks expose explicit, bounds-equal rectangle frames.
`layout.node`, `layout.iconPanel`, `layout.fitPanel`, `layout.section`, and
`nodeCard(...).block` do so automatically. Text, icons, lists, rows, columns,
groups, plain `layout.panel`, and `layout.card` do not. The connector throws
before mutating the scene when either endpoint is targetless or invalid; it
never guesses from element order.

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

New data-only specs may replace a legacy `iconId` card with one finite semantic
figure:

```json
{
  "id": "reviewer",
  "title": "Review agent",
  "figure": "actor",
  "description": "Reads the frozen target and returns findings."
}
```

The exact names are `card`, `bullets`, `badge`, `actor`, `store`, `queue`,
`decision`, and `note`. `card`, `actor`, `store`, `queue`, and `decision` are
connectable. `bullets`, `badge`, and `note` are content or annotation blocks
and cannot be edge endpoints. A decision needs at least two distinctly labeled
outgoing edges. The renderer owns icons, shape cues, measurement, and bindings;
an explicit figure cannot include icon ids, coordinates, colors, palette/status
overrides, or style objects.

The document may also select one renderer-owned root palette. This root-field
fragment selects the stronger change-oriented treatment:

```json
{
  "palette": "change-diff"
}
```

The finite names are `semantic-neutral`, `change-diff`, `high-contrast`, and
`c4-blue`. A palette maps actor, activity/control, evidence, and context to
restrained private accents. It colors figure frames, written figure badges,
and native cues; main text and relationships stay structural. Role meaning
still comes from words, shapes, labels, bindings, and dash patterns, so no
automatic redraw legend is added.

Palette selection is root-only. Cards, sections, and edges cannot contain
palette, status, raw color, fill, style, or token fields. Legacy cards without
`figure` keep the existing required `iconId` plus 1–3 `bullets` contract and
use the context accent only when a root palette is explicit. Omitting
`palette` preserves the complete previous legacy, explicit, and mixed output.
Do not mix the two card shapes by adding legacy fields to an explicit figure.

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
