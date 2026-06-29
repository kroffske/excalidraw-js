---
name: excalidraw-diagrams
description: Use when an agent needs to create, review, or improve Excalidraw diagrams with the excalidraw-diagrams TypeScript npm package, especially C4/component-style architecture semantic redraws, data/ML workflows, agent workflows, and LLM-generated .excalidraw files.
---

# Excalidraw Diagrams

Use `excalidraw-diagrams` to generate `.excalidraw` JSON through the TypeScript npm package instead of writing raw Excalidraw element dictionaries by hand.

## Preflight

- This skill is for diagram generation only. Do not run package or skill setup from this skill, including `npm install`, `npm install <path>`, `npx @kroffske/excalidraw-diagrams install`, `npx @kroffske/excalidraw-diagrams setup`, `excalidraw-diagrams setup`, `excalidraw-diagrams install`, or `commands/setup.md`.
- Before generating, verify that the package is already available. For a project dependency, run `node -e "const {createRequire}=require('node:module'); console.log(createRequire(process.cwd() + '/probe.js').resolve('@kroffske/excalidraw-diagrams'))"` and confirm it resolves under the current workspace's `node_modules/@kroffske/excalidraw-diagrams`, not under a target source checkout. For a global CLI workflow, run `command -v excalidraw-diagrams`, `command -v excalidraw-assets`, and `command -v excalidraw-render`; fail fast if any command is missing from `PATH`. Use the discovered command names directly, not absolute paths into an npm, Node, Pi-node, source checkout, or `dist/bin` directory.
- If the package or CLI is not already installed or is not reachable through `PATH`, stop and tell the user to run setup or add the npm/global Node bin directory to `PATH`, for example `npm install @kroffske/excalidraw-diagrams` in the current workspace, `npm install -g @kroffske/excalidraw-diagrams && excalidraw-diagrams setup` for a user-level interactive setup, `excalidraw-diagrams setup --agents agents,codex --with-png --force` for an explicit non-interactive setup after global install, or `export PATH="$(npm config get prefix)/bin:$PATH"` for the active global npm prefix. Do not perform the install yourself unless the user explicitly asks for setup.
- Treat target repositories as read-only source material. Never install from a target repository path such as `npm install /path/to/source`, never install `file:../source`, and never execute a target checkout's `dist/bin`.
- Use the TypeScript/npm API. For named architecture/system-flow diagrams prefer `import { Scene, diagram } from "@kroffske/excalidraw-diagrams";`. Use `layout` only when the diagram needs custom scene composition, semantic redraw sections, tree layouts, or Mermaid/tree-spec bridges.
- Do not use the older Python API (`excalidraw_diagrams`, `uv pip`, or `site-packages`) when this TypeScript skill is loaded.
- For known bundled examples, prefer an already installed package CLI before writing custom scripts. For the repository baseline, run `excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline`, then render with `excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png`. For the component-style semantic redraw example, run `excalidraw-diagrams example architecture-semantic-redraw --out-dir examples/out/architecture-semantic-redraw`. If only a project-local CLI is installed, use `npx --no-install excalidraw-diagrams ...` and `npx --no-install excalidraw-render --setup ...` so npm does not fetch or install anything.
- For custom diagrams, prefer one small `.mjs` generator run with `node`, plus `excalidraw-render --setup <path_json> example.png` when PNG output is required. If only a project-local CLI is installed, use `npx --no-install excalidraw-render --setup <path_json> example.png` for the first render and omit `--setup` only after the renderer is already installed. Use `npx --no-install tsx` only when the workspace already has `tsx` installed and you chose a `.ts` generator.
- Reference files and reusable templates are bundled next to this skill and travel with the install. Read the per-diagram-type reference for your case (the Conversion Decision Guide routes each need to its file): `references/semantic-redraw.md` (C4 / PlantUML / component), `references/tree-spec.md` (data-only specs, trees, process flow), `references/mermaid.md` (Mermaid bridge), `references/api.md` (method surface), `references/assets.md` (icon discovery), and `assets/` (e.g. a ready data-only spec at `assets/tree-spec.example.json`). Do not point at a repository checkout's top-level `examples/`, `src/`, or `docs/references/` paths — those are not installed alongside the skill. Anything the skill needs to run must live under this skill directory or come from the installed CLI.
- `AssetRegistry` exposes `.ids()`, `.groups()`, `.resolve(...)`, `.resolveGroup(...)`, and `.resolveIndex(...)`; it does not expose `.keys()` or `.size`.
- The package's own smoke proof is the bundled `excalidraw-js-architecture` example; see "Baseline smoke proof" below.

## Default Authoring Ladder

Pick one layer before writing code:

- If the user asks for a repository map, architecture graph, workflow graph, or
  semantic redraw but the visual thesis or node set is unclear, use
  `plan-excalidraw-graph` first when it is available. Continue here after there
  is a named graph plan with sections, nodes, relationships, and layout intent.
- Named architecture or system-flow diagram: use `diagram.flow(...)` first.
- C4, PlantUML, or component source that must become editable: use the semantic redraw workflow, then compose sections with `layout.*`.
- Hierarchy or long process from data, especially for weak/local models: use `layout.tree(...)` / `layout.processFlow(...)`; `tree-spec` JSON is a CLI fallback, not the primary authoring style.
- Semantic redraw from a weak/local model: ask for restricted TypeScript graph code using `layout.node(...)`, `layout.row(...)`, `layout.column(...)`, `layout.section(...)`, and `layout.connect(...)`. The model should create named objects and connect them by variable names, never by array indexes or manual coordinates.
- Custom canvas, special sections, or one-off composition: use `layout.*` helpers.
- Raw `Scene` primitives: use only as an escape hatch for shapes the helpers do not cover.

For detailed method references, read `references/api.md`. For per-diagram-type examples, read the matching reference; the Conversion Decision Guide routes each need to its file.

### Architecture diagrams: measure, don't guess

For node/box diagrams (services, components, agent/data flows) prefer
`diagram.flow(...)` first. It keeps the authoring surface in domain IDs
(`node`, `row`, `edge`, `note`, `override`) instead of numeric element indices,
uses measured `NodeCard`s underneath, and gates the result before writing:

```ts
import { Scene, diagram } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({ seed: 42 });
const g = diagram.flow(scene, {
  defaults: { layout: { preset: "lr-flow" }, node: { strict: true } },
});

g.node("intake", { title: "intake_execution_request", bullets: ["normalizes payload"] });
g.node("route", { title: "route_to_venue", bullets: ["selects venue by cost"] });
g.row("main", ["intake", "route"]);
g.edge("intake", "route", { label: "request" });
g.annotation("annotation", {
  // Compact by default; each row can set role/color/size when needed.
  items: [
    { text: "normal flow", role: "default" },
    { text: "changed integration", role: "changed" },
    { text: "native risk", role: "risk" },
    { text: "notes and provenance", role: "note" },
  ],
});

g.layout();
g.assertHealthy(); // throws before write if unhealthy
scene.write("diagram.excalidraw");
```

`annotation(...)` is a generic compact card, not a color-specific helper. Use
plain row text plus `role` or `color` when a row needs semantic color; do not put
visible color names into the label. By default short rows stay single-line, long
rows wrap through the measured text policy, and the frame grows in height. Use
`width` for a fixed width, or `preferredWidth`/`minWidth`/`maxWidth`,
`minHeight`/`maxHeight`, `padding`, `titleSize`, `rowSize`, `rowGap`, and
`strict` when you need source-level control.

### Text density

Do not optimize diagrams for the fewest possible characters. The goal is a
readable graph whose node bullets, edge labels, notes, and annotations explain
the system without requiring the reader to inspect the source code. Prefer short
phrases over single-word labels by default.

Choose one text density before rendering:

- `iconic`: icons, node names, and almost no explanatory text. Use only when the
  diagram is a visual index and the audience already knows the domain.
- `compact`: terse labels and noun phrases. Use for dense maps where space is
  tight, but still label the important relationships.
- `default`: concise phrases. This is the recommended mode. Use 1-3 bullets per
  important node, clear edge labels for causality/data flow, and compact notes or
  annotations for caveats.
- `expanded`: more self-contained explanation. Use fuller short phrases in
  bullets and relationship labels, but keep the diagram scannable and move long
  details into attached notes.

If a detail needs more than a short phrase, do not force it into a node. Put it
in an attached `note(...)` or a compact `annotation(...)`.

### Preview-first authoring

For non-trivial diagrams, draft the graph as text before spending work on
rendering. Show the user the planned source graph once, then render after they
approve or edit it:

- Nodes: each node id, visible title, role/color, and planned bullets.
- Edges: source, target, direction, label, and whether the relationship is
  primary, dashed, risk, feedback, or provenance.
- Notes: attachment target, side, and the note text.
- Annotations: standalone rows and their optional roles/colors.

Ask for approval for the whole text plan, not one box at a time. After the user
edits or approves the text plan, transfer that exact source into the diagram
generator and render the Excalidraw file.

Use raw `nodeCard(...)`, `avoidOverlap(...)`, and `assertDiagramHealthy(...)`
only when you need lower-level control than `diagram.flow(...)` gives. Keep
colors monotone blue unless a change/PR diagram needs accent roles; see Colors
in `references/api.md`. Canonical default example: `examples/reaper_graphspec.ts`.
Advanced primitive proof: `examples/reaper_integration.ts`.

## Advanced Custom Scene Pattern

Use this when `diagram.flow(...)` is too constrained because the diagram needs
custom sections, swimlanes, semantic-redraw columns, icon-only nodes, or a
canvas-specific composition. Build child nodes first, distribute them, then wrap
them in a `layout.section(...)` so the frame is computed from the children.
Bundled SVG assets are embedded into the `.excalidraw` `files` automatically
when you place them.

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

## Common Architecture Semantic Redraw

Use this path for C4, PlantUML, component maps, skill-chain diagrams, and
architecture sketches that must become editable Excalidraw from an existing
source.
Semantic redraw means extracting the **real architecture** and redrawing it as
editable sections and components so the result looks like the system. Do **not**
draw a generic "source -> redraw -> output" diagram about the conversion process;
that meta-pipeline is the wrong output.

**Decide the grouping before you draw** — that is the hard, valuable step, not
placing rectangles. Read the source and fix three things first:

- which **boundaries** the source defines → each becomes one `layout.section(...)`
- which **containers** live inside each boundary → each becomes one `iconPanel`/`card`
- the **grouping axis** that orders the sections (lifecycle phases, layers, or
  owners) → pick one and keep it consistent

Only once the grouping is fixed do you place the sections and draw the flow. A
redraw that nails the grouping reads as the system even before the arrows exist.

Minimum working artifact — one section per boundary, cards as the containers, and
a lone durable surface drawn as a bare node (the bundled
`architecture-semantic-redraw` example is the full version of this shape):

```ts
const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

const card = (title: string, iconId: string, bullet: string) =>
  layout.node(scene, { title, iconId, bullets: [bullet] });

// Grouping axis = lifecycle phase. One section per boundary; cards are containers.
const intent = layout.column({
  promptGoal: card("$locus-prompt-goal", "prompt_template", "whole outcome"),
  owner: card("$locus-owner", "confidence_meter", "direction constraints"),
}, { gap: 24 });
layout.section(scene, { title: "1. Intent", x: 40, y: 112, minWidth: 300, minHeight: 360, children: [intent] });

const delivery = layout.column({
  plan: card("$locus-plan", "agent_planner", "task contract"),
  dev: card("$locus-dev", "sandbox_executor", "bounded slice"),
}, { gap: 24 });
layout.section(scene, { title: "2. Delivery", x: 360, y: 112, minWidth: 300, minHeight: 360, children: [delivery] });

// A single durable surface is just the node — do not wrap one element in a stretched section.
const evidence = layout.iconWithLabel(scene, "historical_database", 430, 520, { label: ".tasks evidence", iconSize: 54, labelWidth: 160 });

layout.connect(scene, intent.promptGoal, intent.owner);
layout.connect(scene, intent.promptGoal, delivery.plan);
layout.connect(scene, delivery.plan, delivery.dev);
layout.connect(scene, delivery.dev, evidence);
```

Smoke check: the result should be understandable without reading the original
source file, should read as the architecture (not as a conversion pipeline), and
a reviewer should be able to edit labels, sections, and arrows as Excalidraw
elements. If exact visual fidelity matters more than editability, embed the
rendered SVG as a baseline image and draw annotations around it.

The full worked example (the Locus skill chain), the grouping method in detail,
and the SVG-embed alternative live in `references/semantic-redraw.md`.

### Weak/local TypeScript graph prompt

When a weak or local model needs a semantic redraw, keep the authoring surface as
TypeScript but make it graph-shaped. Ask it to create named objects with
`layout.node(...)`, compose them with `layout.row(...)` / `layout.column(...)`,
wrap real groups with `layout.section(...)`, and connect by names with
`layout.connect(scene, source, target, { label })`.

The model must not compute every coordinate, size, or port. The runner computes
card size, section size, connection sides, and orthogonal routing. The model may
set a small local override (`width`, `minWidth`, `gap`, `path: "auto"`) only
when the requested diagram needs it.

Use this skeleton instead of JSON:

```ts
const card = (title: string, iconId: string, bullet: string) =>
  layout.node(scene, { title, iconId, bullets: [bullet] });

const source = layout.column({
  repository: card("Repository", "server_stack", "source folders"),
  scripts: card("scripts", "tool_call", "automation commands"),
}, { gap: 24 });
layout.section(scene, { title: "Source", x: 40, y: 112, children: [source] });

const runtime = layout.column({
  packageApi: card("package API", "data_catalog", "shared helpers"),
  renderer: card("PNG renderer", "model_deployment", "image export"),
}, { gap: 24 });
layout.section(scene, { title: "Runtime", x: 380, y: 112, children: [runtime] });

layout.connect(scene, source.repository, source.scripts, { label: "contains" });
layout.connect(scene, source.repository, runtime.packageApi, { label: "publishes" });
layout.connect(scene, runtime.packageApi, runtime.renderer, { label: "renders" });
```

Hard validation still lives in the runner and package:

- Every `iconId` must resolve through `AssetRegistry`; an unknown id such as
  `folder` is a hard failure with allowed alternatives from the asset catalog.
- A relationship must use named variables such as `source.repository`, never
  numeric lookups such as `source[0]`.
- Sections and parent regions must wrap real child blocks with
  `layout.section(...)`; do not draw a stretched container around one unrelated
  item.
- `layout.connect(...)` infers direction from placed blocks, so the model should
  not hand-route arrows through card bodies or labels.
- If the generated TypeScript fails, feed the concise error back to the model and
  let it rewrite the source rather than silently repairing the diagram for it.

## Conversion Decision Guide

| Need | Approach | Read |
|---|---|---|
| Editable C4 / component / skill-chain architecture | Semantic redraw: one `section` per boundary, one `iconPanel`/`card` per container, primary connectors and dashed provenance links. | `references/semantic-redraw.md` |
| Exact visual baseline from C4/PlantUML | Render to SVG and `scene.embedSvg(...)` it, then annotate around it. Faithful but not structurally editable. | `references/semantic-redraw.md` |
| Weak/local semantic redraw | Restricted TypeScript graph code: `layout.node`, `layout.row`/`column`, `layout.section`, and `layout.connect` by named variables. | `references/semantic-redraw.md`, `references/api.md` |
| Weak/local hierarchy/process diagram | Prefer `layout.tree(...)` / `layout.processFlow(...)`; use `tree-spec` JSON only as a CLI fallback. | `references/tree-spec.md` |
| Tree / hierarchy, horizontal concept tree, or long linear process | `layout.tree` / `wide-tree` / `layout.horizontalTree` / `layout.processFlow`, or `tree-spec --layout`. | `references/tree-spec.md` |
| Small rough graph or imported Mermaid draft | `layout.fromMermaid(...)`, then refine labels and routed secondary edges. | `references/mermaid.md` |
| Custom scene composition | Advanced custom scene pattern (above): sections + icon nodes + arrows. | this file |
| Package smoke proof | `excalidraw-diagrams example excalidraw-js-architecture`. | this file, "Baseline smoke proof" |

## Drawing Guidance

- For named node/box diagrams, prefer `diagram.flow(...)` before scene-level helpers. Use `layout.node`, `layout.row`, `layout.column`, `layout.section`, `layout.fitPanel`, and `layout.connect` when the diagram is a custom scene rather than a GraphSpec flow.
- Use `layout.panel(...)` only as a low-level fixed rectangle primitive. For nested containers, sections, phases, swimlanes, or parent regions with child blocks inside, use `layout.section(...)` or `layout.fitPanel(...)` so the parent is computed from real child bounds plus padding and a title band.
- A container earns its width from its children: use `layout.section(...)`/`layout.fitPanel(...)` to group **multiple** child blocks. Do not stretch a section or panel around a single element — a lone actor or durable surface should look like one node (`iconWithLabel`/`card`), not a full-width band. Drop `minWidth`/`minHeight` so the frame hugs its content, or just draw the bare node and connect to it.
- Use `AssetRegistry.bundled()` for the default `core` pack (neutral agents + data icons). Use `AssetRegistry.bundled("trading")` for the thematic fintech pack. Resolve icons by full id, short alias such as `robot_agent`, or numeric code such as `01-01`.
- Keep diagrams readable: left-to-right or top-to-bottom flow, consistent gaps, short labels, and explicit arrows for causality or data flow.
- In the default text density, write concise phrases rather than bare words. A good node bullet explains what happens or why it matters, while a good edge label names the relationship being carried.
- Use a fixed `new Scene({ seed: ... })` so generated ids are deterministic enough for review.
- Write outputs under an ignored directory such as `examples/out/` unless the user asks to commit the diagram artifact.
- When a diagram belongs to a Markdown, STD, or docs page and no output directory is specified, save generated diagram artifacts under a sibling `resources/` directory next to that Markdown file.
- Before drawing, choose a layout family and write down the reason in your working notes or final answer: `tree` for real top-down hierarchy, `horizontal-tree` for left-to-right concept trees, `wide-tree` for deep vertical hierarchy that needs wider panels, `process-flow` for long linear process spines, `pipeline/swimlane` for phase ownership, and `contract comparison` for two formats or two responsibilities.
- For weak/local models, choose graph-shaped TypeScript before drawing coordinates. Prefer `layout.node(...)` for cards, `layout.row(...)` / `layout.column(...)` for composition, and `layout.tree(...)` / `layout.processFlow(...)` when the relationship is a hierarchy or process.
- In `layout.tree(...)`, put hierarchy in `children`, put cross-links in `secondaryEdges`, and put weak/non-hierarchy details in `sidecars`. This keeps reverse arrows outside the main tree or replaces them with readable notes.
- When a diagram has a canvas title or subtitle, start the main layout below it and pass `reservedTopBand` to `layout.tree(...)`, `layout.processFlow(...)`, or `layout.fromMermaid(..., { scenario: "tree" })`. This keeps `sidecars` and routed `secondaryEdges` out of the title area.
- For Mermaid drafts that should become trees, use `layout.fromMermaid(scene, mermaidText, { scenario: "tree", icons: {...} })`. Solid unlabeled arrows become primary hierarchy; dotted or labeled arrows become routed secondary edges.
- If a weak/local model needs a semantic redraw, require restricted TypeScript graph code and reject raw Excalidraw dictionaries, numeric child lookups, manual element coordinates, and invented icon ids. Run the generated script; on hard failures such as unknown icon id or missing named object, feed the concise error back and retry.
- If the model is struggling with a pure hierarchy/process, use the data-only fallback: copy the bundled template `assets/tree-spec.example.json` (next to this skill) or author your own JSON, then run `excalidraw-diagrams tree-spec spec.json --layout auto --out diagram.excalidraw --png diagram.png`.
- Use `--layout horizontal-tree` for left-to-right concept trees with compact leaf spacing. Use `--layout process-flow` for long document/process chains that otherwise become a tall narrow tree. Use `--layout tree` only when the top-down hierarchy is intentional.
- Use `layout.connect(scene, source, target)` as the default connection helper. It infers the nearest sensible sides from placed blocks and uses orthogonal routing. Add `direction`, `from`, `to`, `path: "auto"`, or `obstacles` only when the diagram needs a local routing override.
- For quick non-tree drafts, write a small Mermaid `graph TD` or `graph LR` first and convert it with `layout.fromMermaid(scene, mermaidText, { x, y })`; then refine the generated blocks if needed.
- Avoid drawing arrows through titles, labels, or icon panels. Route arrows along empty corridors between levels. For provenance, audit, restore, and feedback links, prefer `secondaryEdges` with an outer lane or a `sidecar` note over a hand-drawn reverse arrow through the primary trunk.

## Asset Discovery

Do not guess the package asset path. Use the CLI:

```bash
excalidraw-assets packs
excalidraw-assets groups
excalidraw-assets --pack trading groups
excalidraw-assets list --group agents
excalidraw-assets show robot_agent
excalidraw-assets export ./asset-catalog
```

Read `references/assets.md` when you need group names, common aliases, or the export workflow.

## Review Checklist

- The generated file has `type == "excalidraw"`, non-empty `elements`, and embedded `files` when SVG assets are used.
- Text labels fit their intended blocks and do not overlap arrows or icons. For node diagrams, run `assertDiagramHealthy(...)` before `write` rather than eyeballing it.
- Asset ids resolve through `AssetRegistry`; do not invent ids without checking the registry.
- The diagram communicates the system shape without requiring the reader to inspect the TypeScript source.

When reviewing a generated file, read it back and check the basics first, then
inspect whether labels overlap, arrows show actual causality, and asset choices
match the domain:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("diagram.excalidraw", "utf8"));
assert.equal(data.type, "excalidraw");
assert.ok(data.elements.length > 0);
assert.equal(typeof (data.files ?? {}), "object");

const oneCharBullets = data.elements.filter((element) =>
  element.type === "text" && /^-\s\S$/.test(element.text ?? ""),
);
assert.equal(oneCharBullets.length, 0, "one-character bullets usually mean bullets was a string, not string[]");
```

## Baseline smoke proof

The package's own architecture diagram is the post-install smoke proof. It is
always available from the CLI and exercises the full path (skill guidance,
TypeScript API, bundled assets embedded in JSON, JS renderer PNG):

```bash
excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline
excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png
```

A valid result has `type == "excalidraw"`, non-empty `elements`, and non-empty
`files`. The `architecture-semantic-redraw` example is the second bundled proof
(see `references/semantic-redraw.md`).

## Optional PNG Export

The TypeScript package writes Excalidraw JSON. If PNG output is required, replace `<path_json>` with the generated `.excalidraw` path and render it with:

```bash
excalidraw-render --setup <path_json> example.png
```

For project-local installs, use:

```bash
npx --no-install excalidraw-render --setup <path_json> example.png
```

After the renderer is already installed, `--setup` is cheap and skips dependency
work, but the shorter command is still enough:

```bash
npx --no-install excalidraw-render <path_json> example.png
```

Do not call renderer binaries through absolute npm, Node, Pi-node, checkout, or `dist/bin` paths. Do not perform package or skill setup from this skill. If package setup or `PATH` repair is required, stop and give the user the exact command to run.
