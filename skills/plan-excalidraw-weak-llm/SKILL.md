---
name: plan-excalidraw-weak-llm
description: Plan and prompt weak/local LLMs to author readable Excalidraw diagrams as restricted TypeScript graph code. Use when a weak model, local Qwen/oMLX model, OpenRouter model, or retry loop produces syntactically valid diagrams with confusing arrows, index-based relationships, guessed coordinates, poor row ordering, or noisy edge routing.
---

# Plan Excalidraw Weak LLM

## Overview

Use this skill before asking a weak model to write Excalidraw TypeScript. The
goal is to make the model think as a graph designer first: semantic inventory,
edge priority, row ordering, then restricted TypeScript.

This skill complements `plan-excalidraw-graph` and `excalidraw-diagrams`.
`plan-excalidraw-graph` decides what the diagram means. This skill decides how
to phrase that plan so a weaker model can draw it without inventing indexes,
coordinates, icons, or confusing arrow paths.

## Core Rule

Do not ask a weak model to place a canvas. Ask it to author a named graph.

The runner owns geometry:

- section y positions and canvas height
- card sizing and minimum gaps
- row wrapping above four cards so a dense band stays inside the canvas
- icon id validation
- edge ports and routing
- overlap and arrow-through-block validation

The model owns semantics:

- section names
- node ids, titles, and bullets
- relationship ids and labels
- which relationships are important enough to draw
- row/column ordering that makes the important relationships short

## Workflow

1. **Write the diagram thesis.** One sentence: what the viewer should understand
   after 20 seconds.

2. **Choose the layout family.** Pick one:
   `layered-map`, `process-spine`, `swimlane`, `hub-and-spoke`, `c4-boundary`,
   `tree-with-crosslinks`, or a short custom phrase. Do not use one generic
   row grid for every problem.

3. **Create a semantic inventory.** List sections and nodes before writing code.
   Each node needs a stable `snake_case` id, a short title, 1-3 bullets, and a
   known icon id.

4. **Create an edge budget.** List edges before code and classify each edge as:
   `primary`, `supporting`, or `optional`.

5. **Order rows to reduce routes.** For adjacent sections, align the target node
   under the source node for primary cross-layer edges. Put intra-layer chains
   next to each other. Put weakly connected nodes at row edges.

6. **Drop noisy optional edges.** If an optional edge crosses two or more bands,
   runs through unrelated sections, or only restates a node bullet, omit it or
   turn it into a note. Do not draw every true relationship.

7. **Emit restricted TypeScript.** Create all nodes and sections first. Emit all
   `connect(...)` calls after every node exists. Connect by stable ids or named
   variables, never by numeric indexes.

8. **Run and retry.** On hard errors, feed concise runner errors back to the
   model and ask it to rewrite the full source. Do not silently fix semantic
   mistakes in the runner.

## Required Pre-Code Plan

Before TypeScript, write this compact plan in the prompt or scratch artifact:

```md
thesis: ...
layout_family: layered-map

sections:
- user_surface: readme_docs, cli_bins, examples, package_exports
- planning_authoring: planning_skill, drawing_skill, graph_api, spec_drivers

primary_edges:
- examples -> graph_api: demonstrates
- graph_api -> layout_helpers: delegates

supporting_edges:
- readme_docs -> planning_skill: frames

optional_edges_omitted:
- validation -> vitest_suite: true but visually noisy across artifact layer

row_order_notes:
- Put graph_api below examples because examples -> graph_api is primary.
- Put layout_helpers below graph_api because graph_api -> layout_helpers is primary.
- Put spec_drivers at the row edge because it has fewer primary edges.
```

If the pre-code plan is missing `primary_edges` and `row_order_notes`, make the
model add them before asking for TypeScript.

## Restricted TypeScript Contract

Prefer a tiny helper surface in the runner:

```ts
const user_surface = layout.row({
  readme_docs: node("readme_docs", "README and docs", "news_document", ["install path", "operator guidance"]),
  examples: node("examples", "Example generators", "prompt_template", ["source demos", "smoke proof"]),
  package_exports: node("package_exports", "Package exports", "api_connector", ["public modules"]),
});
section("User surface", user_surface);

const authoring = layout.row({
  planning_skill: node("planning_skill", "Planning skill", "agent_planner", ["graph thesis"]),
  drawing_skill: node("drawing_skill", "Drawing skill", "prompt_template", ["restricted TS graph"]),
  graph_api: node("graph_api", "Graph API", "api_connector", ["diagram.flow", "named IDs"]),
});
section("Planning and authoring", authoring);

connect("examples_demonstrate_api", "examples", "graph_api", "demonstrates");
```

The runner should provide `node(...)`, `section(title, group)`, and
`connect(edgeId, fromId, toId, label, options?)`. The model should not import,
instantiate `Scene`, call `scene.write`, pass section y coordinates, calculate
card sizes, or tune tiny gaps.

For a `layered-map`, build each section as its own top-level `layout.row(...)`.
Do not create one parent `layout.row` containing all sections as columns. This
is the most common way weak models turn a vertical layer map into confusing
horizontal lanes.

## Output Contract

This is the format the runner extracts and renders, so the prompt should not have
to restate it — keep it here:

- Return **exactly one fenced ` ```ts ` code block and no prose outside it.** The
  runner takes the single TypeScript block and renders it; surrounding text is
  discarded and extra blocks break extraction.
- Do the pre-code plan (thesis, sections, primary edges, row order) **internally**
  — do not print it. The final message is only the one ` ```ts ` block, nothing
  before or after it.
- Build every section group first, then emit all `connect(...)` calls in
  primary-story order. Connect by stable `snake_case` ids or named variables —
  never numeric child indexes.
- Keep the graph to **8-18 nodes** and roughly one primary edge per process
  handoff. Cover the stated requirements, but do not pad a small workflow with
  invented nodes. Drop optional edges that cross two or more bands instead of
  drawing every true relationship.
- Preserve every explicit answer/result, ordering rule or invariant, decision
  branch, and complexity claim from source documentation. Put each in a node or
  bullet; do not silently drop it to reduce the graph.
- Use **short** relationship labels (`feeds`, `trains`, `publishes`, `validates`,
  `loads`, `serves`, `releases`). The runner centers labels on the line; do not
  pass label offsets or coordinates.
- Use only these known core icon ids (the runner hard-fails unknown ids):
  `news_document`, `tool_call`, `prompt_template`, `api_connector`,
  `agent_planner`, `data_catalog`, `function_router`, `model_validation`,
  `server_stack`, `historical_database`, `model_deployment`, `cloud_data`,
  `signal_quality_magnifier`, `monitoring_dashboard`.

## Bad Patterns To Reject

Reject these as hard failures or retry triggers:

- `workspaceSection[0] -> mlPipelineSection[1]`
- `children[2]`
- `const all_sections = layout.row({ user_surface: layout.column(...), ... })`
  when the intended layout is a top-to-bottom layered map
- unknown `iconId` values such as `folder`
- raw Excalidraw JSON dictionaries
- manual canvas coordinates for every card
- sections created as empty or stretched containers around unrelated single
  items
- connections emitted before target nodes exist
- many optional cross-layer edges drawn just because they are true

## Layout Heuristics

- For `layered-map`, most primary edges should go to the next layer and be
  vertical or near-vertical.
- In a `layered-map`, use one top-level `layout.row({...})` per section. Use
  `layout.column` only inside a section when that section itself needs multiple
  rows.
- Keep each section semantically row-shaped. The runner keeps up to four cards
  on one row and automatically wraps a 5-6 card band into two centered rows, so
  the model should not calculate canvas width or hand-build wrapping columns.
- For `process-spine`, place the main flow in one `layout.row({...})` and move
  support nodes into separate sidecar sections. If the flow has more than six
  steps, keep them in that row group: the runner wraps it into balanced rows.
  Avoid a single `layout.column` with 7+ cards; it produces a tall sheet with
  empty horizontal space.
- For `swimlane`, keep lane ownership stable and route handoffs at lane
  boundaries.
- For `hub-and-spoke`, put the hub in the center only if many edges share it;
  otherwise use a process spine.
- For `c4-boundary`, draw one section per real boundary and connect containers,
  not every file.
- For `tree-with-crosslinks`, keep hierarchy in the tree and make cross-links
  supporting or optional.

Read `references/layout-reasoning.md` when the weak model keeps producing
confusing routes. Read `references/eval-suite.md` when building regression
examples for prompt experiments.

## Retry Guidance

When validation fails, respond with one concise repair instruction:

- Unknown icon id: replace it with a listed allowed id.
- Missing node id: create all nodes before `connect(...)`.
- Duplicate id: rename or merge the duplicated node.
- Arrow-through-block: reorder rows to align the source and target, or drop an
  optional edge. Do not only add more gap.
- Label overlap: shorten the edge label or reduce optional edges; the runner
  handles placement.
- Output clipped: let the runner grow the canvas; do not ask the model to invent
  y coordinates.

The retry prompt should ask for a full rewritten source block, not a patch.

## Output Artifacts

For experiments, write artifacts under `.tmp/excalidraw-weak-llm/<slug>/` unless
the project has a stronger convention. Keep:

- `input-request.md`
- `graph-plan.md`
- `prompt.md`
- `attempt-N-source.ts`
- `attempt-N-error.txt`
- `attempt-N-diagram.excalidraw`
- `attempt-N-diagram.png`
- `judge.md`
- `comparison.md`
