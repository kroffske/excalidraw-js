---
eval: eval11
slug: product-launch-roadmap-control
diagram_title: Product launch roadmap
thesis: A product moves from validated problem through build and beta evidence to a launch decision, with research, engineering, and go-to-market ownership visible.
layout_family: process-spine with ownership sidecars
mode: single
contract: graph
difficulty: easy
input_type: dictated-short
models: local-omlx-qwen36-35b-a3b-4bit
samples: 1
output_dir: evals/run/<date>-eval11
---

Draw a simple product-launch roadmap for a stakeholder update. The main story is
problem validation, solution scope, implementation, internal QA, customer beta,
launch readiness review, and public launch. Make ownership visible: research
leads validation, product and engineering lead scope/build/QA, and go-to-market
leads beta communications and launch. Show that beta evidence feeds the launch
readiness decision, and keep optional dependencies out if they distract from the
main story.

Use `$plan-excalidraw-graph`, `$plan-excalidraw-weak-llm`, and
`$excalidraw-diagrams`.
