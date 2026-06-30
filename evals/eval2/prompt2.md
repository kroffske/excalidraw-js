---
eval: eval2
slug: excalidraw-js-repo-map
diagram_title: weak-model excalidraw-js repo map
thesis: A request moves from the user surface (README, CLI, examples) through the planning skills into the core graph/layout/render source, which emits a validated .excalidraw artifact, with tests and validation as the quality gates.
layout_family: layered-map
mode: stepwise
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval2
---

<!--
This is a STEPWISE eval (mode: stepwise). The runner drives three steps; only the
body below is sent to the model at the draw step, with the gathered plan appended.

  Step 1 — Gather (WITH tools): the model explores THIS repo and writes a compact
           architecture digest -> step1-context.md.
  Step 2 — Plan (no tools): the model turns the digest into a graph plan
           (sections + primary/optional edges) -> step2-plan.md.
  Step 3 — Draw: the body below + the Step-2 plan -> restricted-TS graph -> render.

The Step-1 / Step-2 prompt text lives in scripts/weak-llm-improve/run-prompt.mjs
(generic: explore repo -> digest -> plan). Edit the draw instructions here.
-->

Use $plan-excalidraw-graph, $plan-excalidraw-weak-llm, and $excalidraw-diagrams.

Task: author a semantic Excalidraw diagram as restricted TypeScript graph source.

You are a weak/local model lane. Do not write raw Excalidraw JSON. Do not calculate detailed coordinates for every card. Think in named graph objects and relationships. Use the plan you gathered (appended below) as the source of truth; do not invent components that are not in it.

Diagram thesis: A request moves from the user surface (README, CLI, examples) through the planning skills into the core graph/layout/render source, which emits a validated .excalidraw artifact, with tests and validation as the quality gates.
Layout family: layered-map
Expected sections: User surface, Planning skills, Core source, Layout and render, Validation and tests.
Quality target: The layered map should read top-to-bottom: user surface -> planning -> core -> render -> validation; keep each section a wide row.
Layout hint: Five horizontal bands, each a wide row. Keep validation/tests as the bottom band. Do not stack a section into a tall vertical column.

The runner already provides:
- `scene`: a Scene with bundled assets.
- `layout`: the excalidraw-diagrams layout namespace.
- `node(id, title, iconId, bullets)`: creates a named auto-sized card and records its bounds.
- `section(title, group)`: wraps a row/column/group in a measured section. The runner stacks sections; do not pass coordinates.
- `connect(edgeId, fromId, toId, label, options?)`: connects named cards and records the edge for validation.

Allowed authoring pattern:
```ts
const surface = layout.row({
  readme_docs: node("readme_docs", "README and docs", "news_document", ["install path"]),
  examples: node("examples", "Example generators", "prompt_template", ["smoke proof"]),
});
section("User surface", surface);

const core = layout.row({
  graph_api: node("graph_api", "Graph API", "api_connector", ["diagram.flow", "named IDs"]),
});
section("Core source", core);

connect("examples_to_api", "examples", "graph_api", "demonstrates");
```

Rules:
- Return exactly one fenced ```ts code block and no prose outside it.
- Before writing code, internally make a pre-code plan: thesis, layout_family, sections, primary_edges, supporting_edges, optional_edges_omitted, and row_order_notes. Do not print the plan.
- Use stable snake_case ids.
- Use only known icon ids from this list: news_document, tool_call, prompt_template, api_connector, agent_planner, data_catalog, function_router, model_validation, server_stack, historical_database, model_deployment, cloud_data, signal_quality_magnifier, monitoring_dashboard.
- Use `layout.row`, `layout.column`, `section(title, group)`, `node(...)`, and `connect(...)`.
- Do not pass x/y coordinates to `section`; the runner computes section positions.
- Do not tune small gaps. Omit `gap` unless the semantic grouping needs extra space.
- Do not import anything.
- Do not create `Scene`.
- Do not call `scene.write`.
- Do not use numeric child indexes.
- Do not create one parent row/column containing all sections. Build each section group independently, then call `section(...)`.
- Order nodes to minimize primary edge length: put the target under/next to the source for primary edges.
- Omit optional edges that would cross two or more section bands or make the primary story harder to read.
- Create all sections before `connect(...)`, then emit `connect(...)` calls in primary-story order.
- Keep the graph to 12-18 nodes and 10-16 edges.
- Use short relationship labels: feeds, trains, publishes, validates, loads, serves, releases.
