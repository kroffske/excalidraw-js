# Graph Planning

Read this before drawing when the request names a repository map, architecture
graph, workflow graph, C4-like view, or a Mermaid/PlantUML redraw and the visual
thesis, semantic layers, nodes, or relationships are not yet clear.

The output of this phase is a named graph plan: sections, nodes, relationships,
layout intent, and the one decision point that matters before drawing. Return to
the main skill once that plan exists.

## Boundary

- Stay in planning until the graph idea is clear. Do not jump straight into
  rendering, TypeScript generation, exhaustive repository archaeology, or PNG
  export unless the user explicitly asked for an end-to-end autonomous run.
- Prefer a small, useful semantic model over a complete inventory. The diagram
  should explain an idea, not mirror every file or class.
- Use stable ids and named relationships. Never plan links as numeric child
  indexes such as `section[0] -> section[1]`.
- Let the drawing helpers and runner handle coordinates, card sizes, edge ports,
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
   ask for `Approve` or specific adjustments before drawing. In autonomous mode,
   record assumptions and continue.

8. **Hand off to drawing.** Turn the approved plan into restricted TypeScript
   graph code: `layout.node(...)`, `layout.row(...)` / `layout.column(...)`,
   `layout.section(...)`, and `layout.connect(...)` by named variables.

## Plan Artifact

Write `graph-plan.md` in the planning workspace when the plan needs to survive
the session. Keep it concise enough that another model can turn it into
TypeScript graph code without rereading the repo.

Minimum fields: `diagram_thesis`, `audience`, `scope` / `out_of_scope`,
`sections`, `nodes`, `relationships`, `layout_intent` (`layered`, `process`,
`tree`, `swimlane`, `c4`, or a short custom phrase), and `checkpoint`.

```md
# Graph Plan: <short title>

Status: draft | approved | autonomous-assumed
Mode: interactive | autonomous
Workspace: .tmp/excalidraw-graph-plan/<short-slug>/

## Request

Original request:

Diagram thesis:

Audience:

Scope:

Out of scope:

## Context Evidence

- `<path>` shows `<fact relevant to the diagram>`.
- `<path>` shows `<fact relevant to the diagram>`.

## Sections

| id | title | purpose | layout |
| --- | --- | --- | --- |
| `source_truth` | Source truth | Where the repo defines authoring contracts. | `layered` |

## Nodes

| id | section | title | icon hint | bullets |
| --- | --- | --- | --- | --- |
| `skill_contract` | `source_truth` | Skill contract | `prompt_template` | Guides agent workflow; names allowed surfaces |

## Relationships

| from | to | label | rationale |
| --- | --- | --- | --- |
| `skill_contract` | `typescript_graph` | `guides` | The skill tells the model which API shape to author. |

## Layout Intent

Use `<layered/process/tree/swimlane/c4>` because `<reason>`.

## Open Decisions

- `<decision>`: assumed `<choice>` because `<evidence or user preference>`.

## Checkpoint

Approve this plan, or adjust these items before drawing:

- Sections:
- Important missing nodes:
- Relationship direction or labels:
```

## Repository Layer Defaults

When the request is "draw this repository" and the user gives no narrower lens,
start with these candidate sections, prune aggressively, and rename them to match
the actual repo vocabulary.

| section id | Shows | Useful evidence |
| --- | --- | --- |
| `user_surface` | How users or agents enter the system. | CLI, public API, exported commands, examples, docs entrypoints. |
| `authoring_model` | What the model writes or plans. | Prompts, skills, source formats, graph plan, C4/Mermaid inputs, semantic TypeScript graph code. |
| `layout_runtime` | How meaning becomes geometry. | Graph/layout helpers, validation, asset resolution, routing, measured sections, renderer handoff. |
| `assets_and_state` | Durable outputs and reusable materials. | Bundled assets, generated `.excalidraw` files, PNG output, caches, task/proof artifacts. |
| `quality_gates` | How correctness is checked. | Tests, typecheck, examples, evals, release or pack checks. |

## Relationship Vocabulary

Prefer short semantic labels: `calls`, `reads`, `writes`, `owns`, `validates`,
`renders`, `publishes`, `imports`, `configures`, `feeds`, `generates`,
`reviews`, `uses`, `guards`, `routes`, `stores`.

Avoid vague labels such as `related`, `connected`, or `stuff`.

## Quality Bar

- The plan should be understandable without reading code or prior chat.
- Every planned relationship should connect named ids, not positions or indexes.
- Every section should contain at least two meaningful nodes unless it is a real
  external actor or durable artifact.
- Unknown or uncertain parts should be marked as assumptions, not silently
  invented.
- The plan should be small enough to draw cleanly on one canvas.

## Handoff Shape

The handoff into the drawing phase should look like this:

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
