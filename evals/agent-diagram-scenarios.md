# Agent Diagram Evaluation Scenarios

These scenarios are prompt-level tests for agents that use this package to create
Excalidraw diagrams and PNG previews. They are intentionally not pixel-golden
tests. The goal is to check whether an agent can interpret a diagram prompt,
choose the right bundled assets, build a readable `.excalidraw` scene, render a
PNG, and return the saved artifact paths.

Machine-readable copies of the prompts and expected outputs live in
`evals/agent-diagram-scenarios.json`.

## Runner Contract

For each scenario, the agent should:

1. Use the `excalidraw-diagrams` TypeScript API instead of hand-writing raw
   Excalidraw element dictionaries.
2. Use a fixed `Scene` seed.
3. Prefer layout helpers such as `iconWithLabel`, `iconPanel`, `bulletList`,
   `distributeHorizontal`, `distributeVertical`, and `connect`.
4. Save the Excalidraw JSON to `examples/out/agent-evals/<scenario-id>.excalidraw`.
5. Render the PNG to `examples/out/agent-evals/<scenario-id>.png`.
6. Return a short result object or message containing the scenario id, absolute
   Excalidraw path, absolute PNG path, and any caveats.

Suggested local setup:

```bash
npm install
npm run build
npx tsx <agent-generated-script>.ts
node dist/bin/excalidraw-render.js examples/out/agent-evals/<scenario-id>.excalidraw examples/out/agent-evals/<scenario-id>.png
```

## Evaluation Rubric

Use this quick rubric when reviewing PNG outputs:

- `pass`: The diagram communicates the requested flow without explanation,
  uses relevant bundled assets, has readable labels, and includes the requested
  branch/feedback/ownership structure.
- `needs_review`: The output is structurally close but has crowded text,
  missing labels, weak asset choices, or a confusing arrow.
- `fail`: The file is missing, blank, invalid Excalidraw JSON, not rendered to
  PNG, or does not show the requested system shape.

## Scenarios

### 1. Basic Service Flow

Prompt:

```text
Use excalidraw-diagrams to draw a clear left-to-right service flow. A request
enters an API connector, moves to an agent worker, passes a guardrail check, and
stores the accepted event in a historical database. Add a short title and one
short label per arrow. Save the Excalidraw JSON and PNG under
examples/out/agent-evals/basic-service-flow.
```

Desired output:

- Uses the core asset pack.
- Shows four main nodes in this order: `api_connector`, `robot_agent`,
  `guardrails`, `historical_database`.
- Has at least three directional arrows with short labels.
- Uses a simple left-to-right layout with no crossing arrows.

### 2. RAG Answer Trace

Prompt:

```text
Use excalidraw-diagrams to draw a RAG answer trace for a support assistant. Show
the user prompt, prompt template, retriever, vector database, LLM answer, audit
log, and optional human review. The retrieval path should loop through the
vector database before the LLM answers. The audit path should branch from the
LLM answer. Save the Excalidraw JSON and PNG under
examples/out/agent-evals/rag-answer-trace.
```

Desired output:

- Uses the core asset pack.
- Includes `chat_message`, `prompt_template`, `rag_retriever`,
  `vector_database`, `llm_chat`, `audit_log`, and `human_review`.
- Makes the retrieval loop visually obvious.
- Shows audit/review as a side branch, not as the main answer path.

### 3. Trading Risk Gate

Prompt:

```text
Use excalidraw-diagrams with the trading asset pack to draw a trading risk gate.
Market candles produce a target signal, the signal enters a locked risk gate,
and only approved trades continue through position sizing to the order book.
Rejected trades should branch to a stop-loss or blocked-trade outcome. Label
the pass and reject branches. Save the Excalidraw JSON and PNG under
examples/out/agent-evals/trading-risk-gate.
```

Desired output:

- Uses the trading asset pack.
- Includes `candles_price`, `target_signal`, `risk_gate_shield_lock`,
  `position_size`, `order_book`, and `stop_loss`.
- Shows two clearly labeled paths after the risk gate: pass and reject.
- Keeps the rejected branch visually distinct from the approved path.

### 4. Model Training Feedback Loop

Prompt:

```text
Use excalidraw-diagrams to draw an ML training and monitoring feedback loop.
Data starts in a data lake, moves through feature engineering, train/test split,
model training, model validation, model registry, deployment, and monitoring.
If drift is detected, the monitoring stage should loop back to model refresh or
training. Save the Excalidraw JSON and PNG under
examples/out/agent-evals/model-training-feedback-loop.
```

Desired output:

- Uses the core asset pack.
- Includes `data_lake`, `feature_engineering`, `train_test_split`,
  `model_training`, `model_validation`, `model_registry`,
  `model_deployment`, `monitoring_dashboard`, and `model_drift_alarm`.
- Shows the main path left-to-right or top-to-bottom.
- Shows a visible feedback arrow from drift/monitoring back to refresh or
  training.

### 5. Agent Evaluation Harness

Prompt:

```text
Use excalidraw-diagrams to draw the harness that runs these diagram scenarios.
Show a scenario prompt, an agent planner, a sandbox executor, a generated
Excalidraw JSON artifact, a PNG renderer, a PNG artifact, and a human review
step. Include labels for the two saved files. Save the Excalidraw JSON and PNG
under examples/out/agent-evals/agent-evaluation-harness.
```

Desired output:

- Uses the core asset pack.
- Includes `prompt_template`, `agent_planner`, `sandbox_executor`,
  `data_catalog`, `monitoring_dashboard`, and `human_review`.
- Makes the artifact chain explicit: prompt to agent to `.excalidraw` to PNG.
- Includes visible text labels for both artifact paths.
