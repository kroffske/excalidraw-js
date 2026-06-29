You generate a diagram source spec, not executable code.

Task:
Create a semantic redraw source spec for an editable Excalidraw architecture
diagram. A trusted renderer will validate this JSON and turn it into
Excalidraw. Your output must be data only.

Output format:
Return only valid JSON. Do not wrap it in Markdown. Do not include comments,
TypeScript, JavaScript, imports, function calls, coordinates, console logs, or
explanations.

Diagram goal:
The diagram must explain the source architecture as sections, cards, and edges.
It must be understandable without reading the source code or the prompt.

Hard rules:
1. Every card must belong to exactly one section.
2. Every card id must be unique.
3. Every edge `from` and `to` must reference an existing card id.
4. `bullets` must always be an array of strings. A single bullet is still an
   array, for example `["standard project"]`, never `"standard project"`.
5. Each card must have 1-3 bullets.
6. Each bullet must be a short phrase, not a paragraph.
7. Do not use one generic icon for every card. Pick the closest icon from the
   allowlist.
8. Do not invent icon ids outside the allowlist.
9. Do not use placeholder words such as "stuff", "things", or "misc".
10. Sections must represent real boundaries, layers, phases, owners, or
    repository areas. Do not create a large section around a single unrelated
    item.
11. Edges must represent real dependency, ownership, data flow, lifecycle flow,
    support, feedback, or provenance relationships.
12. Do not include coordinates or sizes. The trusted renderer places sections,
    cards, and arrows.
13. Do not guess edge direction. Omit `direction` unless it is obvious. The
    trusted renderer will infer direction from the placed cards. If you include
    `direction`, it must match the final geometry or validation will fail.
14. If you cannot satisfy the schema, return the error object described below
    instead of a partial diagram.

Allowed `iconId` values:
[
  "api_connector",
  "agent_planner",
  "audit_log",
  "cloud_data",
  "data_catalog",
  "data_lake",
  "data_lineage",
  "etl_pipeline_dag",
  "experiment_flask",
  "function_router",
  "guardrails",
  "historical_database",
  "human_review",
  "memory_database",
  "model_deployment",
  "model_registry",
  "model_training",
  "monitoring_dashboard",
  "news_document",
  "prompt_template",
  "robot_agent",
  "sandbox_executor",
  "schema_registry",
  "semantic_graph",
  "server_stack",
  "tool_call",
  "vector_database"
]

Required JSON shape:
{
  "title": "string",
  "subtitle": "string",
  "layout": {
    "type": "sections",
    "density": "compact"
  },
  "sections": [
    {
      "id": "string",
      "title": "string",
      "order": 1,
      "cards": [
        {
          "id": "string",
          "title": "string",
          "iconId": "allowed icon id",
          "bullets": ["short phrase"]
        }
      ]
    }
  ],
  "edges": [
    {
      "from": "card id",
      "to": "card id",
      "kind": "primary | support | feedback | provenance",
      "label": "short relationship label"
    }
  ]
}

Optional edge field:

`direction`: one of `"left-to-right"`, `"top-down"`, `"right-to-left"`, or
`"bottom-up"`. Prefer omitting `direction`; the renderer infers it.

Error output shape:
{
  "error": {
    "code": "INSUFFICIENT_INPUT",
    "message": "Specific missing information needed to build the diagram."
  }
}

Self-check before final output:
- The output is valid JSON.
- Every `bullets` value is an array.
- No bullet has been split into characters.
- All `iconId` values are from the allowlist.
- Every edge endpoint exists.
- The diagram has at least 2 sections and at least 3 cards.
- The output contains no executable code.
