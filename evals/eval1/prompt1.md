---
eval: eval1
slug: ml-system-design-train-val
diagram_title: weak-model ML train/validation system design
thesis: Raw data is split before any fitting; features are fit on the train split only; a model is trained and tuned against a validation split; the chosen model is scored once on a held-out test split and promoted to the registry only after passing the evaluation gate.
layout_family: process-spine with a tuning/monitoring sidecar
mode: single
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval1
---

Use $plan-excalidraw-graph, $plan-excalidraw-weak-llm, and $excalidraw-diagrams.

Task: author a semantic Excalidraw diagram as restricted TypeScript graph source.

You are a weak/local model lane. Do not write raw Excalidraw JSON. Do not calculate detailed coordinates for every card. Think in named graph objects and relationships.

Diagram thesis: Raw data is split before any fitting; features are fit on the train split only; a model is trained and tuned against a validation split; the chosen model is scored once on a held-out test split and promoted to the registry only after passing the evaluation gate.
Layout family: process-spine with a tuning/monitoring sidecar
Expected sections: Data, Feature engineering, Training, Validation and tuning, Evaluation gate, Registry and serving.
Quality target: The main spine data -> features -> train -> validate -> test -> registry -> serving should read as one clear top-to-bottom flow; the experiment tracker, hyperparameter search, and drift monitor should read as sidecars, not a tangled second flow.
Layout hint: Use horizontal bands top to bottom; keep each band a wide row. Put experiment_tracker and hyperparameter_search as a sidecar near Training/Validation, and drift_monitor as a sidecar near serving. Do not stack a whole band into a tall vertical column.

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

Context (a generic but realistic supervised-learning training/validation system). Use exactly these components and relationships; do not invent extra steps or guess details:
- Data: a raw dataset is ingested from a warehouse, schema-validated, and split into train/validation/test BEFORE any feature fitting, to avoid leakage.
- Feature engineering: a feature pipeline is FIT on the train split only, then applied (transform) to validation and test. Fitted feature state (encoders, scalers, vocab) is saved for serving.
- Training: a model is trained on the transformed train split; an experiment tracker logs params and metrics for every run.
- Validation and tuning: hyperparameters are tuned against the validation split; the best config is selected by the validation metric.
- Evaluation gate: the selected model is scored ONCE on the held-out test split and must clear a metric threshold plus a fairness/sanity check before promotion.
- Registry and serving: a passing model plus its fitted feature state are versioned in a model registry, deployed behind a serving endpoint, and watched by a drift monitor that can trigger retraining.

Recommended semantic inventory:
- data: raw_dataset, schema_validation, train_val_test_split.
- feature_engineering: feature_pipeline_fit, feature_transform, fitted_feature_state.
- training: train_model, experiment_tracker.
- validation_tuning: validation_score, hyperparameter_search, best_config.
- evaluation_gate: test_score, metric_threshold_gate, fairness_check.
- registry_serving: model_registry, serving_endpoint, drift_monitor.

Primary edges:
- raw_dataset -> schema_validation -> train_val_test_split.
- train_val_test_split -> feature_pipeline_fit -> feature_transform -> train_model.
- train_model -> validation_score -> hyperparameter_search -> best_config -> test_score.
- test_score -> metric_threshold_gate -> model_registry -> serving_endpoint.
- feature_pipeline_fit -> fitted_feature_state; fitted_feature_state -> model_registry.

Optional/supporting edges to omit when noisy:
- experiment_tracker logged from every training/validation step (make it a sidecar bullet instead).
- fairness_check and drift_monitor cross-links unless they sit adjacent.
- the serving_endpoint -> drift_monitor -> train_model retrain loop if it would cross the whole canvas (keep it as a short note).
