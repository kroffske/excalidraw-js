# Examples

Use these patterns when writing scripts for users.

## Basic Flow

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

const api = layout.iconWithLabel(scene, "api_connector", 0, 80, { label: "API" });
const agent = layout.iconWithLabel(scene, "robot_agent", 180, 80, { label: "Agent" });
const db = layout.iconWithLabel(scene, "historical_database", 360, 80, { label: "Store" });

layout.connect(scene, api, agent);
layout.connect(scene, agent, db);

scene.write("diagram.excalidraw");
```

## Richer Example

The repository includes `examples/excalidraw_diagrams_workflow.ts`. It writes `examples/out/excalidraw_diagrams_workflow.excalidraw`. The example has:

- title and subtitle text
- three panel sections
- multiple bundled SVG assets
- arrows between `PlacedBlock` objects
- embedded SVG file payloads under `files`

Run:

```bash
npx tsx examples/excalidraw_diagrams_workflow.ts
```

## Baseline Repository Architecture

The package CLI includes `excalidraw-js-architecture`. It writes
`examples/out/baseline/excalidraw-js-architecture.excalidraw` and is the
preferred smoke proof for this package after installation. It shows:

- agent skill guidance
- Pi or Claude agent path
- TypeScript script
- `Scene`, `layout`, and `AssetRegistry.bundled()`
- bundled SVG assets embedded in `.excalidraw` JSON
- JS renderer producing a PNG
- visual review

Run:

```bash
npx excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline
npx excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png
```

Required shape:

- Short title: `excalidraw-js baseline architecture`.
- First row: skill references, Pi or Claude agent, TypeScript script, `Scene + layout`, `AssetRegistry.bundled()`.
- Second row: `.excalidraw JSON`, embedded SVG files, JS renderer PNG, visual review.
- One arrow from assets down to JSON output.
- One warning line against Python, `uv pip`, `.venv`, `site-packages`, `AssetRegistry.keys()`, and `AssetRegistry.size`.

Validation contract:

- JSON path: `examples/out/baseline/excalidraw-js-architecture.excalidraw`.
- PNG path: `examples/out/baseline/excalidraw-js-architecture.png`.
- JSON has `type == "excalidraw"`, non-empty `elements`, and non-empty `files`.

## Agent-Friendly Pipeline Template

Use this shape for architecture or ML pipeline diagrams. It keeps the model out
of raw element dictionaries and avoids package-path guessing.

```ts
import { mkdirSync, readFileSync } from "node:fs";
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const outDir = "examples/out";
mkdirSync(outDir, { recursive: true });

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

scene.text(40, 24, "ML Pipeline", { size: 28, width: 900 });

const training = layout.panel(scene, 40, 80, 1160, 210, { title: "Training" });
const trainNodes = layout.distributeHorizontal(
  [
    layout.iconWithLabel(scene, "data_lake", 0, 0, { label: "Raw data" }),
    layout.iconWithLabel(scene, "feature_engineering", 0, 0, { label: "Features" }),
    layout.iconWithLabel(scene, "model_training", 0, 0, { label: "Train" }),
    layout.iconWithLabel(scene, "model_validation", 0, 0, { label: "Validate" }),
    layout.iconWithLabel(scene, "model_registry", 0, 0, { label: "MLflow" }),
  ],
  training.bounds.left + 55,
  training.bounds.top + 75,
  { gap: 95 },
);
for (let index = 0; index < trainNodes.length - 1; index += 1) {
  layout.connect(scene, trainNodes[index], trainNodes[index + 1]);
}

const deploy = layout.panel(scene, 40, 340, 1160, 210, { title: "Deploy" });
const deployNodes = layout.distributeHorizontal(
  [
    layout.iconWithLabel(scene, "server_stack", 0, 0, { label: "Build env" }),
    layout.iconWithLabel(scene, "cloud_data", 0, 0, { label: "Nexus" }),
    layout.iconWithLabel(scene, "api_connector", 0, 0, { label: "Load model" }),
    layout.iconWithLabel(scene, "model_deployment", 0, 0, { label: "Triton" }),
    layout.iconWithLabel(scene, "monitoring_dashboard", 0, 0, { label: "Prod" }),
  ],
  deploy.bounds.left + 55,
  deploy.bounds.top + 75,
  { gap: 95 },
);
for (let index = 0; index < deployNodes.length - 1; index += 1) {
  layout.connect(scene, deployNodes[index], deployNodes[index + 1]);
}

scene.arrow(
  [[trainNodes[4].bounds.centerX, trainNodes[4].bounds.bottom], [deployNodes[2].bounds.centerX, deployNodes[2].bounds.top]],
  { dashed: true },
);

const excalidrawPath = `${outDir}/pipeline.excalidraw`;
scene.write(excalidrawPath);

const data = JSON.parse(readFileSync(excalidrawPath, "utf8"));
console.assert(data.type === "excalidraw");
console.assert(data.elements.length > 0);
console.log(excalidrawPath);
```

Render PNG after the generator succeeds:

```bash
npx excalidraw-render --setup examples/out/pipeline.excalidraw examples/out/pipeline.png
```

## Asset Discovery In Scripts

```ts
import { AssetRegistry } from "@kroffske/excalidraw-diagrams";

const core = AssetRegistry.bundled();
const trading = AssetRegistry.bundled("trading");
console.log(core.groups());                    // { agents: [...], data: [...] }
console.log(core.ids().slice(0, 10));
console.log(core.resolve("robot_agent").id);   // agents_robot_agent_01-01
console.log(trading.resolve("bull").id);       // trading_bull_01-03
```

## Review Pattern

When reviewing an existing generated file:

```ts
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("diagram.excalidraw", "utf8"));
console.assert(data.type === "excalidraw");
console.assert(data.elements.length > 0);
console.assert(typeof (data.files ?? {}) === "object");
```

Then inspect whether labels overlap, arrows show actual causality, and asset choices match the diagram domain.
