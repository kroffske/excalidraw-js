# Semantic Redraw (C4 / PlantUML / component maps)

Read this when the input is a C4, PlantUML, component map, or skill-chain source
that must become an **editable** Excalidraw architecture diagram.

Semantic redraw means: read the source, extract the **real architecture** it
describes (actors, boundaries, components, primary flow, durable state), and
redraw *that* as editable Excalidraw. It does **not** mean drawing a generic
"source -> redraw -> output" diagram about the conversion process itself. The
picture should look like the system, not like the pipeline that produced it.

If a weak or local model will draft the redraw, do not ask it to write
TypeScript. Give it `assets/semantic-redraw-spec.prompt.md` and require JSON
only. The runner should validate that source spec, then translate it to
`layout.section(...)`, cards, and connectors.

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
  layout.iconPanel(scene, 0, 0, 250, 96, { title, iconId, bullets: [bullet], iconSize: 44 });
const column = (title: string, x: number, cards: layout.PlacedBlock[]) =>
  layout.section(scene, {
    title, x, y: PHASE_Y,
    padding: 24, titleHeight: 40, headerGap: 8,
    minWidth: 300, minHeight: COL_HEIGHT, children: cards,
  });

const actor = layout.iconPanel(scene, 40, 178, 200, 150, {
  title: "User / maintainer",
  iconId: "human_review",
  bullets: ["asks", "accepts", "compares"],
  iconSize: 46,
});

// One section per source boundary; the cards are the source's containers.
const intent = layout.distributeVertical([
  card("$locus-prompt-goal", "prompt_template", "whole outcome"),
  card("$locus-owner", "confidence_meter", "direction constraints"),
], 0, 0, { gap: 24 });
column("1. Intent", 250, intent);

const source = layout.distributeVertical([
  card("$locus-spec", "data_catalog", "requirements"),
  card("$locus-sdd", "semantic_graph", "slice architecture"),
  card("$c4-diagrams", "data_lineage", "C4-PlantUML"),
], 0, 0, { gap: 24 });
column("2. Source truth", 570, source);

const delivery = layout.distributeVertical([
  card("$locus-plan", "agent_planner", "task contract"),
  card("$locus-pm", "multi_agent_orchestrator", "routing"),
  card("$locus-dev", "sandbox_executor", "bounded slice"),
], 0, 0, { gap: 24 });
column("3. Delivery", 890, delivery);

const quality = layout.distributeVertical([
  card("$locus-code-review", "signal_quality_magnifier", "shape + quality"),
  card("$locus-qa", "model_validation", "evidence verdict"),
  card("$locus-ship", "model_deployment", "closure proof"),
], 0, 0, { gap: 24 });
column("4. Quality / ship", 1210, quality);

// Primary flow: left-to-right across the top row, top-down inside each column.
layout.connect(scene, actor, intent[0], { direction: "left-to-right", path: "orthogonal" });
layout.connect(scene, intent[0], intent[1], { direction: "top-down", path: "orthogonal" });
layout.connect(scene, intent[0], source[0], { direction: "left-to-right", path: "orthogonal" });
layout.connect(scene, source[0], source[1], { direction: "top-down", path: "orthogonal" });
layout.connect(scene, source[1], source[2], { direction: "top-down", path: "orthogonal" });
layout.connect(scene, source[0], delivery[0], { direction: "left-to-right", path: "orthogonal" });
layout.connect(scene, delivery[0], delivery[1], { direction: "top-down", path: "orthogonal" });
layout.connect(scene, delivery[1], delivery[2], { direction: "top-down", path: "orthogonal" });
layout.connect(scene, source[0], quality[0], { direction: "left-to-right", path: "orthogonal" });
layout.connect(scene, quality[0], quality[1], { direction: "top-down", path: "orthogonal" });
layout.connect(scene, quality[1], quality[2], { direction: "top-down", path: "orthogonal" });

const band = layout.distributeHorizontal([
  layout.iconWithLabel(scene, "data_catalog", 0, 0, { label: "skill sources", iconSize: 56, labelWidth: 150 }),
  layout.iconWithLabel(scene, "news_document", 0, 0, { label: "docs pages", iconSize: 56, labelWidth: 150 }),
  layout.iconWithLabel(scene, "historical_database", 0, 0, { label: ".tasks evidence", iconSize: 56, labelWidth: 150 }),
  layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "runtime payload", iconSize: 56, labelWidth: 150 }),
  layout.iconWithLabel(scene, "cloud_data", 0, 0, { label: "Codex / Claude", iconSize: 56, labelWidth: 150 }),
], 0, 0, { gap: 115 });
layout.section(scene, {
  title: "Durable state and runtime surfaces",
  x: 250, y: 662,
  padding: 24, titleHeight: 40, headerGap: 8,
  minWidth: 1260, minHeight: 178, children: band,
});
for (let i = 0; i < band.length - 1; i += 1) {
  layout.connect(scene, band[i], band[i + 1], { direction: "left-to-right", path: "orthogonal" });
}

// Long down-links from producing skills to their durable surface.
layout.connect(scene, source[2], band[1], { direction: "top-down", path: "orthogonal" }); // $c4-diagrams -> docs pages
layout.connect(scene, delivery[2], band[2], { direction: "top-down", path: "orthogonal" }); // $locus-dev -> .tasks evidence
layout.connect(scene, quality[2], band[3], { direction: "top-down", path: "orthogonal" }); // $locus-ship -> runtime payload

const excalidrawPath = `${outDir}/architecture-semantic-redraw.excalidraw`;
scene.write(excalidrawPath);

const data = JSON.parse(readFileSync(excalidrawPath, "utf8"));
assert.equal(data.type, "excalidraw");
assert.ok(data.elements.length > 0);
assert.ok(Object.keys(data.files ?? {}).length > 0);
```

## Weak/local model source-spec prompt

For semantic redraws, the weak model's job is only to identify sections, cards,
icons, bullets, and edges. Keep executable code in the trusted runner. The
bundled prompt at `assets/semantic-redraw-spec.prompt.md` enforces this shape:

- JSON only, no TypeScript, imports, coordinates, or console logs.
- `bullets` is always `string[]`, even for one bullet.
- `iconId` must come from a fixed allowlist.
- edge endpoints must reference existing card ids.
- the model must return a structured error object instead of a partial diagram
  when the source is insufficient.

Runner-side validation should fail before writing an `.excalidraw` file when a
bullet is a string, an icon id does not resolve, an edge endpoint is missing, or
a declared edge direction contradicts the placed geometry.

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
- **`tree-spec`** (see `references/tree-spec.md`) when a weak/local model should
  fill data instead of writing TypeScript.
- **Mermaid bridge** (see `references/mermaid.md`) only for small rough drafts
  whose graph shape can survive Mermaid's simpler layout model.
