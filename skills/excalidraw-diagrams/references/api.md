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

- `scene.bounds(elements=None)`
- `scene.group(elements)`

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
- `layout.card(scene, x, y, w, h, { iconId: "...", title: "...", description: "" })`
- `layout.iconPanel(scene, x, y, w, h, { title: "...", iconId: "...", bullets: [...] })`
- `layout.distributeHorizontal(blocks, x, y, { gap: 20 })`
- `layout.distributeVertical(blocks, x, y, { gap: 20 })`
- `layout.connect(scene, source, target)`
- `layout.alignLeft/right/center/top/bottom/middle(...)`
- `layout.centerIn(block, bounds)`

`layout.connect(scene, source, target)` draws from the source right edge to the
target left edge. For vertical arrows, branches, loops, or cross-panel links,
use `scene.arrow([[x1, y1], [x2, y2]], { dashed: true })` with explicit points.

## Output Contract

Generated files should be `.excalidraw` JSON with:

- `type == "excalidraw"`
- non-empty `elements`
- embedded `files` when SVG assets are used
- deterministic-enough ids from a fixed `Scene(seed=...)`
