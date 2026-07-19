# Semantic Redraw (C4 / PlantUML / component maps)

Read this when the input is a C4, PlantUML, component map, or skill-chain source
that must become an **editable** Excalidraw architecture diagram.

Semantic redraw means: read the source, extract the **real architecture** it
describes (actors, boundaries, components, primary flow, durable state), and
redraw *that* as editable Excalidraw. It does **not** mean drawing a generic
"source -> redraw -> output" diagram about the conversion process itself. The
picture should look like the system, not like the pipeline that produced it.

If a weak or local model will draft the redraw, keep it in TypeScript but make
the TypeScript graph-shaped. It should create named blocks with
`layout.node(...)`, compose them with `layout.row(...)` / `layout.column(...)`,
wrap groups with `layout.section(...)`, and connect semantic names with
`layout.connect(...)`. The model should not hand-place every pixel or connect
children by numeric indexes.

## Method: derive the grouping first

The hard, valuable step is the logical grouping, not placing rectangles. Before
writing any layout code, read the source and fix three things:

1. **Boundaries → sections.** List the boundaries / systems the source defines
   (C4 `System_Boundary` / `Container_Boundary`, PlantUML packages, sub-graphs).
   Each becomes one `layout.section(...)`.
2. **Containers → cards.** List the containers inside each boundary (C4
   `Container`, components, services). Each becomes one `iconPanel`/`card`.
3. **Grouping axis.** Choose what orders the sections — lifecycle phases, layers,
   or owners — and keep it consistent. The example below groups by lifecycle
   phase (`Intent → Source truth → Delivery → Quality / ship`).

Only once the grouping is fixed do you place sections and draw the flow. Keep the
grouping honest: a section earns its size from the multiple cards inside it; a
lone surface (a single durable store, a single actor) is drawn as a bare node,
not wrapped in a stretched full-width container.

## Canonical example: the Locus skill chain

The package CLI ships this exact diagram as `architecture-semantic-redraw`:

```bash
excalidraw-diagrams example architecture-semantic-redraw --out-dir examples/out/architecture-semantic-redraw
excalidraw-render --setup examples/out/architecture-semantic-redraw/architecture-semantic-redraw.excalidraw examples/out/architecture-semantic-redraw/architecture-semantic-redraw.png
```

It draws the concrete architecture from the source `.puml`: a left **actor**
card, four phase **`layout.section(...)` columns** (`1. Intent`, `2. Source
truth`, `3. Delivery`, `4. Quality / ship`) each holding real skill component
cards, and a wide bottom section `Durable state and runtime surfaces`. Primary
flow runs left-to-right across the top row, vertically inside each column, with
long down-links from producing skills to where their output lives.

Reusable shape for your own C4 / component redraw — map the source's boundaries
to phase sections and its containers to skill/component cards, and keep all
columns the same height so the top-row flow stays level:

```ts
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const outDir = "examples/out/architecture-semantic-redraw";
mkdirSync(outDir, { recursive: true });

const scene = new Scene({ seed: 20260628, assetRegistry: AssetRegistry.bundled(), background: "#ffffff" });
scene.text(40, 24, "Locus skill chain semantic redraw", { size: 30, width: 1480, align: "center" });

const PHASE_Y = 120;
const COL_HEIGHT = 486; // shared so every column lines up and down-links stay clean
const card = (title: string, iconId: string, bullet: string) =>
  layout.node(scene, { title, iconId, bullets: [bullet] });
const phase = (title: string, x: number, cards: layout.PlacedBlock) =>
  layout.section(scene, {
    title, x, y: PHASE_Y,
    padding: 24, titleHeight: 40, headerGap: 8,
    minWidth: 300, minHeight: COL_HEIGHT, children: [cards],
  });

const actor = layout.iconPanel(scene, 40, 178, 200, 150, {
  title: "User / maintainer",
  iconId: "human_review",
  bullets: ["asks", "accepts", "compares"],
  iconSize: 46,
});

// One section per source boundary; the cards are the source's containers.
const intent = layout.column({
  promptGoal: card("$locus-prompt-goal", "prompt_template", "whole outcome"),
  owner: card("$locus-owner", "confidence_meter", "direction constraints"),
}, { gap: 24 });
phase("1. Intent", 250, intent);

const source = layout.column({
  spec: card("$locus-spec", "data_catalog", "requirements"),
  sdd: card("$locus-sdd", "semantic_graph", "slice architecture"),
  c4: card("$c4-diagrams", "data_lineage", "C4-PlantUML"),
}, { gap: 24 });
phase("2. Source truth", 570, source);

const delivery = layout.column({
  plan: card("$locus-plan", "agent_planner", "task contract"),
  pm: card("$locus-pm", "multi_agent_orchestrator", "routing"),
  dev: card("$locus-dev", "sandbox_executor", "bounded slice"),
}, { gap: 24 });
phase("3. Delivery", 890, delivery);

const quality = layout.column({
  review: card("$locus-code-review", "signal_quality_magnifier", "shape + quality"),
  qa: card("$locus-qa", "model_validation", "evidence verdict"),
  ship: card("$locus-ship", "model_deployment", "closure proof"),
}, { gap: 24 });
phase("4. Quality / ship", 1210, quality);

// Primary flow: named blocks; connect infers sides and orthogonal paths.
layout.connect(scene, actor, intent.promptGoal);
layout.connect(scene, intent.promptGoal, intent.owner);
layout.connect(scene, intent.promptGoal, source.spec);
layout.connect(scene, source.spec, source.sdd);
layout.connect(scene, source.sdd, source.c4);
layout.connect(scene, source.spec, delivery.plan);
layout.connect(scene, delivery.plan, delivery.pm);
layout.connect(scene, delivery.pm, delivery.dev);
layout.connect(scene, delivery.plan, quality.review);
layout.connect(scene, quality.review, quality.qa);
layout.connect(scene, quality.qa, quality.ship);

const band = layout.row({
  skillSources: layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: "skill sources", iconSize: 56, labelWidth: 150 }),
  docs: layout.iconWithLabel(scene, "news_document", 0, 0, { label: "docs pages", iconSize: 56, labelWidth: 150 }),
  tasks: layout.iconWithLabel(scene, "historical_database", 0, 0, { label: ".tasks evidence", iconSize: 56, labelWidth: 150 }),
  payload: layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "runtime payload", iconSize: 56, labelWidth: 150 }),
  codexClaude: layout.iconWithLabel(scene, "cloud_data", 0, 0, { label: "Codex / Claude", iconSize: 56, labelWidth: 150 }),
}, { gap: 115 });
layout.section(scene, {
  title: "Durable state and runtime surfaces",
  x: 250, y: 662,
  padding: 24, titleHeight: 40, headerGap: 8,
  minWidth: 1260, minHeight: 178, children: [band],
});
layout.connect(scene, band.skillSources, band.docs);
layout.connect(scene, band.docs, band.tasks);
layout.connect(scene, band.tasks, band.payload);
layout.connect(scene, band.payload, band.codexClaude);

// Long down-links from producing skills to their durable surface.
layout.connect(scene, source.c4, band.docs); // $c4-diagrams -> docs pages
layout.connect(scene, delivery.dev, band.tasks); // $locus-dev -> .tasks evidence
layout.connect(scene, quality.ship, band.payload); // $locus-ship -> runtime payload

const excalidrawPath = `${outDir}/architecture-semantic-redraw.excalidraw`;
scene.write(excalidrawPath);

const data = JSON.parse(readFileSync(excalidrawPath, "utf8"));
assert.equal(data.type, "excalidraw");
assert.ok(data.elements.length > 0);
assert.ok(Object.keys(data.files ?? {}).length > 0);
```

## Weak/local TypeScript retry loop

For semantic redraws, the weak model's job is to write a small TypeScript graph
program, not raw Excalidraw JSON and not a coordinate canvas. Keep the source
restricted:

- Create cards with `layout.node(scene, { title, iconId, bullets })`.
- Compose groups with `layout.row({ ... })` and `layout.column({ ... })`.
- Wrap real groups with `layout.section(scene, { title, x, y, children: [group] })`.
- Connect named blocks with `layout.connect(scene, source.card, target.card, { label })`.
- Do not use numeric child indexes such as `source[0]` or `band[3]`.
- Do not invent icon ids. Unknown ids must fail so the model can fix them.
- Do not manually draw raw arrows through card bounds; use `layout.connect`.

Validation loop:

1. Extract the generated TypeScript source.
2. Run it with the package already installed.
3. Collect concise hard errors such as unknown icon id, missing named object,
   duplicate variable, or invalid relationship.
4. Feed those errors back to the model.
5. Retry from the TypeScript source.

`semantic-redraw-spec` remains a compatibility CLI for older data-only specs,
but it is not the preferred weak-model prompt format.

When that JSON compatibility path is required, a card has two disjoint forms:

- Legacy: omit `figure`, choose an allowed `iconId`, and provide 1–3 bullets.
- Semantic: choose exactly one of `card | bullets | badge | actor | store |
  queue | decision | note`; do not provide an icon, coordinates, raw color, or
  style.

`card`, `actor`, `store`, `queue`, and `decision` can be connected.
`bullets`, `badge`, and `note` cannot be edge endpoints. A `decision` requires
at least two distinctly labeled outgoing edges. Actor/store assets and all
other decorations are renderer-owned. Omitting `figure` preserves the legacy
icon-panel output.

## When exact fidelity matters more than editing: SVG embed

If the reader needs the exact PlantUML rendering rather than an editable model,
render the source to SVG with your C4 tool, then embed that image and annotate
around it instead of redrawing it:

```ts
// scene.embedSvg(path, x, y, w, h) places the rendered source as one image.
scene.embedSvg("architecture.svg", 40, 118, 1180, 994);
scene.text(40, 24, "Architecture (rendered baseline)", { size: 28, width: 1180, align: "center" });
```

The embedded image is faithful but not structurally editable — use it for review
overlays, not when the reader needs to move boxes.

## Choosing between approaches

- **Semantic redraw** when the reader needs to edit or discuss the architecture
  shape; the output should resemble the source system, one section per boundary
  and one card per container.
- **SVG embed** when the reader needs exact PlantUML visual fidelity.
- **Restricted TypeScript graph code** when a weak/local model should draft the
  architecture: named `layout.node` cards, `layout.row`/`column` composition,
  `layout.section` boundaries, and `layout.connect` relationships.
- **`semantic-redraw-spec`** only for compatibility with older data-only specs.
- **`tree-spec`** (see `references/tree-spec.md`) as a fallback for pure
  hierarchy/process data when a CLI JSON path is explicitly needed.
- **Mermaid bridge** (see `references/mermaid.md`) only for small rough drafts
  whose graph shape can survive Mermaid's simpler layout model.
