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
excalidraw-assets search "human approval step"
excalidraw-assets search "стакан заявок" --pack trading --lang ru
excalidraw-assets search "data store" --pack core --pack trading --json
excalidraw-assets export ./asset-catalog
excalidraw-assets --pack trading export ./trading-catalog
```

`export` copies:

- canonical v2 `manifest.json`
- compatible-prefix extended `manifest.csv`
- `PROVENANCE.md`
- `svg/*.svg`

Use export when a human or agent needs to inspect the actual SVG files.
The raw manifest is the v2 descriptor envelope. JavaScript callers that need
the normalized legacy item array should use `bundledManifest()`.

`search` is discovery, not placement. With no `--pack`, it searches all bundled
packs; repeat `--pack` to constrain discovery. Human output always shows both
labels and uses the English description unless `--lang ru` is supplied.
`--json` returns `{result, descriptor}` pairs. Existing exact commands keep
their single-pack `core` default.

## TypeScript

```ts
import { AssetRegistry } from "@kroffske/excalidraw-diagrams";
import {
  getAssetDescriptor,
  searchAssets,
} from "@kroffske/excalidraw-diagrams/assets";

const core = AssetRegistry.bundled();       // pack="core" by default
const trading = AssetRegistry.bundled("trading");

const groups = core.groups();
const assetIds = core.ids();
const robot = core.resolve("robot_agent");
const bull = trading.resolve("bull");

const suggestions = searchAssets("human approval step", {
  packs: "all",
  limit: 5,
});
const selected = suggestions[0]; // inspect before choosing
const descriptor = getAssetDescriptor(selected.pack, selected.id);
```

## Description-driven selection

For weak/local models, keep selection explicit:

1. Describe the intended visual in English or Russian and request top-k
   candidates. Search is deterministic, lexical, local, and network-free; it
   does not detect language or transliterate.
2. Inspect each candidate's bilingual labels, description, score reasons, and
   pack-qualified id. A high rank is a suggestion, not validation.
3. Choose one exact canonical `{pack, id}` whose descriptor matches the intended
   meaning. Never place rank 1 automatically.
4. Resolve that exact id through `AssetRegistry.bundled(pack)` and place it.
   Validate the finished diagram after placement.

```ts
const candidates = searchAssets("журнал аудита", {
  packs: ["core"],
  limit: 5,
});
const chosen = candidates.find(
  ({ id }) => id === "agents_audit_log_01-27",
);
if (!chosen) {
  throw new Error("Required audit-log asset was not suggested.");
}

const chosenDescriptor = getAssetDescriptor(chosen.pack, chosen.id);
const chosenRegistry = AssetRegistry.bundled(chosen.pack);
const chosenAsset = chosenRegistry.resolve(chosen.id);
```

Search covers the two bundled catalogs and does not make custom directories
searchable. It never reads SVG bytes, acquires an asset, places an icon, or
changes the throwing, case-sensitive exact lookup contract.

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

When using `excalidraw-assets list`, copy the exact full id or use the short
alias from the asset name. Do not invent partial ids by adding a group prefix to
the name. For example, use `labeled_dataset` or
`data_labeled_dataset_02-14`, not `data_labeled_dataset`.

## Asset discovery in scripts

Inside a generator, resolve and list ids through the registry instead of
guessing paths:

```ts
import { AssetRegistry } from "@kroffske/excalidraw-diagrams";

const core = AssetRegistry.bundled();
const trading = AssetRegistry.bundled("trading");
console.log(core.groups());                    // { agents: [...], data: [...] }
console.log(core.ids().slice(0, 10));
console.log(core.resolve("robot_agent").id);   // agents_robot_agent_01-01
console.log(trading.resolve("bull").id);       // trading_bull_01-03
```

`AssetRegistry` exposes `.ids()`, `.groups()`, `.resolve(...)`,
`.resolveGroup(...)`, and `.resolveIndex(...)`. It does not expose `.keys()` or
`.size`.

Numeric codes (`GG-II`) are pack-local: `01-01` in `core` is `robot_agent`; `01-01` in `trading` is `tech_chart_up`.
