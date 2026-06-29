# Graph Plan Format

Use this file when the planning skill needs a durable `graph-plan.md` artifact.
Keep it concise, evidence-backed, and easy to translate into TypeScript graph
code.

## Template

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

## Repository Layer Starter

For a repository-level diagram, use these as candidate lenses. Do not include
all of them automatically.

| section id | Shows | Useful evidence |
| --- | --- | --- |
| `user_surface` | How users or agents enter the system. | README, CLI files, package exports, examples. |
| `authoring_model` | What the model writes or plans. | Skills, prompts, source specs, diagram generators. |
| `layout_runtime` | How meaning becomes geometry. | Layout helpers, validators, routing, render commands. |
| `assets_and_state` | Durable outputs and reusable materials. | Asset registry, generated files, caches, reports. |
| `quality_gates` | How correctness is checked. | Tests, typecheck, evals, release scripts. |

## Relationship Vocabulary

Prefer short semantic labels: `calls`, `reads`, `writes`, `owns`, `validates`,
`renders`, `publishes`, `imports`, `configures`, `feeds`, `generates`,
`reviews`, `uses`, `guards`, `routes`, `stores`.

Avoid vague labels such as `related`, `connected`, or `stuff`.
