---
name: excalidraw-diagrams
description: Use when an agent needs to create, review, or improve Excalidraw diagrams with the excalidraw-diagrams TypeScript npm package, especially architecture diagrams, data/ML workflows, agent workflows, and LLM-generated .excalidraw files.
---

# Excalidraw Diagrams

Use `excalidraw-diagrams` to generate `.excalidraw` JSON through the TypeScript npm package instead of writing raw Excalidraw element dictionaries by hand.

## Preflight

- This skill is for diagram generation only. Do not run package or skill setup from this skill, including `npm install`, `npm install <path>`, `npx @kroffske/excalidraw-diagrams setup`, `excalidraw-diagrams setup`, or `commands/setup.md`.
- Before generating, verify that the package is already available. For a project dependency, run `node -e "const {createRequire}=require('node:module'); console.log(createRequire(process.cwd() + '/probe.js').resolve('@kroffske/excalidraw-diagrams'))"` and confirm it resolves under the current workspace's `node_modules/@kroffske/excalidraw-diagrams`, not under a target source checkout. For a global CLI workflow, run `command -v excalidraw-diagrams`, `command -v excalidraw-assets`, and `command -v excalidraw-render`.
- If the package or CLI is not already installed, stop and tell the user to run setup, for example `npm install @kroffske/excalidraw-diagrams` in the current workspace or `npm install -g @kroffske/excalidraw-diagrams && excalidraw-diagrams setup --agent generic` for a user-level Pi/global CLI setup. Do not perform the install yourself unless the user explicitly asks for setup.
- Treat target repositories as read-only source material. Never install from a target repository path such as `npm install /path/to/source`, never install `file:../source`, and never execute a target checkout's `dist/bin`.
- Use the TypeScript/npm API: `import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";`.
- Do not use the older Python API (`excalidraw_diagrams`, `uv pip`, or `site-packages`) when this TypeScript skill is loaded.
- For known bundled examples, prefer an already installed package CLI before writing custom scripts. For the repository baseline, run `excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline`, then render with `excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png`. If only a project-local CLI is installed, use `npx --no-install` so npm does not fetch or install anything.
- For custom diagrams, prefer one small `.mjs` generator run with `node`, plus `excalidraw-render --setup input.excalidraw output.png` when PNG output is required. Use `npx --no-install tsx` only when the workspace already has `tsx` installed and you chose a `.ts` generator.
- Reference files are next to this skill: `references/api.md`, `references/examples.md`, and `references/assets.md`. Do not look under a top-level `docs/references/` path.
- `AssetRegistry` exposes `.ids()`, `.groups()`, `.resolve(...)`, `.resolveGroup(...)`, and `.resolveIndex(...)`; it does not expose `.keys()` or `.size`.
- Baseline repository proof guidance is consolidated in `references/examples.md` under "Baseline Repository Architecture".

## Core Pattern

Create a `Scene`, use layout helpers for structure, place bundled SVG assets by id or alias, then write the `.excalidraw` file.

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

const ingest = layout.iconWithLabel(scene, "api_connector", 0, 0, { label: "Ingest" });
const worker = layout.iconWithLabel(scene, "robot_agent", 180, 0, { label: "Agent" });
const store = layout.iconWithLabel(scene, "historical_database", 360, 0, { label: "Store" });

layout.connect(scene, ingest, worker);
layout.connect(scene, worker, store);

scene.write("diagram.excalidraw");
```

For detailed method references, read `references/api.md`. For fuller examples and the package architecture baseline, read `references/examples.md`.

## Drawing Guidance

- Prefer `layout.iconWithLabel`, `layout.card`, `layout.panel`, `layout.bulletList`, `layout.distributeHorizontal`, `layout.distributeVertical`, and `layout.connect` before hand-positioning every element.
- Use `AssetRegistry.bundled()` for the default `core` pack (neutral agents + data icons). Use `AssetRegistry.bundled("trading")` for the thematic fintech pack. Resolve icons by full id, short alias such as `robot_agent`, or numeric code such as `01-01`.
- Keep diagrams readable: left-to-right or top-to-bottom flow, consistent gaps, short labels, and explicit arrows for causality or data flow.
- Use a fixed `new Scene({ seed: ... })` so generated ids are deterministic enough for review.
- Write outputs under an ignored directory such as `examples/out/` unless the user asks to commit the diagram artifact.
- For weak/local models, choose a scenario helper before drawing coordinates. Prefer `layout.tree(...)` for top-down hierarchy and pass node data; do not hand-place every child when the relationship is a tree.
- In `layout.tree(...)`, put hierarchy in `children`, put cross-links in `secondaryEdges`, and put weak/non-hierarchy details in `sidecars`. This keeps reverse arrows outside the main tree or replaces them with readable notes.
- For Mermaid drafts that should become trees, use `layout.fromMermaid(scene, mermaidText, { scenario: "tree", icons: {...} })`. Solid unlabeled arrows become primary hierarchy; dotted or labeled arrows become routed secondary edges.
- If the model is struggling to write correct TypeScript, use the data-only path: create a JSON file like `examples/plan_todo_tree_spec.json`, then run `excalidraw-diagrams tree-spec spec.json --out diagram.excalidraw --png diagram.png`.
- For top-down trees, use `layout.connect(scene, parent, child, { direction: "top-down", path: "orthogonal" })`. This routes from the parent bottom edge to the child top edge.
- For left-to-right flows, use `layout.connect(scene, left, right, { direction: "left-to-right", path: "orthogonal" })`. This routes from the source right edge to the target left edge.
- Use `layout.connectSmart(scene, source, target)` when blocks are already placed and you want the helper to infer the nearest sensible sides.
- For quick non-tree drafts, write a small Mermaid `graph TD` or `graph LR` first and convert it with `layout.fromMermaid(scene, mermaidText, { x, y })`; then refine the generated blocks if needed.
- Avoid drawing arrows through titles, labels, or icon panels. Route arrows along empty corridors between levels.

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
- Text labels fit their intended blocks and do not overlap arrows or icons.
- Asset ids resolve through `AssetRegistry`; do not invent ids without checking the registry.
- The diagram communicates the system shape without requiring the reader to inspect the TypeScript source.

## Optional PNG Export

The TypeScript package writes Excalidraw JSON. If PNG output is required, render the generated file with:

```bash
excalidraw-render --setup diagram.excalidraw diagram.png
```

Do not perform package, skill, or renderer package setup from this skill. If setup is required, stop and give the user the setup command to run.
