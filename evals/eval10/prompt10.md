---
eval: eval10
slug: three-class-model-stakeholder-card
diagram_title: ML prediction at a glance
thesis: One input receives exactly three class scores; the highest score wins, while low confidence routes the decision to review rather than creating a fourth class.
layout_family: presentation scorecard
mode: single
contract: visual
difficulty: medium
input_type: stakeholder-brief
models: local-omlx-qwen36-35b-a3b-4bit
samples: 1
output_dir: evals/run/<date>-eval10
---

Create a slide-ready visual for non-technical stakeholders. A classifier receives
`photo_024.jpg` and produces exactly three mutually exclusive classes:
`Cat = 0.72`, `Dog = 0.21`, and `Other = 0.07`. Make Cat visibly the winner.
Also explain in one short caption that uncertainty or human review is a decision
state after scoring, not a fourth output class. Avoid training-pipeline detail;
this picture is about interpreting one prediction.

Use `$plan-excalidraw-weak-visual` and `$excalidraw-diagrams`.
