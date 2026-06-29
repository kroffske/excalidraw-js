---
name: plan-excalidraw-graph
description: Plan semantic Excalidraw graph diagrams before drawing. Use when a user asks for a repository map, architecture graph, workflow graph, C4-like view, Mermaid/PlantUML-to-Excalidraw redraw, or weak/local-LLM diagram generation and the diagram intent, semantic layers, nodes, or relationships are not yet clear.
---

# Plan Excalidraw Graph

## Overview

Use this skill to plan the semantic graph before using `excalidraw-diagrams`.
The output is a named graph plan: sections, nodes, relationships, layout intent,
and the one decision point that matters before drawing.

## Boundary

- Stay in planning until the graph idea is clear. Do not jump straight into
  rendering, TypeScript generation, exhaustive repository archaeology, or PNG
  export unless the user explicitly asked for an end-to-end autonomous run.
- Prefer a small, useful semantic model over a complete inventory. The diagram
  should explain an idea, not mirror every file or class.
- Use stable ids and named relationships. Never plan links as numeric child
  indexes such as `section[0] -> section[1]`.
- Let the drawing skill or runner handle coordinates, card sizes, edge ports,
  routing, and collision avoidance.

## Workflow

1. **Classify the request.** Identify the diagram thesis in one sentence: what
   the viewer should understand after 20 seconds. For repository maps, the
   default thesis is a semantic layer view of the repo: entrypoints, core
   runtime, data/state, integrations, tooling, docs/skills, and proof gates.

2. **Choose interaction mode.** If the user asked for autonomous or end-to-end
   work, make reasonable decisions and continue. Otherwise plan one approval
   checkpoint before drawing. Do not ask scattered questions early unless the
   request is impossible to scope.

3. **Create a planning workspace.** If the project has no standard task artifact
   directory, write temporary notes under
   `.tmp/excalidraw-graph-plan/<short-slug>/`. Create the directory if needed.
   Do not delete these artifacts; leave cleanup to the user.

4. **Gather context with a narrow scout pass.** For a repository, inspect only
   enough source truth to plan the graph: README/docs, package manifests, source
   entrypoints, CLI/routes, tests, examples, and visible task/design docs. Use
   `rg --files` first. Do not read the whole repo by default.

5. **Use subagents when available.** For large or unfamiliar repos, launch
   read-only subagents for bounded scouting, for example `repo_layers`,
   `runtime_flow`, and `diagram_review`. Ask them for evidence-backed candidate
   sections, nodes, missing concepts, and risks. Store or summarize their
   outputs under the planning workspace. If no subagent tool exists, do the same
   scout pass serially.

6. **Draft the graph plan.** Write named sections/clusters, node cards, and
   relationships. Each node should have a stable `snake_case` id, a short title,
   1-3 bullets, and an optional icon hint. Each edge should name `from`, `to`,
   and a semantic label such as `calls`, `reads`, `writes`, `renders`, `owns`,
   `validates`, or `publishes`.

7. **Run the single checkpoint.** In interactive mode, show the plan summary and
   ask for `Approve` or specific adjustments before invoking
   `excalidraw-diagrams`. In autonomous mode, record assumptions and continue.

8. **Hand off to drawing.** Pass the approved plan to `excalidraw-diagrams` as
   restricted TypeScript graph code: `layout.node(...)`, `layout.row(...)` /
   `layout.column(...)`, `layout.section(...)`, and `layout.connect(...)` by
   named variables.

## Plan Artifact

For reusable structure, read `references/plan-format.md` and write
`graph-plan.md` in the planning workspace. Keep the artifact concise enough that
another model can turn it into TypeScript graph code without rereading the repo.

Minimum fields:

- `diagram_thesis`: the idea the graph should communicate.
- `audience`: who the diagram is for and what they need to decide.
- `scope` and `out_of_scope`: what is included and intentionally omitted.
- `sections`: named boundaries or clusters.
- `nodes`: stable ids, titles, bullets, and icon hints.
- `relationships`: named edges by semantic ids.
- `layout_intent`: `layered`, `process`, `tree`, `swimlane`, `c4`, or a short
  custom phrase.
- `checkpoint`: the approval question or autonomous assumption.

## Repository Layer Defaults

When the request is "draw this repository" and the user gives no narrower lens,
start with these candidate sections and prune aggressively:

- `user_surface`: CLI, public API, exported commands, examples, docs entrypoints.
- `authoring_model`: prompts, skills, source formats, graph plan, C4/Mermaid
  inputs, semantic TypeScript graph code.
- `layout_runtime`: graph/layout helpers, validation, asset resolution, routing,
  measured sections, renderer handoff.
- `assets_and_state`: bundled assets, generated `.excalidraw` files, PNG output,
  caches, task/proof artifacts.
- `quality_gates`: tests, typecheck, examples, evals, release or pack checks.

Use only the sections that support the thesis. Rename them to match the actual
repo vocabulary.

## Quality Bar

- The plan should be understandable without reading code or prior chat.
- Every planned relationship should connect named ids, not positions or indexes.
- Every section should contain at least two meaningful nodes unless it is a real
  external actor or durable artifact.
- Unknown or uncertain parts should be marked as assumptions, not silently
  invented.
- The plan should be small enough to draw cleanly on one canvas.

## Handoff Shape

The handoff to `excalidraw-diagrams` should look like this:

```ts
const authoring = layout.column({
  graphPlan: layout.node(scene, {
    title: "Graph plan",
    iconId: "prompt_template",
    bullets: ["sections", "nodes", "relationships"],
  }),
  typeScriptGraph: layout.node(scene, {
    title: "TypeScript graph",
    iconId: "tool_call",
    bullets: ["named objects", "layout intent"],
  }),
}, { gap: 24 });

layout.section(scene, { title: "Authoring", x: 40, y: 120, children: [authoring] });
layout.connect(scene, authoring.graphPlan, authoring.typeScriptGraph, { label: "becomes" });
```
