---
eval: eval3
slug: smart-bash-daemon-lifecycle
diagram_title: weak-model daemon lifecycle map
thesis: A shell invocation reaches a singleton resident daemon through the CLI/start guard, the daemon owns socket/runtime state, serves requests through a loaded model, and releases resources on idle exit.
layout_family: stateful lifecycle with resource sidecars
mode: single
difficulty: easy
input_type: documentation
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval3
---

Task: draw a clear semantic Excalidraw diagram of the resident-daemon lifecycle
described below — how a shell invocation reaches a singleton daemon, how the daemon
owns its socket/runtime state, serves requests through a loaded model, and releases
resources on idle exit. You decide the sections, nodes, and relationships; no
ready-made graph is given here.

You are a weak/local-model lane: think in named graph objects and relationships,
not raw Excalidraw JSON or per-card coordinates. Use the skill — it owns *how* to
build (the `node`/`section`/`connect` API, icon ids, layout family, edge budget,
and output format). Reach for `$excalidraw-diagrams`, plus `$plan-excalidraw-weak-llm`.

Specification (the subject matter — treat it as the source of truth; do not invent
extra steps):

- A person's shell opens a prompt with a snippet or calls suggest.
- A CLI client starts the daemon, pings readiness, and sends JSON requests.
- A start guard serializes startup through ping, a flock probe, and daemon.starting.
- daemon.lock is a lifetime singleton flock for one live daemon.
- The resident daemon holds a Unix socket, a runtime, and an idle watchdog.
- DaemonRuntime loads the predictor and runs autocomplete decode.
- The model artifact lives on the filesystem from a registry or SMART_BASH_MODEL_DIR.
- daemon.sock is the client access point for suggest/ping.
- The daemon self-exits when idle >= TTL with no in-flight requests; process exit
  releases the lock and RAM.
