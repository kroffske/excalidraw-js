---
eval: eval2
slug: excalidraw-js-repo-map
diagram_title: weak-model excalidraw-js repo map
thesis: A request moves from the user surface (README, CLI, examples) through the planning skills into the core graph/layout/render source, which emits a validated .excalidraw artifact, with tests and validation as the quality gates.
layout_family: layered-map
mode: stepwise
difficulty: hard
input_type: repository
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval2
---

<!--
This is a STEPWISE eval (mode: stepwise). The runner drives three steps; only the
body below is sent to the model at the draw step, with the gathered plan appended.

  Step 1 — Gather (WITH tools): the model explores THIS repo and writes a compact
           architecture digest.
  Step 2 — Plan (no tools): the model turns the digest into a diagram plan.
  Step 3 — Draw: the body below + the Step-2 plan -> restricted-TS graph -> render.

The Step-1 / Step-2 prompt text lives in scripts/weak-llm-improve/run-prompt.mjs
(generic: explore repo -> digest -> plan). Edit the draw instructions here.
-->

Task: draw a semantic Excalidraw diagram that maps this repository (excalidraw-js)
— how a request moves from the user surface (README, CLI, examples) through the
planning skills into the core graph/layout/render source, down to a validated
.excalidraw artifact, with tests and validation as the quality gates.

You are a weak/local-model lane: think in named graph objects and relationships,
not raw Excalidraw JSON or per-card coordinates. Use the skill — it owns *how* to
build (the `node`/`section`/`connect` API, icon ids, layout, and output format).
Reach for `$excalidraw-diagrams`, plus `$plan-excalidraw-weak-llm` and
`$plan-excalidraw-graph`.

Use the plan you gathered in the earlier steps (appended below) as the source of
truth — do not invent components that are not in it. You decide the diagram's
sections and relationships; no ready-made graph is given here.
