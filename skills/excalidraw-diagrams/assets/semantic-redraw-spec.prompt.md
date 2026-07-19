Compatibility fallback prompt: use this only when the
`semantic-redraw-spec` JSON CLI path is explicitly required. For new weak/local
semantic redraw workflows, prefer restricted TypeScript graph code with
`layout.node(...)`, `layout.row(...)` / `layout.column(...)`,
`layout.section(...)`, and `layout.connect(...)`.

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
4. Prefer one semantic `figure` from this exact list:
   `card`, `bullets`, `badge`, `actor`, `store`, `queue`, `decision`, `note`.
5. For `card`, `actor`, `store`, `queue`, `decision`, or `note`, provide
   `title` and at most one short `description`. Do not provide `iconId`,
   `bullets`, or `badge`.
6. For `bullets`, provide `title` and 1-5 short bullet strings. For `badge`,
   provide `title` and one short written `badge` classification.
7. `card`, `actor`, `store`, `queue`, and `decision` may be edge endpoints.
   `bullets`, `badge`, and `note` may not.
8. Every decision must have at least two outgoing edges with distinct,
   non-empty labels.
9. Do not add icons, SVG, coordinates, sizes, ports, colors, palette/status
   overrides, style objects, token bags, or arbitrary fields to an explicit
   figure. The trusted renderer owns presentation.
10. A legacy card may omit `figure` only when preserving an older spec. It must
    keep an allowed `iconId` and 1-3 bullet strings. Do not mix legacy and
    explicit card fields.
11. `bullets` must always be an array of strings. A single bullet is still an
    array, for example `["standard project"]`, never `"standard project"`.
12. Do not use placeholder words such as "stuff", "things", or "misc".
13. Sections must represent real boundaries, layers, phases, owners, or
    repository areas. Do not create a large section around a single unrelated
    item.
14. Edges must represent real dependency, ownership, data flow, lifecycle flow,
    support, feedback, or provenance relationships.
15. Do not include coordinates or sizes. The trusted renderer places sections,
    cards, and arrows.
16. Do not include `direction` in edges. The trusted renderer infers direction
    from the placed cards.
17. For support relationships, `from` is the supporting component and `to` is
    the supported component. Use label `"supports"`, not `"supported by"`.
18. If you cannot satisfy the schema, return the error object described below
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
          "id": "reviewer",
          "title": "Review agent",
          "figure": "actor",
          "description": "Reads the frozen target and returns findings."
        },
        {
          "id": "facts",
          "title": "Required facts",
          "figure": "bullets",
          "bullets": ["agent ownership", "directed handoffs"]
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

Error output shape:
{
  "error": {
    "code": "INSUFFICIENT_INPUT",
    "message": "Specific missing information needed to build the diagram."
  }
}

Self-check before final output:
- The output is valid JSON.
- Every card uses exactly one legal semantic or legacy form.
- Every `bullets` value is an array.
- No bullet has been split into characters.
- Explicit figures contain no icon or presentation fields.
- Any legacy `iconId` is from the allowlist.
- Every edge endpoint exists.
- No edge targets `bullets`, `badge`, or `note`.
- Every decision has two distinct written outcomes.
- No edge contains `direction`.
- Support edges point from helper to thing helped.
- The diagram has at least 2 sections and at least 3 cards.
- The output contains no executable code.
