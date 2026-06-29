# Weak-LLM Diagram Eval Suite

Use at least three different topology families when tuning weak-model prompts.
Do not accept success on one layered repository map as proof of general quality.

## Case 1: Layered Repository Map

- Suggested source:
  `docs/system-design/repo-skill-map/generate.ts` and
  `docs/system-design/repo-skill-map/resources/excalidraw-js-skill-map.png`.
- Thesis: how a request moves from planning skill to TypeScript graph authoring,
  layout runtime, rendered artifacts, and quality gates.
- Layout family: `layered-map` or semantic redraw with outer-lane feedback.
- What this catches: row-order mistakes, optional edge noise, label crowding at
  section boundaries, and weak models connecting by indexes.
- Quality target: primary arrows are mostly vertical between adjacent layers.

## Case 2: ML Deploy / Training-Serving Handoff

- Suggested sources:
  `/Users/ravius/projects/ml_pipeline/CONTEXT.md`,
  `/Users/ravius/projects/ml_pipeline/docs/training.md`,
  `/Users/ravius/projects/ml_pipeline/projects/default_project/default_project/flows/train_catboost.py`,
  and `/Users/ravius/projects/ml_pipeline/projects/default_project/default_project/flows/inference.py`.
- Thesis: how shared `ml_pipeline` training artifacts become runtime inference
  contracts and deployable Triton/MLflow/Nexus artifacts for project-specific
  classifiers.
- Layout family: `process-spine` with sidecars.
- Candidate sections: shared library, project code, train artifacts, inference
  runtime, deploy tooling, quality gates.
- What this catches: dense domain nodes, train/serve handoff, deploy sidecars,
  and long cross-cutting infrastructure edges.

## Case 3: Stateful Daemon Lifecycle

- Suggested source:
  `/Users/ravius/projects/smart_bash/docs/resources/daemon-lifecycle.puml`.
- Thesis: how shell invocations reach a singleton daemon through a client/start
  guard, load runtime state, serve socket requests, and self-exit when idle.
- Layout family: `lifecycle` or `stateful-system`.
- What this catches: self-loops, resource gates, daemon/runtime boundaries, and
  the temptation to route every dynamic relationship as a crossing arrow.

## Optional Case 4: C4 Boundary / Skill Chain

- Suggested source:
  `/Users/ravius/projects/locus-skills/docs/architecture/locus-skill-chain/resources/locus-skill-chain.puml`.
- Thesis: how Locus skills move from intent, specs, planning, execution, review,
  QA, and ship while writing durable state surfaces.
- Layout family: `c4-boundary` or `swimlane`.
- What this catches: many boundaries, many supporting relationships, and the
  need to prune optional edges instead of drawing the entire C4 graph.

## Optional Case 5: Mobile Platform System Design

- Suggested source: `/Users/ravius/projects/mobile_app/.locus/system-design.puml`.
- Thesis: clients call an API layer, backend components own user/billing/content
  state, stores feed billing, and deferred AI components route through a gateway.
- Layout family: `c4-boundary` with deferred/research lane.
- What this catches: external actors, stores/webhooks, dashed deferred edges,
  shared database, and multiple clients.

## Judge Rubric

For each generated PNG, judge:

- hard failure: card overlap, unreadable text, clipped content, arrows through
  card text, or source relationships by numeric index
- medium issue: long routes along section borders, labels too close to lines,
  many optional edges obscuring the primary story
- pass condition: the layout thesis is understandable without reading the source
  and the primary edge path is visually clear

Record results in `comparison.md` with model, prompt version, attempt count,
validation result, judge verdict, and the exact artifacts.
