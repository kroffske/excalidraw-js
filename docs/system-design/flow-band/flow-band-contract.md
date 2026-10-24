# Contract: `flow.band` and declarative-layer principles

- Contract version: **1.3** (revision history in §12).
- Original decisions: 2026-07-26 (v1.0 and revisions 1.1–1.3).
- English edition and authoring clarification: 2026-10-23. Requirement IDs and
  historical decisions are retained; translation does not certify implementation.
- Status: revision 1.1 was accepted by the owner on 2026-07-26. Implementation was
  tracked as `T-145`, `implement flow.band declarative template per contract 1.1`:
  replacing repeated coordinate-heavy process generators with a shared template.
  This document remains the requirements source, not a current completion report.
- v1.0 inputs: `.locus/prompts/flow-band-contract.draft.md`,
  `.locus/prompts/flow-band-contract.review-fable.md`,
  `.locus/prompts/flow-band-contract.review-codex.md`,
  `.locus/prompts/hand-authored-coordinates-vs-diagram-dsl.md` and its `.review.md`.
- Revision 1.1 inputs: `.reports/2026-07-26-memo-flow-band-dsl-principles/memo.md`
  (testing whether each requirement is needed; source priority: soul.md, code,
  contract, review), and
  `.locus/prompts/flow-band-dsl-revision.review-fable.md` /
  `.locus/prompts/flow-band-dsl-revision.review-sol.md`.
- Historical `path:line` references were checked on the original decision date;
  line numbers can drift. Requirement prefixes: P principles, B responsibilities,
  S specification, R result, D diagnostics, E engine invariants, A acceptance,
  X exclusions, V deferred work.

## Reading this contract today

The primary authoring surface is **JavaScript/TypeScript semantic API source**.
A `BandFlowSpec` is an ordinary object in that source; separate JSON imports
remain supported for compatibility. There is no separate parser-based DSL.
See [the authoring guide](../../authoring.md) for the supported public workflow.

The October documentation audit found an unresolved implementation/contract gap:
E5 describes a warning-only fallback for blocked routes, but the shared geometry
validator can classify an arrow through another block as an error, after which
the public builder returns no scene (R4). Do not promise warning-only public
success until an end-to-end fixture resolves this conflict. This edition does
not change routing code or weaken either requirement.

## 0. Resolution of the original reviews

These verdicts describe the original source inspection, not newly verified line numbers.

| # | Disagreement | Decision and evidence |
|---|---|---|
| 0.1 | Fable considered named corridors almost available; Codex found a closed candidate list. | Codex was correct: `detourCandidates` builds an internal list; `clearCorridors` finds unnamed gaps from obstacle projections; `ConnectOptions` has no named or prioritized gutters (`src/layout.ts:2177-2205,2277-2306,639-672`). Band-aware corridors are new internal work (E6), not a spec field. |
| 0.2 | Clock values prevent byte identity from spec, seed, and version alone. | Correct for the original `Scene`, which writes `Date.now()` / `updated` (`src/core.ts:105,131`). **Superseded by revision 1.1 D1:** band uses `SCENE_EPOCH`; the current formula P4/E1 excludes clocks. The former injectable-clock requirement is retained as history in E2. |
| 0.3 | The original iteration ban contradicts iterative primitives. | Correct: label resolution uses up to four passes, overlap avoidance up to `items.length + 2`, routing uses ordered candidates (`src/layout.ts:2487,2148-2150`, `src/validate.ts:289-293`). **Superseded by revision 1.1 D2:** bounded passes with deterministic order, tie-breaking, and sufficiency thresholds replace the ban. |
| 0.4 | A successful `assertDiagramHealthy` does not prove readability. | Correct: success means no errors; warnings pass (`src/validate.ts:252-253,170-186`). A3 requires zero errors, zero `arrow-through-block`, an exact warning-set snapshot, and the separate binding check A4. Revision 1.1 D3 replaced warning counts/allowlists with that policy. |
| 0.5 | `MAX_SCENE_WIDTH=2700` and `maxBandWidth` measure different things. | Correct: the whole-scene gate includes titles and legend (`src/semantic-swimlane.ts:999-1006,184`). E4 defines independent fail-closed gates for band content and the full scene. |
| 0.6 | The low-level router returns the least-bad route when every candidate hits an obstacle. | Correct (`src/layout.ts:2155-2163`). Public `layout.connect` remains best-effort. The original band `EDGE_ROUTE_BLOCKED` refusal was **superseded by revision 1.2**: E5 requires a strategy ladder and a warning after exhaustion. See the current implementation gap above. |
| 0.7 | Ellipse/diamond archetypes conflict with rectangle-only writer bindings. | Preserve the shape grammar; extend the writer to native ellipse and diamond bindings with shape-specific focus geometry. The original restriction was a library policy, not an Excalidraw format limitation (`src/layout.ts:754`; validation precedent `src/semantic-swimlane.ts:299-307`). Both consumers' legends depend on shapes. |
| 0.8 | P7 forbids nudges while `GraphNodeOverride` exposes x/y. | Keep nudges out of band v1. Absolute overrides are not a precedent for the declarative layer (`src/diagram.ts:120-129`). About 3,150 consumer lines contained no small node-nudge use case; manual label corrections become engine work. Reopening conditions are in §10. |

## 1. Problem and scope

The original consumers implemented the same process-ribbon genre four times:
3,153 lines of absolute coordinates for lanes × stages, icon/body archetypes,
provenance/feedback edges, a legend, and wrapping into bands. One `flow.band`
template owns that genre, so the next unsupported genre need not fall into raw
`Scene` construction.

The decision is **a new template**, not an evolution of `flow.swimlane`.
Swimlane's byte-compatibility promise prevents geometry changes; its closed
schema would accumulate conditional fields; its DAG invariant differs from band
feedback cycles. Dispatch by `template` is small
(`src/semantic-diagram.ts:130-165`); implementing the compiler was not a small
change. Relevant original checks: `rejectUnknownFields`
(`src/semantic-schema.ts:128-144`) and swimlane cycle rejection
(`src/semantic-swimlane.ts:670-676`).

## 2. Declarative-layer principles

**P1. Coordinates are output, and text is anchored.** Authors do not supply
placement x/y/width for nodes or text. Lane captions, card bodies, and edge labels
are semantic anchors; the engine computes baselines and padding. Manual numbers
drift with content (consumer examples: live-smoke:75,83,100–124 and
review-pipeline:204,209). A1 structurally excludes geometry from migration
fixtures. The medium budget `maxBandWidth` is the explicit P14 exception.

**P2. Arrays express total reading order.** `stages` orders columns, `lanes`
orders rows, and `nodes` orders a cell's stack. No free
`rightOf/below/align` constraint solver is introduced. The fixed algorithm makes
the result deterministic; the relations alone do not uniquely determine geometry.
The schema admits IDs and array order, not positional references.

**P3. Extend through templates, not a universal language.** A new diagram genre
gets a strict `template` member. Narrow schemas keep diagnostics and placement
explainable. Band is a separate compiler; P12/A5 preserve swimlane.

**P4. Determinism includes a bounded iteration budget.** The tuple
`(canonical spec, seed, package version, asset-pack version)` produces
byte-identical scene JSON, with no normalization. Band time fields
(`updated`, `created`, `lastRetrieved` where present) use
`SCENE_EPOCH = 0`; existing templates retain their clock behavior until a major
compatibility decision. Each iterative pass declares canonical order, a finite
cap, a total tie-break, and a sufficiency threshold, all through named code
constants. Stop early when no improvement is possible. Do not depend on unseeded
randomness, unordered/hash traversal, locale/Intl behavior, or platform font
metrics. This is a scene contract, not a PNG byte-identity promise (A6, E1).

**P5. Separate hard guarantees from readability.** Width, cell capacity, native
bindings, and geometry validity fail closed. Readability findings such as aspect
ratio are warnings. Never silently crop text, shrink without the specified
warning, or discard a relationship. Diagnostics name spec-level repairs. The
original blocked-route hard failure was superseded by E5 in revision 1.2; the
interaction with R4 remains an identified implementation gap.

**P6. The engine owns visual chores.** Text wrapping, repeated lane headers,
obstacles, label separation, and legend generation are engine responsibilities.
The author supplies the medium budget through `maxBandWidth`, not adjustments
to each element (B1–B6).

**P7. No geometry escape hatch in band v1.** No nudges or absolute coordinates
inside the strict spec. The low-level composition layer remains an explicit,
less constrained escape for a different kind of task; this is not a global ban
on all package geometry. Nudges require the real-case evidence in V2-2; absolute
coordinates never become part of this semantic template.

**P8. JavaScript/TypeScript objects, no new parser.** The primary source is JS/TS
using the semantic API, including strict data objects. JSON input is a compatible
import, not the primary authoring instruction. The original decision selected
JSON/TS data over a new parser; the owner clarified the author-facing priority on
2026-10-23. This is a product decision, not evidence that one syntax is best for
every model.

**P9. Closed schemas and stable diagnostics.** Reject unknown fields. Diagnostics
use a closed public code union and actionable paths/hints; extending that union
is a public API change, not an undocumented implementation detail.

**P10. Inspectable output.** Metadata maps spec paths to element IDs, bounds,
and bands. An agent can inspect membership and wrapping without parsing scene
elements or requiring a PNG. R2/R3 verify this boundary.

**P11. Explicit complexity limits.** Every limit has a concrete failure and a
negative test. The author splits views when the budget is exceeded. Do not rely
on undefined "reasonable size" assumptions (S9, A7/A8).

**P12. Existing-template byte compatibility.** Identical existing-template input
under its established seed/clock contract must keep identical scene output.
Geometry changes require a major compatibility decision and migration note.
Do not weaken semantic compatibility while preserving bytes (A5).

**P13. Native bindings and shape grammar.** Every band edge has validated start
and end bindings. Actors are ellipses; decisions are diamonds; agents/steps are
rectangular cards; artifacts are dashed cards. Extend native shape-aware binding
support rather than inserting invisible rectangle targets. Shapes are semantic,
not a theme toggle; changing them also affects P12's byte contract (A4, E7).

**P14. One term per concept.** Use established genre vocabulary; keep shared
diagnostic, metadata, status, and severity names consistent. Entities use
`type`; relations use `kind`; references use string IDs. Every model-facing
term needs a row in [the lexicon](../dsl-lexicon.md) in the same change.
Reject positional numeric references (`stage: 3`, `*Index`, `*Order`),
geometry/typography terms for semantic fields, abbreviations such as `lbl` or
`idx`, and mixed booleans/strings where one enum suffices. The template may
introduce one root concept, `band`, used consistently in `maxBandWidth`,
`metadata.bands[]`, and `BAND_COUNT_EXCEEDED`. Genre-specific
`nodes`/`activities`/`participants` names across templates are allowed;
synonyms inside one template and one name for distinct concepts are not.
`title` is a heading and `label` a short caption. Naming follows the
weak-model-first design rationale; a performance benefit still needs measurement.
A12 makes the vocabulary policy reviewable and testable.

## 3. Author/engine responsibility boundary

| B# | Author declares | Engine computes |
|---|---|---|
| B1 | Lanes, order, label/sublabel | Lane height, repeated headers, omission of an empty lane in a particular band |
| B2 | Stages and order | Column widths, gaps, greedy first-fit wrapping under `maxBandWidth` |
| B3 | Node lane/stage, archetype, title, icon, details, status | Shape, size, font, wrapping, palette color, cell stack |
| B4 | Edge endpoints, kind, label | Routing, band-aware corridors, ports, bindings, label placement and collision resolution |
| B5 | `legend: "auto" \| "none"` | Used archetypes/kinds/statuses, standard captions, placement, width and overlap participation |
| B6 | Optional `maxBandWidth`, default 2400 | Actual wraps, number of bands, aspect-ratio warnings |

Authors do not declare coordinates, element dimensions, ports, routes,
`routeBounds`, label offsets, wrap positions, or legend entries.

## 4. v1 `flow.band` specification

The original field selection was grounded in two consumer files:
`live-smoke-pipeline.diagram.mjs` and `review-pipeline.diagram.mjs`.

```ts
interface BandFlowSpec {
  template: "flow.band";
  title: string;                         // At most 80 characters.
  subtitle?: string;                     // At most 120.
  palette?: SemanticPaletteName;         // semantic-neutral | change-diff | high-contrast | c4-blue
  layout?: {
    maxBandWidth?: number;               // Default 2400; integer in [800, 2700].
    // repeatLaneHeaders was removed in revision 1.1; headers always repeat.
  };
  lanes: Array<{                         // 2..6, top-to-bottom.
    id: string;
    label: string;                       // At most 48.
    sublabel?: string;                   // At most 48.
  }>;
  stages: Array<{                        // 1..12, required, left-to-right.
    id: string;
    label?: string;                      // At most 32.
  }>;
  nodes: Array<{                         // 1..28.
    id: string;
    lane: string;                        // lanes[].id
    stage: string;                       // stages[].id, never an index.
    type: "actor" | "agent" | "artifact" | "decision" | "step";
    title: string;                       // At most 80.
    icon?: string;                       // Bundled asset registry ID.
    details?: string[];                  // At most 4 entries, 60 characters each.
    status?: SemanticStatus;             // added | changed | removed | risk
  }>;
  edges: Array<{                         // 0..40.
    id?: string;                         // Derived from (from, to, kind) when omitted.
    from: string;                        // nodes[].id
    to: string;
    label?: string;                      // At most 48.
    kind?: "primary" | "provenance" | "feedback"; // Default primary.
  }>;
  legend?: "auto" | "none";              // Default auto; no boolean form.
}
```

- **S1. Explicit stages.** Stages are required, not inferred from edges. Cycles
  and provenance-only inputs (all three live-smoke artifacts) make a primary-depth
  inference insufficient; v1 does not define that algorithm.
- **S2. String caps.** Title 80, subtitle 120, lane label/sublabel 48, stage label
  32, node title 80, each detail 60, edge label 48. Exceeding a cap produces
  `STRING_TOO_LONG` with a path. Original precedent:
  `src/semantic-swimlane.ts:170-173`; the 58-character artifact title fits.
- **S3. Cell capacity.** A cell is `(lane, stage)`, holds at most three nodes,
  and stacks them in input order. Precedent:
  `src/semantic-swimlane.ts:168,817-834`.
- **S4. Stage identity.** `stage` is a string ID, never an array index:
  reordering stages must not retarget nodes or edges.
- **S5. Details and fitting.** Revision 1.1 renamed `lines` to `details`
  because content is semantic, not a number of rendered lines. Each entry may
  wrap to at most two visual lines using `fitText`, shrinking to the minimum
  font size if necessary. Minimum-size shrinkage emits `text-shrunk-to-min`;
  remaining overflow is an error (`src/text.ts:5-116`).
- **S6. Archetypes.** Actor: ellipse; decision: diamond; agent/step: `nodeCard`;
  artifact: dashed rectangular card (swimlane precedent at
  `src/semantic-swimlane.ts:750-752`). Revision 1.1 changed `check` to
  `decision` and `operator` to `actor`, reusing existing package/UML terms.
  Double-border artifacts (live-smoke:186–201) and folded-document artifacts
  (review-pipeline:162–193) normalize to dashed cards: an intentional visible
  migration loss.
- **S7. Edge meaning.** Primary is solid, provenance thin/dashed, feedback dashed
  with a distinct role color. All edges run from→to. The primary-only subgraph
  must be acyclic; otherwise `CYCLIC_FLOW` tells the author to mark the genuine
  feedback edge. Provenance/feedback edges do not participate in that check.
- **S8. Wrapping.** `maxBandWidth` defaults to 2400, range [800, 2700], never
  above `MAX_SCENE_WIDTH`. Greedy first-fit adds whole stages until the next
  would exceed the band width, then opens a band. One oversized stage produces
  `STAGE_TOO_WIDE`; more than three bands produces `BAND_COUNT_EXCEEDED`.
- **S9. Versioned complexity budget.** Lanes 2..6, stages 1..12, nodes 1..28,
  edges 0..40, cell capacity 3, bands 3, details 4. The original larger consumer
  had four lanes, 22 nodes, 23 edges, and about eight stages. Six lanes deliberately
  differs from swimlane's five. Raising a limit is a compatible minor change
  only with repeated evidence from diverse fixtures and weak-model runs, not
  one hand-tuned example. Concrete fail-closed caps remain until a real benchmark
  corpus supports replacements.
- **S10. Empty lanes.** Omit a lane within a band that contains no nodes in it.
  A lane empty across the whole spec produces `EMPTY_LANE`.
- **S11. Legend.** Auto mode lists used archetypes in enum order, then used edge
  kinds, then used statuses, with library-owned text. `"none"` disables it.
  Revision 1.1 rejected the mixed `"auto" | false` form. Per-entity legend
  commentary from live-smoke:525,538 is intentionally not represented in v1;
  reopen through V2-6. Usage documentation must distinguish band's default
  legend from C4/swimlane behavior.
- **S12. Derived IDs and repeated headers.** Added in revision 1.1:
  (a) edge IDs are optional because (from, to, kind) is already unique under D7.
  Default IDs are `<from>-><to>`, with a kind suffix when a pair has different
  kinds; metadata/diagnostics use authored or derived identity.
  (b) `repeatLaneHeaders` is removed: repetition is unconditional engine work
  (B1/P6). Only V2-8 can reopen author control.

## 5. Build result contract

The following interfaces describe the intended result contract; consult exported
types for the current API.

```ts
interface BandDiagramBuildResult {
  ok: boolean;                          // False means no scene or metadata.
  diagnostics: DiagramDiagnostic[];     // severity, code, path, message, hint?
  scene?: Scene;
  metadata?: BandDiagramBuildMetadata;
  geometry?: ValidationResult;          // Engine-run geometry validation.
}
interface BandDiagramBuildMetadata {
  bands: Array<{ index: number; bounds: Bounds; stageIds: string[] }>;
  lanes: Array<{
    id: string; path: string;
    instances: Array<{ band: number; bounds: Bounds; elementIds: string[] }>;
  }>;
  stages: Array<{ id: string; path: string; band: number; bounds: Bounds }>;
  nodes: Array<{ id: string; path: string; band: number; bounds: Bounds; elementIds: string[] }>;
  edges: Array<{
    id: string; path: string; points: PointTuple[];
    elementIds: string[]; labelBounds?: Bounds;
    bound: true;                        // Native-binding guarantee, P13.
  }>;
  legend?: { bounds: Bounds; elementIds: string[]; entries: string[] };
  title: { bounds: Bounds; elementIds: string[] };
}
```

- **R1. Success.** `ok === true` iff diagnostics contain no error and scene,
  metadata, and geometry are present. The original precedent was the swimlane
  result (`src/semantic-swimlane.ts:99-120`).
- **R2. Coverage.** Metadata covers each spec entity, mapping spec paths to
  geometry and element IDs without parsing scene records.
- **R3. Band dimension.** `bands[]`, `nodes[].band`, and `stages[].band`
  allow wrapping checks without a PNG.
- **R4. Geometry gate.** The engine runs `validateDiagram` before returning.
  Geometry errors require `ok: false` and `GEOMETRY_ERROR`; the builder
  must not return a scene it considers invalid.
- **R5. Severity spelling.** Revision 1.1 requires `"error" | "warning"` at
  the band result boundary, normalizing geometry's lower-level `"warn"`.
  The public low-level `ValidationIssue` type remains unchanged. This is a
  requirement, not a claim that every current nested result has been normalized.

## 6. v1 diagnostics

Reuse `UNKNOWN_FIELD`, `MISSING_FIELD`, `INVALID_STRING`, `INVALID_ID`,
`DUPLICATE_ID`, `STRING_TOO_LONG`, `INVALID_LANE_COUNT`, `EMPTY_LANE`,
`UNKNOWN_ICON_ID`, `NATIVE_BINDING_ERROR`, `INVALID_SEED`,
`GEOMETRY_ERROR`, and `UNSUPPORTED_TEMPLATE`
(original union: `src/semantic-schema.ts:3-41`).

| D# | Code | Condition and repair hint |
|---|---|---|
| D1 | `CYCLIC_FLOW` | Primary cycle; identify the genuine backward relationship as feedback. |
| D2 | `FLOW_CELL_CAPACITY_EXCEEDED` | More than three nodes in a cell; move a node or split the stage. |
| D3 | `UNKNOWN_STAGE` | Missing stage reference; show available stage IDs. |
| D4 | `UNKNOWN_NODE_LANE` | Missing lane reference; show available lane IDs. |
| D5 | `UNKNOWN_EDGE_ENDPOINT` | Missing source or target node; name the invalid endpoint. |
| D6 | `SELF_EDGE` | Source equals target; remove or split the step. |
| D7 | `DUPLICATE_EDGE_PAIR` | Repeated (from, to, kind); merge labels instead of duplicating the relationship. |
| D8 | `INVALID_NODE_TYPE` | Unsupported archetype; list actor, agent, artifact, decision, step. |
| D9 | `INVALID_EDGE_KIND` | Unsupported kind; list primary, provenance, feedback. |
| D10 | `INVALID_STAGE_COUNT` | Outside 1..12; split views. |
| D11 | `INVALID_NODE_COUNT` | Outside 1..28; split views. |
| D12 | `INVALID_EDGE_COUNT` | Outside 0..40; split views. |
| D13 | `STAGE_TOO_WIDE` | One stage exceeds the band budget; shorten content, reduce the cell, or increase the budget. |
| D14 | `BAND_COUNT_EXCEEDED` | More than three bands; split views or increase the budget. |
| D15 | `EDGE_ROUTE_BLOCKED` | **Superseded in revision 1.2.** Code remains reserved; E5 calls for `edge-through-node` warning instead. |
| D16 | `INVALID_BAND_WIDTH` | Non-integer or outside 800..2700; explain band width versus total scene width. Added during W1 instead of generic `INVALID_DOCUMENT`. |

Every diagnostic has the exact offending spec path. Do not introduce v1 codes for
removed groups, nudges, via routes, or target aspect.

### Geometry diagnostic policy

Maintain an exhaustive, machine-readable `Record` over `ValidationCode` and
`DiagramDiagnosticCode`: code → severity → rationale → model action. Actions
form the closed enum `fix-spec | accept | split | escalate`. A missing row for
a new code fails type checking; changing severity is a public policy change.

A warning must identify its subject/path, measured value, and semantic repair.
Do not send the author back to pixel adjustment. The registry is the model's
inspection surface when it cannot see the PNG.

| Code | Severity | Action and rationale |
|---|---|---|
| `text-overflow` | error | fix-spec: shorten content. |
| `text-outside-frame` | error | fix-spec: shorten or split content. |
| `block-overlap` | error | split: separate views. |
| `arrow-through-block` | error | fix-spec: revise stage/lane assignment. See the unresolved E5/R4 conflict. |
| `output-clipped` | error | escalate: output must not be clipped. |
| `label-overlap` | warning | fix-spec: shorten labels, then split if needed. |
| `aspect-ratio` | warning | accept or split: whole-scene ratio outside [0.4, 2.5]. |
| `edge-crossings` | warning | fix-spec: consider stage/lane ordering, then split; count edge-edge crossings. |
| `edge-through-node` | warning | fix-spec, then accept if appropriate: E5 exhausted its routing ladder. Added in revision 1.2. |
| `text-shrunk-to-min` | warning | fix-spec: shorten text that reached the minimum font size. |

Warnings do not independently make `ok` false. `label-displaced` remains V2-9;
`label-over-block-text`, `edge-label-ambiguous`, `dense-region`, and
`band-continuity-ambiguous` remain V2-10 until a case and metric exist.
`low-contrast` was rejected as a scene diagnostic: contrast belongs to the
closed palette invariant.

## 7. Engine invariants

- **E1. Determinism.** Revision 1.1 D1/D2 applies P4 without normalization or
  clock input. All passes use canonical spec-array order. Publish a
  pass → cap → tie-break → sufficiency-threshold table referencing named code
  constants in each cell. A structural test checks that table, as A10 checks
  skill routing.
- **E2. Injectable clocks — superseded.** Revision 1.1 D1 removed clocks from the
  band formula. Band writes `SCENE_EPOCH`. The original proposal added
  `now?: number` to build/scene options, defaulting to `Date.now()`
  (`src/core.ts:105,131`); clock injection remains an existing-template
  implementation detail, not a band-author or band-CI requirement.
- **E3. Default seed.** Use 42, matching swimlane
  (`src/semantic-swimlane.ts:263`).
- **E4. Two independent width gates.** Band content must fit `maxBandWidth`;
  the entire scene, including bands, legend, and titles, must fit
  `MAX_SCENE_WIDTH = 2700`, measured by `scene.bounds()`. The former
  wraps or emits `STAGE_TOO_WIDE`; the latter emits `GEOMETRY_ERROR`
  with a hint to reduce the budget or disable the legend.
- **E5. Routing ladder, then warning.** Revision 1.2 replaced hard refusal.
  Evaluate a fixed ordered ladder: auto within band, auto across scene,
  outer top/bottom/left, orthogonal, straight. Revision 1.3 selects the
  **shortest clean** candidate, not the first clean candidate. If none is clean,
  select the least bad by total order: fewer crossings, shorter route, earlier
  ladder entry. The intended result is a scene plus `edge-through-node`
  warning with spec paths and intersected node names. Candidates are evaluated
  on scratch scenes; losers never enter output. Strategy count bounds the
  budget. Low-level `avoidObstacles`' fewest-crossings fallback remains
  internal (`src/layout.ts:2155-2163`); the compiler chooses by its own metric.
  Public `layout.connect` is unchanged. Node cards, legend, lane/stage headers
  are obstacles; background lane/band separators are not, because cross-lane
  edges must cross them. See the public-builder gap at the start of this document.
- **E6. Band-aware corridors.** The engine constructs bands and lanes, so it
  must internally prioritize their gaps as routing candidates. Originally
  `detourCandidates` was closed and `ConnectOptions` had no corridor injection
  (`src/layout.ts:2177-2205,639-672`). This is engine work, not a spec field (0.1).
- **E7. Native bindings.** Validate both ends of every edge before success.
  Failure produces `NATIVE_BINDING_ERROR` and `ok: false`. Writer support
  extends to ellipse/diamond (P13).
- **E8. Mandatory post-validation.** The compiler itself runs
  `resolveLabelCollisions` with all cards/labels and `validateDiagram`;
  geometry errors fail under R4. Validation is not an optional consumer step.
- **E9. Input immutability.** Do not mutate the spec. Apply defaults to a copy.
- **E10. Canonical serialization.** Added in revision 1.1 after Fable's finding.
  Define byte identity through (a) canonical per-template element order,
  (b) stable `JSON.stringify` element-key order (originally insertion order,
  `src/core.ts:324-337,347-349`), and (c) IDs determined by
  (seed, creation ordinal), currently the seeded random stream
  (`src/core.ts:370-384`). A change to any is a major compatibility event;
  otherwise refactoring creation order would invalidate every identity.
  Band order: title/subtitle; for each band, stage labels, then lanes in
  `lanes` order (label, sublabel, separator), then cell nodes in
  `nodes` order; then edges in `edges` order (arrow, label); finally legend.
  Card internals follow card construction order. Test scene-element order
  against metadata. Historical hash snapshots motivated the original decision;
  they are not a new requirement to add digest pins or a substitute for semantic checks.

## 8. Acceptance criteria

- **A1. Two migration fixtures and a structural gate.** Rewrite
  `live-smoke-pipeline.diagram.mjs` (629 lines; acyclic, 12 nodes, 16 edges,
  four lanes) and `review-pipeline.diagram.mjs` (875 lines; feedback
  `answerClarification → request` at :743, decision diamond, lane sublabels)
  using band. Each fixture contains only a `BandFlowSpec` object, builder call,
  and output write. A text/AST check rejects `scene.`, `layout.`,
  `Bounds(`, `routeBounds`, `labelOffset`, and numeric coordinate fields.
  Line count is informational. Both fixtures are required to prove feedback,
  not just the DAG case.
- **A2. Content and meaning parity.** Match each source's lane/stage/node/edge
  counts and edge-label sets in metadata; live-smoke has four lanes, 12 nodes,
  and 16 edges. Legend archetypes match the source. Revision 1.1 adds one-time
  human review of primary/provenance/feedback assignments against each original
  generator; preserve those assignments in fixtures. A7's kind mutation proves
  semantic behavior, not only style.
- **A3. Geometry on the migration fixtures.** Require no geometry errors,
  no `arrow-through-block`, no `block-overlap`, an exact set snapshot of
  warnings by (code, IDs/paths), and a registry entry for each warning.
  Snapshot actual aspect ratio; [0.8, 1.5] is a readable comment, not a gate.
  Full width ≤2700. These are fixture-specific criteria, not guarantees for
  every valid spec. A green health assertion alone ignores warnings.
- **A4. Bindings.** Every edge in both fixtures and positive/negative cases
  passes start/end native-binding validation, including actor ellipses and
  decision diamonds. Original precedent:
  `src/semantic-swimlane.ts:299-307`.
- **A5. Existing templates.** Swimlane/C4/sequence fixture snapshots remain
  unchanged when band is added (P12).
- **A6. Determinism.** Same spec and seed, builds in different milliseconds,
  byte-identical scene JSON, no fake-clock helper. Commit a scene snapshot.
  Separately open and edit a `SCENE_EPOCH` scene in Excalidraw once. The original
  Fable review checked restoration behavior in the 0.18.0 bundle; a live opening
  was still unverified then. Reopen D1 if an actual consumer needs timestamps
  (memo §8-D1).
- **A7. Diagnostics.** Table-driven negative cases cover each applicable §6 code
  with exact code and path. D15 is reserved after revision 1.2; A8 covers its
  warning replacement. Test a primary cycle, then the same graph with a genuine
  feedback edge succeeding. Require complete registry coverage of both code
  unions and a valid action enum; add negative cases for aspect ratio,
  edge crossings, and minimum-size text.
- **A8. Wrapping boundaries.** Test (a) a stage fitting exactly in one band,
  (b) one extra body character causing a deterministic second band, (c) one
  oversized stage, (d) a spec needing four bands, (e) omission of a lane empty in
  the second band, (f) exhausted routing producing one `edge-through-node`
  warning with edge path and node name, versus none for a clean layout, and
  (g) inclusion of the legend in the total-width gate. Item (f) needs a public
  builder test, not only an internal router test.
- **A9. Metamorphic stage reorder.** Swap two stages without changing IDs.
  Build succeeds, node→stage references remain correct in metadata, and no
  edge field changes. This relies on S4's ID references.
- **A10. Agent routing.** Replace the old "cycles/phase bands/over-cap → custom"
  rule with band for process ribbons. State the stop rule: writing x/y for
  more than three nodes means the author is in the wrong layer. Describe band
  before the custom fallback. Check the skill text structurally.
- **A11. Consistent usage docs.** Add band alongside existing templates,
  correct the legend explanation (S11), preserve swimlane caps.
- **A12. Lexicon.** Added in revision 1.1. CI checks every template
  `*_FIELDS` entry and enum value has a lexicon row; no duplicate concepts
  except declared cross-template genre names; banned input names
  `index|idx|pos|order|offset|^x$|^y$|width|height` have explicit exceptions
  (currently only `layout.maxBandWidth`); reference fields do not accept
  numbers. Lexicon edits remain visible in review. Original field-list
  precedent: `src/semantic-swimlane.ts:155-158`.

## 9. Exclusions

These require a new contract even after v1:

- **X1.** Cassowary/kiwi-style free `rightOf/below/align` constraint solving.
- **X2.** Force-directed or ELK-like layout of arbitrary graphs.
- **X3.** A new text DSL with a parser.
- **X4.** Raising swimlane caps independently of band or changing swimlane bytes.
- **X5.** `bandX`/`bandY`, `routeBounds` sugar, or absolute-coordinate conveniences.
- **X6.** Byte-identical PNG output; the renderer is outside the determinism tuple.
- **X7.** Changing public `layout.connect` behavior. Its best-effort fallback
  remains; the template owns its output policy, with blocked routes revised by E5.
- **X8.** Migrating all four consumer generators in v1. Start with A1's two
  reference cases; migrate others after stabilization.

## 10. Deferred work and reopening conditions

| V# | Candidate | Required evidence to reopen |
|---|---|---|
| V2-1 | Node `groups` and `NON_CONTIGUOUS_GROUP` | A real ribbon-group consumer and defined contiguity/band-break semantics. None of the original four generators used groups. |
| V2-2 | Bounded `nudge: {dx, dy}` (magnitude ≤24 px), `NUDGE_OUT_OF_RANGE` | A migration defect not fixable by an engine rule. Absolute x/y never returns to the strict spec. |
| V2-3 | `route.via`, named gutters, `UNKNOWN_GUTTER` | A real fixture where E6 corridor routing fails despite an obvious clean route. Originally expressed as `EDGE_ROUTE_BLOCKED`; after revision 1.2 use the exhausted-ladder evidence. |
| V2-4 | `targetAspect` preference, never a hard error | At least two real specs where `maxBandWidth` is insufficient. |
| V2-5 | Infer stages from edges | Defined primary ordering for cycles/provenance-only nodes and consumer demand. |
| V2-6 | Custom legend entries | A migrated diagram needs more than standard text; original candidates live-smoke:525,538. |
| V2-7 | `route: "direct"` hint | A real case where auto detours despite a valid, more readable direct edge. |
| V2-8 | `layout.repeatLaneHeaders` | A real band case where unconditional repetition is harmful. Removed by revision 1.1. |
| V2-9 | `label-displaced` warning | Reproducible reader misassociation after lifting by `LABEL_LIFT_STEPS` (`src/layout.ts:2496`). Fable's proposal lacked fixture evidence. |
| V2-10 | `label-over-block-text`, `edge-label-ambiguous`, `dense-region`, `band-continuity-ambiguous` | For each code: a real reproducible fixture and a defined metric. Account for existing `LABEL_BORDER_PENALTY` (`src/layout.ts:2486`). |
| V2-11 | Source→entity/relationship→claim manifest | A defined fact-source format and blind repair-loop research showing semantic improvement beyond A2. |
| V2-12 | Structured `observed`/`expected`/`action`/`relatedPaths` diagnostics | Evidence that the registry and message format fail in real weak-model repair loops. Additional fields are a public API change. |

## 11. Decision state

The original draft choices are closed: explicit stages (S1), no groups (V2-1),
no via (V2-3), concrete caps (S9), no nudges (V2-2), a new template (§1), and this
directory as the contract home, with usage guidance in `docs/usage.md`.

Revision 1.1 closed the normalized-versus-byte-identical question in favor of
byte identity without normalization: removing the clock avoids a new normalizer
and its failure surface. Existing hash-based fixtures were historical precedent
(`tests/native-binding-fixtures.test.ts:19-25`), not permission to add new digest
pins indiscriminately. Current semantic and public-boundary checks still matter.

This records closed design choices, not absence of implementation defects. The
October audit's E5/R4 discrepancy remains open for a scoped runtime change.

## 12. Revision history

### English edition and authoring clarification — 2026-10-23

Translate maintained prose into English, preserve requirement IDs and the
decisions below, clarify JS/TS source as the primary authoring path in P8, and
separate requirements from verified implementation. Record the E5/R4 public
builder conflict; do not silently change routing or claim its resolution.

### Revision 1.3 — 2026-07-26

Initiated by W8's visual inspection of the first rendered fixture.

**Change:** E5 chooses the shortest clean route rather than the first clean
strategy. One total comparator now covers clean and obstructed candidates:
fewer crossings, shorter polyline, earlier strategy.

**Reason:** A provenance edge in `examples/band_flow_spec.json` took a clean
detour around the entire right side, widening the scene by almost a third and
suggesting a relationship to another region. First-clean optimized strategy
position, not readability, and consumed E4's hard width budget.

**Preserved:** deterministic tie-breaking, scratch candidates excluded from
output, strategy-count cap, and existing-template byte compatibility. The ladder
is band-only.

### Revision 1.2 — 2026-07-26

Initiated by the owner during W3: unavoidable intersections should leave a
diagram with a named defect, not prevent every output after several attempts.

**Change:** supersede `EDGE_ROUTE_BLOCKED` in 0.6/D15 with a seven-strategy
ladder and `edge-through-node` warning on exhaustion. The revision originally
selected first-clean; revision 1.3 supersedes that selection rule. Update the
registry and A8 accordingly.

**Reason:** avoiding every crossing in a dense ribbon is a readability goal,
not an unconditional routing guarantee. Hard refusal gives the author no scene
rather than a scene with a known limitation.

**Preserved:** hard width/cell/binding/geometry gates, public `layout.connect`,
deterministic ordering and candidate isolation. The later audit identifies the
unresolved interaction between the warning intention and the geometry gate.

### Revision 1.1 — 2026-07-26

The memo questioned whether each requirement was necessary. Source priority was
soul.md → code → contract → review. Fable and Sol reviewed independently; one
writer reconciled their reasoning. Superseded decisions remain visible.

**D1 — clocks (P4/E1/E2/A6, superseding 0.2).** Accept Fable's fixed constant
while retaining `updated`, not Sol's package-wide clock removal and
`Date.now()` lint ban: global removal would change old-template bytes and
violate P12. Adopt Sol's canonical value `SCENE_EPOCH = 0`, matching the
existing normalization in `scripts/generate-agent-workflow-views.mjs:267-280`.
Leave old-template clocks/snapshots unchanged until a major decision. Add the
external-app smoke check and preserve the memo's timestamp-consumer reopening
condition.

**D2 — iteration (P4/E1, superseding 0.3).** Combine deterministic order, cap,
total tie-break, and named sufficiency threshold from Fable with Sol's early
stop when no improvement occurs. Existing constants exemplified the rule:
`LABEL_OVERLAP_RATIO = 0.18`, `LABEL_MAX_PASSES = 4`
(`src/layout.ts:2483,2487`), `LABEL_OVERLAP_TOLERANCE = 0.2`
(`src/validate.ts:93`). E1 requires the pass table.

**D3 — warnings (§6/A3/A7, refining 0.4).** Combine Sol's policy registry and
closed action enum with Fable's exact fixture warning-set snapshots. Replace
arbitrary warning counts. Treat warnings as model-visible inspection when no
PNG is available. Accept `edge-crossings` and `text-shrunk-to-min` for v1:
both reviewers independently proposed them and existing data supports them.
Defer displaced labels to V2-9 and unmeasured candidates to V2-10. Reject
`low-contrast` as a scene finding because closed palettes own contrast.
Accept machine-readable registry/message format, defer new diagnostic fields
to V2-12.

**D4 — naming (P14/R5/S5/S6/S11/S12/A12).** Accept `lines → details`,
`check → decision`, and homogeneous `legend: "auto" | "none"`.
Use the existing package term `decision`, not a new generic `role`.
Also accept `operator → actor`, boundary severity normalization, optional
edge IDs, and removal of `repeatLaneHeaders`.

Reject proposed renames `nodes → entities`, `edges → relationships`,
`label → meaning/title`, `kind/type → role`,
`sublabel → description`, and `icon → concept`, plus removal of
`palette`, `layout.maxBandWidth`, or `legend`. The design rationale favors
established genre names. Title and label differ; palette is a shared closed
semantic choice; width is the sole medium-budget exception; both consumers need
legends. These are recorded design reasons, not measured model-performance
results.

**Fable's serialization finding:** accept E10's element order, key order, and
seed/creation-ordinal IDs as the explicit byte contract, with major-change
treatment.

**Sol's semantic-truth finding:** partially accept. The compiler cannot verify
source claims without the fact-source format: truth belongs to the pair
specification↔source, owned by the authoring application or author, assisted by
the skill. Accept human kind-parity review in A2 and A7's kind mutation. Defer
the full claims manifest to V2-11.

**Other removal candidates:** accept optional edge IDs, scope the geometry ban
to the strict layer, replace vague same-JS-numeric-model wording with platform
dependency restrictions, and snapshot actual aspect rather than a range.
Keep concrete caps as a versioned budget until repeated evidence supports
raising them. Preserve P12 byte compatibility and P13 shape grammar: the clock
decision depends on the former and consumer legends depend on the latter.
