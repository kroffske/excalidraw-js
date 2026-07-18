---
title: "Milestones"
updated_at: "2026-07-18"
---

# Milestones

Repository-only registry for the `milestone:` frontmatter field on tasks and
temporal decision documents. It intentionally lives outside the npm package
whitelist. Ids use `m<NN>-<slug>`. Exactly one milestone is `active`. Closing
a milestone marks it `done` in this file; archival is a separate action.

| ID | Status | Period | Criterion | Note |
|---|---|---|---|---|
| m1-semantic-diagram-evidence | active | 2026-07-18 - | Done when every mandatory experiment has a reproducible decision, every conditional source slice is shipped or closed `wontdo` from its frozen gate, inherited human-review work is accepted or explicitly moved with evidence, the cumulative weak-model and visual suite passes on the final merged stack, and no unearned default, dependency, model download, or network path is introduced. | Semantic-first authoring for weak/local models; T-124 is the first active slice. |

## m1-semantic-diagram-evidence

### Source and baseline

The accepted source is the T-119 product portfolio and its frozen layout and
asset-retrieval contracts. The already merged baseline is:

- semantic `c4.container`, `sequence.interaction`, and `flow.swimlane`
  templates;
- native connector bindings and an agent-owned workflow acceptance corpus plus
  cross-view gallery;
- 128 bilingual asset descriptors and deterministic lexical search;
- current measured cards, obstacle-aware routing, validation, build, package,
  and rendering owners.

Those merged slices are evidence, not a claim that pending human-review tasks
have been accepted.

### What counts as success

Milestone product success means a weak or local model can express the common
diagram story through bounded semantic choices rather than raw coordinates,
hex colors, exact asset ids, or router internals, and the final evidence shows:

1. every accepted capability keeps existing semantic, geometry, determinism,
   packaging, and visual gates green;
2. named palettes and finite node figures make color and shape choices
   template-owned, with status meaning repeated by a label, icon, badge, border,
   or dash rather than color alone;
3. grouped layout and optional retrieval each end in the outcome earned by
   their frozen comparative gate, including an honest stop when the candidate
   is not materially better;
4. asset authoring rejects unsafe or unlicensed inputs and reproduces catalog
   views without hidden network access;
5. the final fixed weak-model suite compiles, renders, and preserves the
   requested story on at least three runs per affected scenario, with direct
   inspection of selected and failed PNGs.

An experiment may fail its product hypothesis without failing the milestone.
A reproducible negative result that selects `stop`, `lexical-only`, or
`wontdo` is successful decision evidence.

### What counts as failure

The milestone is not successful and cannot close when any of these remain:

- frozen fixtures, benchmark queries, metrics, or baselines were changed to
  make a candidate win;
- a result cannot be reproduced from a clean checkout or is not bound to exact
  source, fixture, renderer, model, and environment identities;
- a new default, production dependency, model download, network request, raw
  engine option, or automatic asset choice appears without passing its
  predeclared gate and a separate reviewed source slice;
- geometry validation or one attractive PNG is used as a substitute for direct
  visual review and semantic completeness;
- a weak-model claim relies on one hand-tuned sample;
- inherited human-review tasks are silently treated as accepted;
- the final stack regresses an accepted baseline or ends without one explicit
  release, defer, or stop decision.

### Completion contract

The milestone may be marked `done` only when:

1. all member tasks are `done` or `wontdo`, or have been moved to a named future
   milestone with the reason and precondition recorded;
2. T-124 selects exactly one grouped-layout outcome and T-134/T-135 reflect
   that outcome;
3. T-125 selects exactly one retrieval outcome and any earned provider source
   task is resolved inside this milestone;
4. T-133 selects exactly one generated-asset outcome and any earned bundled
   asset slice is resolved inside this milestone;
5. T-112, T-113, T-114, T-117, and T-118 are human-accepted, closed `wontdo`,
   or explicitly moved without transferring an unearned acceptance claim;
6. T-136 runs the cumulative deterministic, package, clean-consumer,
   weak-model, and direct PNG gates on the exact final merged commit;
7. every source-changing slice has its own branch, plan review, focused tests,
   visual proof when reader-facing, independent QA, PR, and merge into `main`;
8. the final decision report names what shipped, what stopped, why, and which
   ideas remain deliberately outside this milestone.

### Required experiments

| Experiment | Required decision |
|---|---|
| T-124 (bounded grouped `planGraph` A/B experiment) | Internal planner source slice, eligible private ELK experiment, or retain current layouts. |
| T-125 (optional local asset retrieval benchmark) | Lexical-only, one optional provider worth a separate source slice, or reject embeddings. |
| T-133 (generated-asset ingestion experiment) | Author a provenance-safe starter slice, keep generation external/custom-only, or stop. |
| T-135 (private ELK adapter experiment) | Runs only if T-124 proves the frozen eligibility condition; otherwise closes `wontdo`. |
| T-136 (cumulative weak-model validation) | Release the accumulated stack, defer named slices, or stop the milestone release with explicit regressions. |

### Conditional task rules

- T-134 runs only if arm B in T-124 passes every internal-planner gate.
- T-135 runs only if T-124 makes ELK eligible. If arm B wins or the stop rule
  fires, T-135 closes `wontdo`.
- If T-135, T-125, or T-133 earns a production change not already represented
  below, the follow-up source task is created and added to this milestone
  before later slices continue.
- T-129 does not start until T-124 and the resulting T-134/T-135 disposition
  are resolved. Later source tasks remain sequential in the order shown.

### Task projection

Task frontmatter is the canonical membership record. This table is the readable
projection.

| Task | Role |
|---|---|
| T-112 (layout and routing skill quality plan) | Resolve inherited human visual acceptance for layout guidance. |
| T-113 (C4/PlantUML conversion experiment) | Resolve inherited human acceptance without confusing conversion with the semantic C4 renderer. |
| T-114 (measured text, NodeCard, and validation MVP) | Resolve the human gate for measurement and card invariants reused by later work. |
| T-117 (connector color and edge-label evaluation) | Resolve the human gate for connector styling and labels reused by later work. |
| T-118 (obstacle-aware connector routing) | Reconcile the completed source evidence with its still-open human acceptance state. |
| T-124 (bounded grouped `planGraph` experiment) | First active task; decide internal planner, ELK eligibility, or stop. |
| T-134 (conditional bounded grouped planner source slice) | Ship arm B only if T-124 earns it; otherwise close `wontdo`. |
| T-135 (conditional private ELK adapter experiment) | Run only if T-124 makes ELK eligible; otherwise close `wontdo`. |
| T-129 (named semantic palettes and redundant status cues) | Let models choose stable meaning-bearing palettes without raw hex colors. |
| T-130 (template-owned semantic node figure variants) | Add a finite semantic shape vocabulary, including bullet and badge variants. |
| T-131 (slot-based composition for weak-model non-graph visuals) | Replace common manual coordinates with bounded composition slots. |
| T-132 (provenance-safe asset pack authoring flow) | Make safe, deterministic catalog extension a supported maintainer workflow. |
| T-133 (bounded generated-asset ingestion experiment) | Test generated SVG ingestion without automatically bundling unreviewed assets. |
| T-125 (optional local asset retrieval benchmark) | Measure whether a small opt-in encoder materially beats merged lexical search. |
| T-136 (cumulative weak-model validation and release decision) | Revalidate the exact merged stack and close or stop the milestone. |
