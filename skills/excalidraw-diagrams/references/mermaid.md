# Mermaid bridge

Read this when you have a small rough graph or an existing Mermaid draft whose
shape can survive Mermaid's simpler layout model. For real C4 / component
architecture prefer `references/semantic-redraw.md`; for hierarchies that need
measured placement prefer `references/tree-spec.md`.

`layout.fromMermaid(scene, mermaidText, options)` parses a `graph TD` / `graph
LR` block and lays it out. In the `tree` scenario, solid unlabeled arrows become
the primary hierarchy; dotted or labeled arrows (`-. restores .->`) become routed
secondary edges that stay outside the main flow. Map node ids to icons with
`icons`, and pass `reservedTopBand` so routed edges keep clear of the title.

```ts
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const outDir = "examples/out/mermaid";
mkdirSync(outDir, { recursive: true });

const scene = new Scene({ seed: 7, assetRegistry: AssetRegistry.bundled() });
scene.text(40, 24, "Mermaid bridge", { size: 28, width: 760, align: "center" });

layout.fromMermaid(scene, `
  graph TD
    Session["Session state"] --> Plan["Plan branch"]
    Session --> Todo["Todo branch"]
    Plan --> Parser["Regex parser"]
    Todo -. restores .-> Plan
`, {
  scenario: "tree",
  x: 80,
  y: 110,
  nodeWidth: 230,
  nodeHeight: 120,
  reservedTopBand: 90,
  icons: { Session: "memory_database", Plan: "agent_planner", Todo: "tool_call", Parser: "filter_funnel" },
});

const excalidrawPath = `${outDir}/mermaid.excalidraw`;
scene.write(excalidrawPath);

const data = JSON.parse(readFileSync(excalidrawPath, "utf8"));
assert.equal(data.type, "excalidraw");
assert.ok(data.elements.length > 0);
```

For a quick non-tree draft, omit `scenario: "tree"` and pass `{ x, y }`; the
default scenario lays nodes out by Mermaid level. Refine labels, sections, and
routed secondary edges afterward.
