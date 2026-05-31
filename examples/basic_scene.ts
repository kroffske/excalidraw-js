import { AssetRegistry, Scene, layout } from "../src/index.ts";

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

const title = scene.text(0, 0, "Payment flow", { size: 28, width: 360, align: "center" });
const api = layout.iconWithLabel(scene, "api_connector", 0, 90, { label: "API", iconSize: 64 });
const worker = layout.iconWithLabel(scene, "robot_agent", 180, 90, { label: "Worker", iconSize: 64 });
const db = layout.iconWithLabel(scene, "historical_database", 360, 90, { label: "Database", iconSize: 64 });

layout.alignCenter([title], api.bounds.left + (db.bounds.right - api.bounds.left) / 2);
layout.connect(scene, api, worker);
layout.connect(scene, worker, db);

scene.write("examples/out/basic_scene.excalidraw");
