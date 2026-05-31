# Asset Reference

Bundled SVG assets ship as npm package data in two packs:

- `core` (default, 64 icons) — neutral `agents` and `data` groups for ML, agent workflows, and data platforms.
- `trading` (64 icons) — thematic fintech pack for markets, positions, derivatives, execution.

After the package is installed, do not guess the physical path. Use the CLI or the TypeScript registry.

## CLI

```bash
excalidraw-assets packs
excalidraw-assets groups
excalidraw-assets --pack trading groups
excalidraw-assets list --group agents
excalidraw-assets list --json
excalidraw-assets --pack trading list --json
excalidraw-assets show robot_agent
excalidraw-assets export ./asset-catalog
excalidraw-assets --pack trading export ./trading-catalog
```

`export` copies:

- `manifest.json`
- `manifest.csv`
- `svg/*.svg`

Use export when a human or agent needs to inspect the actual SVG files.

## TypeScript

```ts
import { AssetRegistry } from "@kroffske/excalidraw-diagrams";

const core = AssetRegistry.bundled();       // pack="core" by default
const trading = AssetRegistry.bundled("trading");

const groups = core.groups();
const assetIds = core.ids();
const robot = core.resolve("robot_agent");
const bull = trading.resolve("bull");
```

## Groups

- `core` pack groups: `agents` (33), `data` (31).
- `trading` pack groups: `trading` (64).

When writing generic diagrams, prefer `core` neutral aliases such as `robot_agent`, `tool_call`, `api_connector`, `data_catalog`, `vector_database`, `prompt_template`, `guardrails`, `monitoring_dashboard`. Switch to `trading` only when the diagram is genuinely about markets, positions, derivatives, or execution.

## Common Aliases (core)

- `robot_agent` -> `agents_robot_agent_01-01`
- `llm_chat` -> `agents_llm_chat_01-02`
- `agent_planner` -> `agents_agent_planner_01-03`
- `tool_call` -> `agents_tool_call_01-04`
- `function_router` -> `agents_function_router_01-05`
- `rag_retriever` -> `agents_rag_retriever_01-06`
- `prompt_template` -> `agents_prompt_template_01-07`
- `guardrails` -> `agents_guardrails_01-24`
- `monitoring_dashboard` -> `agents_monitoring_dashboard_01-11`
- `audit_log` -> `agents_audit_log_01-27`
- `api_connector` -> `data_api_connector_02-01`
- `server_stack` -> `data_server_stack_02-02`
- `vector_database` -> `data_vector_database_02-22`
- `data_catalog` -> `data_data_catalog_02-10`

Full ids, short aliases, group/name lookup, and numeric codes are accepted:

```ts
core.resolve("agents_robot_agent_01-01");
core.resolve("robot_agent");
core.resolveGroup("agents", "robot_agent");
core.resolveIndex(1, 1);
```

Numeric codes (`GG-II`) are pack-local: `01-01` in `core` is `robot_agent`; `01-01` in `trading` is `tech_chart_up`.
