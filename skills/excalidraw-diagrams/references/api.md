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

- `scene.bounds(elements?)` — bounds of the passed elements, or of the whole scene when omitted
- `scene.group(elements)`

## Measured Text, NodeCard & Validation

Prefer these for architecture diagrams: they wrap text by measurement, keep it
inside frames, and let you assert the diagram is healthy before `write`.
`scene.text` / `layout.bulletList` are unchanged and still break only on `\n`.

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
- `layout.card(scene, x, y, w, h, { iconId: "...", title: "...", description: "" })`
- `layout.iconPanel(scene, x, y, w, h, { title: "...", iconId: "...", bullets: [...] })`
- `layout.tree(scene, { root, secondaryEdges, sidecars }, { x, y, nodeWidth, levelGap, siblingGap, reservedTopBand })`
- `layout.planTreeLayout({ root, secondaryEdges, sidecars }, options, "auto")`
- `layout.processFlow(scene, { root, secondaryEdges, sidecars }, { x, y, nodeWidth, wrapColumns, reservedTopBand })`
- `layout.routeEdges(scene, diagram, secondaryEdges, { gutter: 48, reservedTopBand })`
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
- `wide-tree` for deep but still hierarchical trees that need wider panels.
- `tree` for branching or compact hierarchies.

Use `layout.processFlow(...)` with the same `root`, `secondaryEdges`, and
`sidecars` data when a linear process should wrap into rows instead of extending
down the page. Rows snake left-to-right, then right-to-left, so the primary
sequence remains compact while provenance and feedback arrows still route
through outer lanes.

For weak/local models, prefer a data-only JSON spec when TypeScript generation
is brittle:

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

Use `"layout": "process-flow"` or CLI `--layout process-flow` when the source
is a process chain rather than a hierarchy. Use `"layout": "tree"` when you need
to force the old measured top-down tree.

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
