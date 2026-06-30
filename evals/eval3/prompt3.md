---
eval: eval3
slug: smart-bash-daemon-lifecycle
diagram_title: weak-model daemon lifecycle map
thesis: A shell invocation reaches a singleton resident daemon through the CLI/start guard, the daemon owns socket/runtime state, serves requests through a loaded model, and releases resources on idle exit.
layout_family: stateful lifecycle with resource sidecars
mode: single
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval3
---

Use $plan-excalidraw-graph, $plan-excalidraw-weak-llm, and $excalidraw-diagrams.

Task: author a semantic Excalidraw diagram as restricted TypeScript graph source.

You are a weak/local model lane. Do not write raw Excalidraw JSON. Do not calculate detailed coordinates for every card. Think in named graph objects and relationships.

Diagram thesis: A shell invocation reaches a singleton resident daemon through the CLI/start guard, the daemon owns socket/runtime state, serves requests through a loaded model, and releases resources on idle exit.
Layout family: stateful lifecycle with resource sidecars
Expected sections: Invocation, Singleton start guard, Resident daemon resources, Request serving, Idle shutdown.
Quality target: The shell -> client -> guard -> daemon -> runtime -> response path should be clear; lock/socket/model artifacts should read as resources, not as a tangled second main flow.
Layout hint: Prefer three compact bands if that reduces crossings: invocation/startup chain; resident daemon request path; shutdown chain. In the resident band, put daemon_socket -> request_handler -> daemon_runtime -> autocomplete_decode -> json_response in one row when possible, and put model_artifact as a sidecar below or next to daemon_runtime. If runtime_to_decode crosses suggest_request or json_response, move autocomplete_decode into the resident row or omit runtime_to_decode.

The runner already provides:
- `scene`: a Scene with bundled assets.
- `layout`: the excalidraw-diagrams layout namespace.
- `node(id, title, iconId, bullets)`: creates a named auto-sized card and records its bounds.
- `section(title, group)`: wraps a row/column/group in a measured section. The runner stacks sections; do not pass coordinates.
- `connect(edgeId, fromId, toId, label, options?)`: connects named cards and records the edge for validation.

Allowed authoring pattern:
```ts
const entry = layout.row({
  source: node("source", "Source", "data_catalog", ["input data", "owned contract"]),
  transform: node("transform", "Transform", "function_router", ["normalizes", "validates"]),
});
section("Entry", entry);

const runtime = layout.row({
  predictor: node("predictor", "Predictor", "model_deployment", ["loaded model", "runtime contract"]),
  output: node("output", "Output", "cloud_data", ["written artifact"]),
});
section("Runtime", runtime);

connect("source_to_transform", "source", "transform", "feeds");
connect("transform_to_predictor", "transform", "predictor", "serves");
```

Rules:
- Return exactly one fenced ```ts code block and no prose outside it.
- Before writing code, internally make a pre-code plan: thesis, layout_family, sections, primary_edges, supporting_edges, optional_edges_omitted, and row_order_notes. Do not print the plan.
- Use stable snake_case ids.
- Use only known icon ids from this list: news_document, tool_call, prompt_template, api_connector, agent_planner, data_catalog, function_router, model_validation, server_stack, historical_database, model_deployment, cloud_data, signal_quality_magnifier, monitoring_dashboard.
- Use `layout.row`, `layout.column`, `section(title, group)`, `node(...)`, and `connect(...)`.
- Do not pass x/y coordinates to `section`; the runner computes section positions.
- Do not tune small gaps. Omit `gap` unless the semantic grouping needs extra space.
- Do not import anything.
- Do not create `Scene`.
- Do not call `scene.write`.
- Do not use numeric child indexes.
- Do not create one parent row/column containing all sections. Build each section group independently, then call `section(...)`.
- Order nodes to minimize primary edge length: put the target under/next to the source for primary edges.
- Omit optional edges that would cross two or more section bands or make the primary story harder to read.
- Create all sections before `connect(...)`, then emit `connect(...)` calls in primary-story order.
- Keep the graph to 12-18 nodes and 10-16 edges.
- Use short relationship labels: feeds, trains, publishes, validates, loads, serves, releases.

Source packet from a daemon lifecycle spec:
- Person shell opens prompt with snippet or calls suggest.
- CLI client starts daemon, pings readiness, and sends JSON requests.
- Start guard serializes startup through ping, flock probe, and daemon.starting.
- daemon.lock is a lifetime singleton flock for one live daemon.
- Resident daemon holds Unix socket, runtime, and idle watchdog.
- DaemonRuntime loads predictor and runs autocomplete decode.
- Model artifact lives on filesystem from registry or SMART_BASH_MODEL_DIR.
- daemon.sock is the client access point for suggest/ping.
- Daemon self-exits when idle >= TTL and no in-flight requests; process exit releases lock and RAM.

Recommended semantic inventory:
- invocation: shell_session, cli_client.
- startup_guard: ping_check, start_guard, daemon_lock, daemon_process.
- resident_runtime: daemon_socket, daemon_runtime, model_artifact, request_handler.
- serving: suggest_request, autocomplete_decode, json_response.
- shutdown: idle_watchdog, process_exit, lock_release.

Primary edges:
- shell_session -> cli_client -> ping_check -> start_guard -> daemon_lock -> daemon_process.
- daemon_process -> daemon_socket; cli_client -> daemon_socket -> request_handler -> daemon_runtime -> autocomplete_decode -> json_response.
- daemon_runtime -> model_artifact.
- idle_watchdog -> process_exit -> lock_release.
- connect daemon_process -> idle_watchdog only if idle_watchdog is placed adjacent without crossing other cards; otherwise mention the watchdog in the daemon_process bullets and omit that edge.

Optional edges to omit when noisy:
- A self-loop on daemon_process if it would cross text.
- Repeated ping/suggest edges when one client->socket edge already tells the story.
- client -> daemon_socket if it crosses shell/startup cards.
- daemon_process -> idle_watchdog if it crosses resource or serving cards.
