---
name: excalidraw-diagrams
description: Use when an agent needs to plan, create, review, or improve Excalidraw diagrams with the excalidraw-diagrams TypeScript npm package, especially C4/component-style architecture semantic redraws, repository/architecture graph planning, data/ML workflows, agent workflows, and LLM-generated .excalidraw files.
---

# Excalidraw Diagrams

Use `excalidraw-diagrams` to generate `.excalidraw` JSON through the TypeScript npm package instead of writing raw Excalidraw element dictionaries by hand.

This file is the entry point and the router. Each phase of the work — planning
the graph, picking a template, composing a custom scene, discovering assets — has
one reference file under `references/`; read the one the Conversion Decision
Guide points at rather than guessing.

## Preflight

- This skill is for diagram planning and generation only. Do not run package or skill setup from this skill, including `npm install`, `npm install <path>`, `npx @kroffske/excalidraw-diagrams install`, `npx @kroffske/excalidraw-diagrams setup`, `excalidraw-diagrams setup`, `excalidraw-diagrams install`, or `commands/setup.md`.
- Before generating, verify that the package is already available. For a project dependency, run `node -e "const {createRequire}=require('node:module'); console.log(createRequire(process.cwd() + '/probe.js').resolve('@kroffske/excalidraw-diagrams'))"` and confirm it resolves under the current workspace's `node_modules/@kroffske/excalidraw-diagrams`, not under a target source checkout. For a global CLI workflow, run `command -v excalidraw-diagrams`, `command -v excalidraw-assets`, and `command -v excalidraw-render`; fail fast if any command is missing from `PATH`. Use the discovered command names directly, not absolute paths into an npm, Node, Pi-node, source checkout, or `dist/bin` directory.
- If the package or CLI is not already installed or is not reachable through `PATH`, stop and tell the user to run setup or add the npm/global Node bin directory to `PATH`, for example `npm install @kroffske/excalidraw-diagrams` in the current workspace, `npm install -g @kroffske/excalidraw-diagrams && excalidraw-diagrams setup` for a user-level interactive setup, `excalidraw-diagrams setup --agents agents,codex --with-png --force` for an explicit non-interactive setup after global install, or `export PATH="$(npm config get prefix)/bin:$PATH"` for the active global npm prefix. Do not perform the install yourself unless the user explicitly asks for setup.
- Treat target repositories as read-only source material. Never install from a target repository path such as `npm install /path/to/source`, never install `file:../source`, and never execute a target checkout's `dist/bin`.
- Use the TypeScript/npm API. For named architecture/system-flow diagrams prefer `import { Scene, diagram } from "@kroffske/excalidraw-diagrams";`. Use `layout` only when the diagram needs custom scene composition, semantic redraw sections, tree layouts, or Mermaid/tree-spec bridges.
- Do not use the older Python API (`excalidraw_diagrams`, `uv pip`, or `site-packages`) when this TypeScript skill is loaded.
- For known bundled examples, prefer an already installed package CLI before writing custom scripts. For the repository baseline, run `excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline`, then render with `excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png`. For the component-style semantic redraw example, run `excalidraw-diagrams example architecture-semantic-redraw --out-dir examples/out/architecture-semantic-redraw`. If only a project-local CLI is installed, use `npx --no-install excalidraw-diagrams ...` and `npx --no-install excalidraw-render --setup ...` so npm does not fetch or install anything.
- For custom diagrams, prefer one small `.mjs` generator run with `node`, plus `excalidraw-render --setup <path_json> example.png` when PNG output is required. If only a project-local CLI is installed, use `npx --no-install excalidraw-render --setup <path_json> example.png` for the first render and omit `--setup` only after the renderer is already installed. Use `npx --no-install tsx` only when the workspace already has `tsx` installed and you chose a `.ts` generator.
- Reference files and reusable templates are bundled next to this skill and travel with the install. Read the reference for your phase (the Conversion Decision Guide routes each need to its file): `references/plan-graph.md` (plan the graph before drawing), `references/semantic-templates.md` (strict C4 / sequence / swimlane JSON), `references/semantic-redraw.md` (C4 / PlantUML / component conversion and the weak/local retry loop), `references/custom-scene.md` (custom composition, containers, routing, layout families), `references/tree-spec.md` (data-only specs, trees, process flow), `references/mermaid.md` (Mermaid bridge), `references/api.md` (method surface, text density, preview-first authoring), `references/assets.md` (icon discovery), and `assets/` (e.g. a ready data-only spec at `assets/tree-spec.example.json`). Do not point at a repository checkout's top-level `examples/`, `src/`, or `docs/references/` paths — those are not installed alongside the skill. Anything the skill needs to run must live under this skill directory or come from the installed CLI.
- `AssetRegistry` exposes `.ids()`, `.groups()`, `.resolve(...)`, `.resolveGroup(...)`, and `.resolveIndex(...)`; it does not expose `.keys()` or `.size`.
- The package's own smoke proof is the bundled `excalidraw-js-architecture` example; see "Baseline smoke proof" below.

## Default Authoring Ladder

Pick one layer before writing code:

- If the user asks for a repository map, architecture graph, workflow graph, or
  semantic redraw but the visual thesis or node set is unclear, plan the graph
  first: read `references/plan-graph.md` and produce a named plan with sections,
  nodes, relationships, and layout intent. Continue down this ladder afterwards.
- For a new fact-authored internal Container view inside the strict caps, use
  strict `c4.container`; for existing C4/PlantUML conversion, external actors,
  or custom breadth, use semantic redraw. Read
  `references/semantic-templates.md` for the exact precedence and schema.
- Use strict `sequence.interaction` only when v1 message order, call/return
  kind, and message notes are sufficient. Concurrency, alternatives, and loops
  require an honest custom fallback; do not claim them as native structure.
- Use strict `flow.swimlane` for a bounded DAG of owner handoffs with native
  bound connectors. Cycles, explicit phase bands, or over-cap scenes use custom
  `layout.*`. Read `references/semantic-templates.md` for limits and repair.
- Named architecture or system-flow diagram: use `diagram.flow(...)` first.
- C4, PlantUML, or component source that must become editable: use the semantic redraw workflow, then compose sections with `layout.*`.
- Hierarchy or long process from data, especially for weak/local models: use `layout.tree(...)` / `layout.processFlow(...)`; `tree-spec` JSON is a CLI fallback, not the primary authoring style.
- Semantic redraw from a weak/local model: ask for restricted TypeScript graph code using `layout.node(...)`, `layout.row(...)`, `layout.column(...)`, `layout.section(...)`, and `layout.connect(...)`. The model should create named objects and connect them by variable names, never by array indexes or manual coordinates. The full contract and retry loop live in `references/semantic-redraw.md`.
- Custom canvas, special sections, or one-off composition: use `layout.*` helpers and read `references/custom-scene.md`.
- Raw `Scene` primitives: use only as an escape hatch for shapes the helpers do not cover.

For detailed method references, read `references/api.md`.

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
visible color names into the label. Sizing options (`width`, `preferredWidth`,
`minWidth`/`maxWidth`, `padding`, `titleSize`, `rowSize`, `rowGap`, `strict`) and
the raw primitives `nodeCard(...)`, `avoidOverlap(...)`, and
`assertDiagramHealthy(...)` are documented in `references/api.md`. Keep colors
monotone blue unless a change/PR diagram needs accent roles.

### Text density and preview-first authoring

Do not optimize diagrams for the fewest possible characters. The goal is a
readable graph whose node bullets, edge labels, notes, and annotations explain
the system without requiring the reader to inspect the source code. Choose one
density before rendering — `iconic`, `compact`, `default` (recommended), or
`expanded` — and put anything longer than a short phrase into a `note(...)` or a
compact `annotation(...)`.

For non-trivial diagrams, draft the graph as text first (nodes, edges, notes,
annotations), ask for approval on the whole plan rather than one box at a time,
then transfer that exact source into the generator.

Both rules are specified in full, with the per-level guidance and the plan
fields, in `references/api.md`.

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
A single durable surface is just a node — do not wrap one element in a stretched
section.

Smoke check: the result should be understandable without reading the original
source file, should read as the architecture (not as a conversion pipeline), and
a reviewer should be able to edit labels, sections, and arrows as Excalidraw
elements. If exact visual fidelity matters more than editability, embed the
rendered SVG as a baseline image and draw annotations around it.

The minimum working artifact, the full worked example (the Locus skill chain),
the grouping method in detail, the weak/local restricted-TypeScript contract with
its retry loop, and the SVG-embed alternative all live in
`references/semantic-redraw.md`.

## Conversion Decision Guide

| Need | Approach | Read |
|---|---|---|
| Diagram thesis, sections, or node set not yet clear | Plan the graph first: thesis, sections, nodes, relationships, layout intent, one approval checkpoint. | `references/plan-graph.md` |
| New fact-authored internal Container view inside strict caps | Strict `c4.container`; the runner owns geometry and styling. Existing C4/PlantUML conversion still takes semantic-redraw precedence. | `references/semantic-templates.md` |
| Ordered calls/returns where v1 order, kind, and notes are sufficient | Strict `sequence.interaction`; do not claim native concurrency, alternatives, or loops. | `references/semantic-templates.md` |
| Bounded acyclic owner-handoff flow | Strict `flow.swimlane` with native bound connectors; cycles, explicit phases, and over-cap scenes use custom `layout.*`. | `references/semantic-templates.md` |
| Editable C4 / component / skill-chain architecture | Semantic redraw: one `section` per boundary, one `iconPanel`/`card` per container, primary connectors and dashed provenance links. | `references/semantic-redraw.md` |
| Exact visual baseline from C4/PlantUML | Render to SVG and `scene.embedSvg(...)` it, then annotate around it. Faithful but not structurally editable. | `references/semantic-redraw.md` |
| Weak/local semantic redraw | Restricted TypeScript graph code: `layout.node`, `layout.row`/`column`, `layout.section`, and `layout.connect` by named variables. | `references/semantic-redraw.md`, `references/api.md` |
| Weak/local hierarchy/process diagram | Prefer `layout.tree(...)` / `layout.processFlow(...)`; use `tree-spec` JSON only as a CLI fallback. | `references/tree-spec.md` |
| Tree / hierarchy, horizontal concept tree, or long linear process | `layout.tree` / `wide-tree` / `layout.horizontalTree` / `layout.processFlow`, or `tree-spec --layout`. | `references/tree-spec.md` |
| Small rough graph or imported Mermaid draft | `layout.fromMermaid(...)`, then refine labels and routed secondary edges. | `references/mermaid.md` |
| Custom scene composition, containers, routing, layout families | Sections + icon nodes + arrows, built children-first so frames are measured. | `references/custom-scene.md` |
| Package smoke proof | `excalidraw-diagrams example excalidraw-js-architecture`. | this file, "Baseline smoke proof" |

## Drawing Guidance

- For named node/box diagrams, prefer `diagram.flow(...)` before scene-level helpers. For custom scenes, containers, connection routing, and layout-family choice, read `references/custom-scene.md`.
- Use `AssetRegistry.bundled()` for the default `core` pack (neutral agents + data icons). Use `AssetRegistry.bundled("trading")` for the thematic fintech pack. Resolve icons by full id, short alias such as `robot_agent`, or numeric code such as `01-01`.
- Keep diagrams readable: left-to-right or top-to-bottom flow, consistent gaps, short labels, and explicit arrows for causality or data flow. In the default text density, a good node bullet explains what happens or why it matters, while a good edge label names the relationship being carried.
- Use a fixed `new Scene({ seed: ... })` so generated ids are deterministic enough for review, and write outputs under an ignored directory such as `examples/out/` unless the user asks to commit the artifact.
- If a weak/local model needs a semantic redraw, require restricted TypeScript graph code and reject raw Excalidraw dictionaries, numeric child lookups, manual element coordinates, and invented icon ids. Run the generated script; on hard failures such as unknown icon id or missing named object, feed the concise error back and retry.

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

The TypeScript package writes Excalidraw JSON. If PNG output is required, replace `<path_json>` with the generated `.excalidraw` path and render it with `excalidraw-render --setup <path_json> example.png`. For project-local installs, use `npx --no-install excalidraw-render --setup <path_json> example.png`; after the renderer is already installed, `--setup` is cheap and the shorter `npx --no-install excalidraw-render <path_json> example.png` is still enough.

Do not call renderer binaries through absolute npm, Node, Pi-node, checkout, or `dist/bin` paths. Do not perform package or skill setup from this skill. If package setup or `PATH` repair is required, stop and give the user the exact command to run.
