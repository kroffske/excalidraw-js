# API Reference

Use this when you need method names, supported arguments, or the expected composition style.

## Imports

Recommended for named architecture/system-flow diagrams:

```ts
import { Scene, diagram } from "@kroffske/excalidraw-diagrams";
```

Recommended for custom scene composition, semantic redraws, trees, Mermaid, or
asset-heavy diagrams:

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";
```

Optional constants:

```ts
import { BLUE, GRAY, GREEN, LIGHT_GRAY, RED, TextStyle } from "@kroffske/excalidraw-diagrams";
```

## Layer Guide

- `diagram.flow(...)` is the default authoring layer for named architecture and
  system-flow graphs.
- `layout.*` is the lower-level scene-helper layer for custom sections, semantic
  redraw, hierarchy/process layouts, Mermaid bridge, and measured containers.
- For weak/local models, prefer restricted TypeScript graph code:
  `layout.node`, `layout.row`/`column`, `layout.section`, and `layout.connect`
  over named objects.
- `semantic-redraw-spec` is a compatibility CLI path for older data-only
  semantic redraw specs.
- `tree-spec` is the data-only fallback path for hierarchy/process specs.
- Raw `Scene` primitives are the escape hatch when no helper fits.

Compatibility aliases such as `graphFlow`, `graph_flow`, `node_card`,
`fit_text`, `fit_panel`, `process_flow`, and `from_mermaid` are exported for
existing callers. New TypeScript examples should prefer the camelCase names and
the `diagram` / `layout` namespaces.

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

- `scene.bounds(elements?)` — bounds of the passed elements, or of the whole scene when omitted
- `scene.group(elements)`

## GraphSpec / diagram.flow

Use `diagram.flow(scene, spec?)` for architecture and system-flow diagrams where
the source should be named and compact. It is an orchestration layer over
`nodeCard`, `avoidOverlap`, and `validateDiagram`, not a generic graph solver.

### Minimal flow

```ts
const scene = new Scene({ seed: 42 });
const g = diagram.flow(scene, {
  title: "Service request flow",
  defaults: { layout: { preset: "lr-flow" }, node: { strict: true } },
});

g.node("intake", {
  title: "intake_execution_request",
  bullets: ["normalizes payload"],
});
g.node("route", {
  title: "route_to_venue",
  bullets: ["selects venue by cost"],
});
g.edge("intake", "route", { label: "request" });
g.note("openQuestions", {
  title: "Open questions",
  bullets: ["confirm timeout policy"],
}).attachTo("route", { side: "bottom" });

g.layout();
g.assertHealthy();
scene.write("diagram.excalidraw");
```

### Tuned flow

Add explicit widths, row order, edge label policy, or manual overrides only when
the minimal defaults do not give a readable result.

```ts
const g = diagram.flow(scene, {
  title: "Reaper integration - one supervised-loop tick",
  defaults: {
    node: { width: 300, strict: true },
    edge: { label: { width: 160, maxLines: 2, overflow: "ellipsis" } },
    layout: { preset: "two-row-flow", columnGap: 84, rowGap: 104 },
  },
});

g.node("dataContext", { title: "DataContext", bullets: ["per instrument / aso"] });
g.node("approveBatch", {
  title: "approve_batch_with_optional_reaper",
  role: "changed",
  bullets: ["OPEN -> resize to cap", "max_position_size"],
});
g.row("claim", ["dataContext"]);
g.row("execution", ["approveBatch"]);
g.edge("dataContext", "approveBatch", { label: "OPEN intent", direction: "top-down" });
g.note("openOnly", { title: "OPEN-only", bullets: ["CLOSE bypasses resize"] })
  .attachTo("approveBatch", { side: "bottom" });
g.annotation("annotation", {
  items: [
    { text: "normal flow", role: "default" },
    { text: "changed integration", role: "changed" },
    { text: "native risk", role: "risk" },
    { text: "notes and provenance", role: "note" },
  ],
});
g.applyOverrides({ nodes: { approveBatch: { width: 340 } } });

g.layout();
g.assertHealthy();
scene.write("diagram.excalidraw");
```

Data-only specs are also supported:

```ts
diagram.flow(scene, {
  layout: { preset: "two-row-flow" },
  nodes: {
    a: { title: "Source", bullets: ["input"] },
    b: { title: "Sink", bullets: ["output"] },
  },
  edges: [{ from: "a", to: "b", label: "feed" }],
}).layout();
```

Supported MVP layout presets:

- `lr-flow` — all nodes in one left-to-right row unless explicit rows are given.
- `two-row-flow` — explicit rows, or an automatic split into two rows for data-only specs.

`GraphSpec` supports `title`, `subtitle`, `theme`, `defaults`, `nodes`, `rows`,
`edges`, `notes`, `annotations`, `overrides`, and `layout`. Source-level
overrides currently cover node/note/annotation `width`, `dx`, `dy`, absolute
`x`/`y`, note `attachTo`/`side`, and edge `labelOffset`, `lane`, and `direction`.
Keep manual movement in those named overrides, not in generated `.excalidraw`
JSON.

`note(...).attachTo(id, { side })` creates a gray folded-corner note card and a
dashed connector back to the attached node. Use `annotation(id, spec)` for compact,
unattached explanatory cards. An annotation is a small list of rows: each row may
be a string or `{ text, role/color, size }`. Width is auto-sized from the title
and rows by default, while `width`, `preferredWidth`, `minWidth`, `maxWidth`,
`minHeight`, `maxHeight`, `padding`, `titleSize`, `itemSize`/`rowSize`,
`titleGap`, `itemGap`/`rowGap`, and `strict` remain source-level knobs.
Annotations default to the bottom-right available area and are separated from
other notes by the same overlap resolver. For color legends, prefer
`items: [{ text, role }]` so the label itself is colored semantically; do not
write the color name into the visible label.

Card sizing is measured before placement. Short rows remain single-line and the
frame shrinks to the actual content width, clamped by `minWidth`/`maxWidth`. Long
rows wrap through `fitText(...)` at the chosen width, and height growth is the
normal outcome. An explicit `width` is fixed. `preferredWidth` is compacted when
the content safely fits narrower. If content still cannot fit because text
overflows or total height exceeds `maxHeight`, the card reports warnings; with
`strict: true` it throws before a broken `.excalidraw` is written. Notes and
annotations use the same measured card policy, while notes keep their folded
corner and dashed `attachTo` connector.

```ts
g.annotation("flowMarkers", {
  title: "flow markers",
  maxWidth: 220,
  items: [
    { text: "normal flow", role: "default" },
    { text: "changed integration", role: "changed" },
    { text: "native risk", role: "risk" },
    { text: "notes and provenance", role: "note" },
  ],
});
```

### Text density

`diagram.flow(...)` does not currently take a runtime `textDensity` option. Treat
text density as an authoring decision that shapes the strings you put into
`title`, `bullets`, edge `label`, `note(...)`, and `annotation(...)`.

- `iconic`: icons and node names only, with almost no explanatory text.
- `compact`: short labels and noun phrases for dense overview diagrams.
- `default`: concise explanatory phrases. This is the recommended mode for
  architecture and workflow diagrams.
- `expanded`: fuller short phrases for reviewer-facing diagrams that must be
  readable without surrounding context.

The default mode should not economize every letter. Prefer 1-3 useful bullets on
important nodes, relationship labels on important edges, and small attached notes
for caveats. Avoid long paragraphs inside boxes; move details into notes or a
separate document when they stop being scannable.

### Preview-first authoring

Before rendering a non-trivial diagram, prepare a text plan and ask the user to
approve or edit the whole graph. Include:

- nodes with id, visible title, role/color, and planned bullets;
- edges with `from -> to`, direction, label, and relationship kind;
- notes with attachment target, side, and note text;
- annotations with standalone rows and optional roles/colors.

After approval, transfer the text plan into the TypeScript/data spec and render
the `.excalidraw` file. This keeps expensive visual iterations focused on layout
and readability instead of discovering missing text after the PNG already exists.

### Measured text

`fitText(content, { width, maxLines, size, minSize, lineHeight, overflow, id })`
wraps by spaces and code delimiters (`_ . / :: → -`); hard-breaks only after
delimiters fail. Policy: grow height to `maxLines`, then shrink the font to
`minSize`, then apply `overflow`:

- `"shrink"` (default) — keep all lines, set `overflowed: true`, push a warning.
- `"ellipsis"` — truncate to `maxLines` with `…`.
- `"error"` — throw, message includes `id`.

Returns `FittedText`: `{ text, lines, size, width, height, overflowed, warnings }`.

`textBox(scene, x, y, content, { width, ...FitTextOptions, color, align })` runs
`fitText` and places a real text element. Returns `{ element, block, bounds, fitted, overflowed, warnings }`.

### NodeCard

`nodeCard(scene, spec)` — a grouped node primitive emitting ordinary
`rectangle` / `text` / `image` elements (never a flattened SVG), all sharing one
`groupId` so the card moves and edits as a unit. Text is measured and kept
inside the frame padding by construction.

```ts
const card = nodeCard(scene, {
  id: "approve_batch",
  title: "approve_batch_with_optional_reaper",
  iconId: "robot_agent",            // optional
  bullets: ["batches pending approvals", "optional reaper sweep"],
  x: 0, y: 0,
  width: 320,                        // preferred 280–360, hard max ~420
  color: "default",                  // ColorRole or hex
  strict: false,                     // true → throw if text overflows
});
// card.bounds, card.anchors.{top,right,bottom,left,center}, card.groupId,
// card.texts, card.overflowed, card.warnings
```

`spec.ports` adds named anchors: `ports: { in: { side: "left", slot: 0.5 } }` → `card.anchors.in`.

### Validation gate

```ts
validateDiagram({ blocks, cards, edges, gap, renderBounds, overflowSeverity });
assertDiagramHealthy({ ... });       // throws on any error-severity issue
```

- `blocks` / `cards` — `{ id, bounds, overflowed?, texts?, padding? }` or `PlacedNodeCard[]`.
- `edges` — `{ id, points, from?, to?, label? }`; arrow `points` are absolute.

Checks (severity `warn` | `error`): `text-overflow`, `text-outside-frame`,
`block-overlap` (pairwise after `inflateBounds(gap)`), `arrow-through-block`
(via `polylineIntersectsBounds`, ignoring `from`/`to`), `output-clipped`
(scene vs `renderBounds`). Arrow labels are checked as note blocks. Result:
`{ ok, issues, errors, warnings }`.

### avoidOverlap (opt-in)

`avoidOverlap(items, { gap, maxPasses })` — small resolver, not a global solver.
`items: { id, block, kind }` where `kind: "row"` pushes right and
`"column"|"note"` push down; reading order is preserved (only the later item of
a pair moves). Returns `{ moved: [{ id, dx, dy }] }`. Re-run routing/validation
after using it.

### Colors

Monotone blue by default; accent roles are opt-in via `Colors` / `ColorRole`
instead of scattered hex literals:

| role | color | meaning |
|---|---|---|
| `default` | blue | normal / unchanged |
| `added` | green | added |
| `changed` | purple | changed |
| `removed` | red | removed / breaking |
| `risk` | amber | risk / warning |
| `note` / `external` | gray | notes / external |

`resolveColor(role, fallback?)` resolves a role or passes a hex through.
`legendNeeded(roles)` is `true` once more than one accent role is used — add a
legend or expect a validator warning.

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
- `layout.fitPanel(scene, content, { title, padding, titleHeight, headerGap, minWidth, minHeight })`
- `layout.section(scene, { title, x, y, padding, titleHeight, headerGap, children })`
- `layout.node(scene, { title, iconId, bullets })`
- `layout.card(scene, x, y, w, h, { iconId: "...", title: "...", description: "" })`
- `layout.iconPanel(scene, x, y, w, h, { title: "...", iconId: "...", bullets: [...] })`
- `layout.row({ api, worker, db }, { gap: 84 })`
- `layout.column({ prompt, review, ship }, { gap: 24 })`
- `layout.tree(scene, { root, secondaryEdges, sidecars }, { x, y, nodeWidth, levelGap, siblingGap, reservedTopBand })`
- `layout.planTreeLayout({ root, secondaryEdges, sidecars }, options, "auto")`
- `layout.horizontalTree(scene, { root, secondaryEdges, sidecars }, { x, y, nodeWidth, levelGap, siblingGap, leafGap, reservedTopBand })`
- `layout.leftRightTree(...)` / `layout.left_right_tree(...)` — aliases for `horizontalTree`.
- `layout.processFlow(scene, { root, secondaryEdges, sidecars }, { x, y, nodeWidth, wrapColumns, reservedTopBand })`
- `layout.routeEdges(scene, diagram, secondaryEdges, { gutter: 48, reservedTopBand })`
- `layout.distributeHorizontal(blocks, x, y, { gap: 20 })`
- `layout.distributeVertical(blocks, x, y, { gap: 20 })`
- `layout.connect(scene, source, target, { label, path: "auto" })`
- `layout.connectRouted(scene, source, target, { path: "auto", label, obstacles })`
- `layout.connectSmart(scene, source, target)` — compatibility alias for old prompts.
- `layout.fromMermaid(scene, mermaidText, { x: 0, y: 0, direction: "TD", scenario: "draft" })`
- `layout.alignLeft/right/center/top/bottom/middle(...)`
- `layout.centerIn(block, bounds)`

For weak/local models and most hand-written diagrams, prefer graph-like
TypeScript code with named objects:

```ts
const flow = layout.row({
  api: layout.node(scene, { title: "API", iconId: "api_connector", bullets: ["request entry"] }),
  worker: layout.node(scene, { title: "Worker", iconId: "robot_agent", bullets: ["handles job"] }),
  store: layout.node(scene, { title: "Store", iconId: "historical_database", bullets: ["persists state"] }),
}, { gap: 48 });

layout.section(scene, { title: "Runtime path", x: 40, y: 90, children: [flow] });
layout.connect(scene, flow.api, flow.worker, { label: "dispatches" });
layout.connect(scene, flow.worker, flow.store, { label: "writes" });
```

`layout.node(...)` computes a reasonable card size from the title and bullets.
Use `width`, `minWidth`, `maxWidth`, `height`, or `minHeight` only when a human
or a visual review asks for a local adjustment. `layout.row(...)` and
`layout.column(...)` return a `PlacedBlock` with named child properties, so you
can keep composing upward and write `flow.worker`, not `flow[1]`.

`layout.connect(scene, source, target)` infers direction from the placed blocks
and uses orthogonal routing by default. Pass `direction` only when the semantic
direction must override geometry. Pass `path: "auto"` with `obstacles` when the
connector should try a straight path, then orthogonal, then an outside lane.

Connection directions choose edge anchors:

- `top-down` / `td`: source bottom edge to target top edge.
- `bottom-up` / `bt`: source top edge to target bottom edge.
- `left-to-right` / `lr`: source right edge to target left edge.
- `right-to-left` / `rl`: source left edge to target right edge.

Use `from` and `to` when you need exact sides:

```ts
layout.connect(scene, source, target, {
  from: "bottom",
  to: "top",
  path: "orthogonal",
});
```

Use `layout.connectRouted(...)` when a custom composition needs readable edge
labels or obstacle-aware routes. `path: "auto"` tries a straight connector first,
then an orthogonal connector, then an outside lane if the earlier routes hit
`obstacles`. `path: "outer"` forces the outside lane. `outerSide` chooses the
lane around the diagram, while `from` and `to` keep control of the actual source
and target card sides. Multi-point routed arrows use small algorithmic corner
rounding by default, preserving the source and target anchors while making long
outside lanes less likely to sit exactly on card borders. Set `cornerRadius: 0`
when a composition needs a fully rectangular route. Labels are placed from route
segments and shifted away from the connector line; use `labelGap` or
`labelOffset` only when a local composition needs extra tuning. Pass
`avoidRoutes` when labels should also avoid other connector polylines that are
already known to the composition, and pass `avoidLabels` when newly placed
labels should avoid previously placed text boxes.

```ts
const routed = layout.connectRouted(scene, source, target, {
  direction: "left-to-right",
  path: "auto",
  label: "writes scene model",
  labelWidth: 132,
  cornerRadius: 18,
  avoidRoutes: knownConnectorRoutes,
  avoidLabels: knownLabels,
  obstacles: [middleCard, noteCard],
});

layout.connectRouted(scene, feedbackSource, feedbackTarget, {
  direction: "right-to-left",
  path: "outer",
  from: "bottom",
  to: "bottom",
  outerSide: "bottom",
  outerGap: 64,
  cornerRadius: 0,
  routeBounds: diagramBounds,
  dashed: true,
});
```

## Container-Safe Sections

Use `layout.section(...)` or `layout.fitPanel(...)` for parent regions that
contain child blocks. The helper computes the parent rectangle from real child
`bounds`, adds `padding`, `titleHeight`, and `headerGap`, applies
`minWidth/minHeight`, groups the parent with the children, and moves the parent
frame before the children in `scene.elements` so the container stays behind its
contents.

`layout.panel(...)` remains available for fixed decorative rectangles, but it
does not measure or protect children. Do not use raw `panel(...)` for nested
containers, phase sections, swimlanes, or architecture subregions whose size
depends on internal blocks.

```ts
const children = layout.distributeHorizontal(
  [
    layout.iconWithLabel(scene, "data_lake", 0, 0, { label: "Raw data" }),
    layout.iconWithLabel(scene, "model_training", 0, 0, { label: "Train" }),
    layout.iconWithLabel(scene, "model_registry", 0, 0, { label: "Registry" }),
  ],
  96,
  156,
  { gap: 110 },
);

const training = layout.section(scene, {
  title: "Training",
  x: 40,
  y: 80,
  padding: 24,
  titleHeight: 44,
  headerGap: 8,
  minWidth: 760,
  minHeight: 210,
  children,
});
```

Use `layout.fitPanel(...)` when the children are already placed and you only
need a measured parent around their current bounds:

```ts
const content = layout.distributeVertical([
  layout.iconPanel(scene, 0, 0, 300, 120, {
    title: "Skill source",
    iconId: "prompt_template",
    bullets: ["SKILL.md", "references/*"],
  }),
  layout.iconPanel(scene, 0, 0, 300, 120, {
    title: "Package API",
    iconId: "function_router",
    bullets: ["Scene", "layout"],
  }),
], 80, 160, { gap: 24 });

const sourceSection = layout.fitPanel(scene, content.flatMap((block) => block.elements), {
  title: "C4 diagrams",
  padding: 24,
  titleHeight: 44,
  headerGap: 8,
  minWidth: 360,
});
```

Both helpers keep children below the header band. If child elements start above
`y + padding + titleHeight + headerGap`, the helper shifts them down before it
computes the final parent bounds.

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
}, { x: 80, y: 120, nodeWidth: 240, levelGap: 72, reservedTopBand: 110 });
```

Tree node fields are `id`, `title`, `iconId`, optional `bullets`, and optional
`children`. Secondary edge fields are `from`, `to`, optional `kind`, optional
`label`, optional `lane`, and optional `forceArrow`. Supported edge kinds are
`primary`, `secondary`, `feedback`, `annotation`, and `provenance`. Sidecar
fields are `id`, `attachTo`, optional `side`, `title`, and optional `bullets`;
`side` can be `left`, `right`, `top`, `bottom`, or `auto`.

The return value includes `{ nodes, primaryEdges, primaryConnectors,
secondaryEdges, sidecars, sidecarConnectors, bounds }` plus snake_case aliases
for the edge and connector arrays.

Use `layout.horizontalTree(...)` when the hierarchy should read left-to-right.
It uses the same data shape as `layout.tree(...)`, places depths as columns,
centers parents over their child groups, and lets `leafGap` keep adjacent leaf
rows tighter than the larger `siblingGap` between bigger branch groups.

Use `secondaryEdges` for meaningful cross-links that should remain arrows. Use
`sidecars` for weak or explanatory relationships that would otherwise create a
long reverse arrow through the tree.

If the canvas has a title, subtitle, legend, or other reserved heading area, set
`reservedTopBand` to the bottom of that area. `sidecars` and routed
`secondaryEdges` will avoid starting in that top band, and reverse same-row
secondary edges will use a lower route when the usual upper route would collide
with the title.

Use `layout.planTreeLayout(...)` before drawing when the diagram shape is not
obvious. The `auto` request returns:

- `process-flow` for long linear process spines, such as document ingestion or
  validation chains that would otherwise become a tall narrow tree.
- `horizontal-tree` when it is requested explicitly for a left-to-right
  hierarchy.
- `wide-tree` for deep but still hierarchical trees that need wider panels.
- `tree` for branching or compact hierarchies.

Use `layout.processFlow(...)` with the same `root`, `secondaryEdges`, and
`sidecars` data when a linear process should wrap into rows instead of extending
down the page. Rows snake left-to-right, then right-to-left, so the primary
sequence remains compact while provenance and feedback arrows still route
through outer lanes.

For weak/local models, prefer restricted TypeScript graph code before reaching
for JSON. A semantic redraw should normally use `layout.node(...)`,
`layout.row(...)` / `layout.column(...)`, `layout.section(...)`, and
`layout.connect(...)` by named variables.

`semantic-redraw-spec` remains available for older data-only architecture redraw
specs:

```bash
excalidraw-diagrams semantic-redraw-spec semantic-redraw.json \
  --out diagram.excalidraw \
  --png diagram.png
```

The compatibility renderer validates string-array bullets, bundled icon ids,
unique section orders, edge endpoints, and one-icon output before writing the
diagram.
Model-supplied edge directions are advisory by default: the renderer infers
geometry and reports mismatches as warnings. Use `--strict-edge-directions`
when you want declared-direction mismatches to fail.

A ready spec ships with this skill at `assets/tree-spec.example.json`; copy it
into your workspace and run:

```bash
excalidraw-diagrams tree-spec assets/tree-spec.example.json \
  --layout auto \
  --out diagram.excalidraw \
  --png diagram.png
```

The JSON fields are the same as `layout.tree(...)`:

```json
{
  "layout": "auto",
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

Use `"layout": "horizontal-tree"` or CLI `--layout horizontal-tree` when the
source should look like a left-to-right concept tree. Use `"layout":
"process-flow"` or CLI `--layout process-flow` when the source is a process
chain rather than a hierarchy. Use `"layout": "tree"` when you need to force the
old measured top-down tree.

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
