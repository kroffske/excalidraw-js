# Weak-LLM Layout Reasoning

Use these rules when a weak model produces correct nodes but confusing arrows.

## Edge-First Ordering

A readable diagram is mostly a good ordering of nodes. Before code, sort edges:

1. Primary edges define the visual spine.
2. Supporting edges explain useful secondary relationships.
3. Optional edges are true but may be omitted.

Then order rows by primary edges:

- If `A -> B` is primary and crosses adjacent layers, put `B` under `A`.
- If `B -> C` is also primary, put `C` under `B`.
- If a node has no primary edge, put it at the row edge.
- If two edges compete for the same column, prefer the edge that explains the
  diagram thesis.

## Optional Edge Omission

Do not draw every true relationship. Omit or move to a note when an edge:

- crosses two or more section bands
- must pass behind unrelated cards
- restates a bullet that is already visible
- connects quality/proof nodes backward across the whole canvas
- makes the primary story harder to follow

Example: `validation -> vitest_suite` may be true, but in a five-layer repo map
it can cross the artifact layer. Prefer a `Validation` bullet saying
`test-backed gates` or a note near quality gates.

## Good vs Bad Row Order

Bad layered-map shape:

```ts
const all_sections = layout.row({
  user_surface: layout.column({ readme_docs, cli_bins, examples }),
  planning_authoring: layout.column({ planning_skill, drawing_skill, graph_api }),
  layout_runtime: layout.column({ layout_helpers, scene_core }),
});

section("User surface", all_sections.user_surface);
section("Planning and authoring", all_sections.planning_authoring);
```

This creates five vertical columns first, then asks the runner to stack them as
sections. Arrows cross sibling cards because the source layout is horizontal
even though the semantic intent is top-to-bottom.

Better layered-map shape:

```ts
const user_surface = layout.row({ readme_docs, cli_bins, examples });
section("User surface", user_surface);

const planning_authoring = layout.row({ planning_skill, drawing_skill, graph_api });
section("Planning and authoring", planning_authoring);
```

Each layer is independent, and the runner stacks sections vertically.

Bad:

```ts
const planning = layout.row({
  planning_skill,
  drawing_skill,
  spec_drivers,
  graph_api,
});
```

If `examples -> graph_api` and `graph_api -> layout_helpers` are primary, this
pushes `graph_api` to the right and creates long routes.

Better:

```ts
const planning = layout.row({
  planning_skill,
  drawing_skill,
  graph_api,
  spec_drivers,
});
```

Now `graph_api` can sit under `examples`, and `layout_helpers` can sit under
`graph_api`.

## Relationship Labels

Use short verb phrases:

- `frames`
- `invokes`
- `authors`
- `delegates`
- `writes`
- `loads`
- `exports`
- `validates ids`
- `reviewed by`

Avoid paragraph labels. If the relationship needs a sentence, it probably
belongs in a node bullet or note.

## Code Emission Checklist

- Create nodes inside named `layout.row(...)` or `layout.column(...)` groups.
- Call `section("Title", group)` immediately after building each group.
- Emit all `connect(...)` calls after all sections.
- Use stable ids in `connect(...)`; never use arrays or indexes.
- Omit `gap`, `x`, `y`, `width`, and `height` unless the runner contract
  explicitly allows a semantic override.
