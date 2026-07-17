---
eval: eval1
slug: ml-system-design-train-val
diagram_title: weak-model ML train/validation system design
thesis: Raw data is split before any fitting; features are fit on the train split only; a model is trained and tuned against a validation split; the chosen model is scored once on a held-out test split and promoted to the registry only after passing the evaluation gate.
layout_family: process-spine with a tuning/monitoring sidecar
mode: single
difficulty: medium
input_type: documentation
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval1
---

Task: draw a clear semantic Excalidraw diagram that explains how the supervised
ML training-and-validation system described below is built — what flows into what,
and why. You decide the sections, nodes, and relationships; no ready-made graph is
given here.

You are a weak/local-model lane: think in named graph objects and relationships,
not raw Excalidraw JSON or per-card coordinates. Use the skill — it owns *how* to
build (the `node`/`section`/`connect` API, icon ids, layout family, edge budget,
and output format). Reach for `$excalidraw-diagrams`, plus `$plan-excalidraw-weak-llm`
and `$plan-excalidraw-graph` for the planning discipline.

System (the subject matter — treat it as the source of truth; do not invent extra
steps or guess details):

- Data: a raw dataset is ingested from a warehouse, schema-validated, and split
  into train/validation/test BEFORE any feature fitting, to avoid leakage.
- Feature engineering: a feature pipeline is FIT on the train split only, then
  applied (transform) to validation and test. Fitted feature state (encoders,
  scalers, vocab) is saved for serving.
- Training: a model is trained on the transformed train split; an experiment
  tracker logs params and metrics for every run.
- Validation and tuning: hyperparameters are tuned against the validation split;
  the best config is selected by the validation metric.
- Evaluation gate: the selected model is scored ONCE on the held-out test split
  and must clear a metric threshold plus a fairness/sanity check before promotion.
- Registry and serving: a passing model plus its fitted feature state are
  versioned in a model registry, deployed behind a serving endpoint, and watched
  by a drift monitor that can trigger retraining.
