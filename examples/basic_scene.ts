import { AssetRegistry, Scene, layout } from "../src/index.ts";

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

const title = scene.text(0, 0, "Payment flow", { size: 28, width: 360, align: "center" });
const flow = layout.row({
  api: layout.iconWithLabel(scene, "api_connector", 0, 0, { label: "API", iconSize: 64 }),
  worker: layout.iconWithLabel(scene, "robot_agent", 0, 0, { label: "Worker", iconSize: 64 }),
  db: layout.iconWithLabel(scene, "historical_database", 0, 0, { label: "Database", iconSize: 64 }),
}, { x: 0, y: 90, gap: 84 });

layout.alignCenter([title], flow.bounds.centerX);
layout.connect(scene, flow.api, flow.worker);
layout.connect(scene, flow.worker, flow.db);

scene.write("examples/out/basic_scene.excalidraw");
