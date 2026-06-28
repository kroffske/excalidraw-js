# Tree-spec and layout families (data-only)

Read this when a weak/local model should fill **data** instead of writing
TypeScript, or when the diagram is a hierarchy or a long linear process that one
of the built-in layout families can place for you.

## Pick a layout family first

- `tree` — parent/child hierarchy that branches.
- `wide-tree` — still vertical hierarchy, but nodes need wider panels for context.
- `process-flow` — a long linear process that would otherwise become a tall narrow ladder; it wraps into rows that snake left-to-right then right-to-left.
- a custom pipeline / swimlane — when phases, owners, or environments matter more than ancestry (draw it directly with `layout.section(...)` + `distributeHorizontal`; see the foundational example in `SKILL.md`).

## Data-only path (no TypeScript)

A ready-to-edit spec ships with this skill at `assets/tree-spec.example.json` —
copy it into your workspace as a starting point. Let the CLI choose the family:

```bash
excalidraw-diagrams tree-spec spec.json --layout auto --out diagram.excalidraw --png diagram.png
```

Force the wrapped process layout when the input is a process spine:

```bash
excalidraw-diagrams tree-spec spec.json --layout process-flow --out diagram.excalidraw --png diagram.png
```

The JSON fields mirror `layout.tree(...)`. Put hierarchy in `children`,
cross-links in `secondaryEdges`, and weak/non-hierarchy notes in `sidecars`:

```json
{
  "title": "Session tree",
  "subtitle": "Data-only tree spec rendered by excalidraw-diagrams tree-spec.",
  "seed": 20260602,
  "assetPack": "core",
  "options": { "x": 80, "y": 130, "nodeWidth": 265, "nodeHeight": 122, "levelGap": 78, "siblingGap": 48 },
  "root": {
    "id": "session",
    "title": "Session sharedState",
    "iconId": "memory_database",
    "bullets": ["goal", "plan", "loop"],
    "children": [
      { "id": "plan", "title": "plan (PlanState)", "iconId": "agent_planner", "bullets": ["tasks[]"] },
      { "id": "loop", "title": "loop (LoopState)", "iconId": "model_refresh", "bullets": ["maxTurns"] }
    ]
  },
  "secondaryEdges": [
    { "from": "loop", "to": "plan", "kind": "feedback", "label": "restore", "lane": "rightOuter" }
  ],
  "sidecars": [
    { "id": "hook-note", "attachTo": "loop", "side": "right", "title": "session_start hook", "bullets": ["loads saved loop state"] }
  ]
}
```

## TypeScript path

When you do write TypeScript, ask for a plan and then render the chosen family:

```ts
const spec = { root, secondaryEdges, sidecars };
const plan = layout.planTreeLayout(spec, { x: 80, y: 130, reservedTopBand: 120 }, "auto");
const diagram = plan.family === "process-flow"
  ? layout.processFlow(scene, spec, plan.options)
  : layout.tree(scene, spec, plan.options);
```

`layout.processFlow(...)` takes the same `root` / `secondaryEdges` / `sidecars`
data as `layout.tree(...)`; rows snake so the primary sequence stays compact
while provenance and feedback arrows route through outer lanes.

Keep provenance, restore, audit, and feedback relationships as `secondaryEdges`
or `sidecars`. Do not hand-draw a long reverse arrow through the main trunk.
