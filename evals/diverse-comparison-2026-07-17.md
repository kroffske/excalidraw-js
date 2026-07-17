# Diverse weak-model Excalidraw eval — 2026-07-17

## Result

The eval surface now covers pictorial objects, indexed algorithm traces,
algorithm graphs, a UI wireframe, an ML stakeholder explanation, and a standard
roadmap control. A strong Sol reference author proved all seven prompts drawable
through the same public contracts. The local 4-bit Qwen rendered a valid and
semantically usable PNG for all seven final cases.

This is a one-sample development result, not a statistical release benchmark.
The hard Course Schedule case is complete but noticeably denser and taller than
the reference. Run three or more samples per case before using pass rate as a
model comparison.

## Matrix

| eval | family | contract | depth | Sol reference | local Qwen final | attempts | visual verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| eval5 | literal candle vs financial candlestick | visual | easy | pass | pass | 1 | Clean two-panel comparison; both meanings immediately recognizable. |
| eval6 | LeetCode Two Sum array/index trace | visual | medium | pass | pass | 2 | Input, distinct indices, check-before-store order, `[0, 1]`, and `O(n)` time/space visible. |
| eval7 | longest substring sliding window | visual | hard | pass | pass | 3 | All eight characters, window invariant, duplicate move, answer `3`, and complexity visible; result card uses more vertical space than necessary. |
| eval8 | Course Schedule / Kahn | graph | hard | pass | pass | 1 | Main loop, worked DAG, two-node cycle, success/failure, and `O(V + E)` visible; 18-node Qwen render is dense. |
| eval9 | support operations UI | visual | medium | pass | pass | 1 | Realistic navigation, priority queue, selected issue, AI draft, composer, and explicit approval actions. |
| eval10 | exactly three ML classes | visual | medium | pass | pass | 1 | Three probabilities, Cat winner, and review-as-decision-state distinction are explicit. |
| eval11 | product launch roadmap control | graph | easy | pass | pass | 2 | Seven-stage launch story and ownership are clear; compact one-section graph is acceptable for this shallow case. |

## Final artifacts

Strong references:

- `evals/run/2026-07-17-diverse-reference/eval5/` through `eval11/`.

Selected local-Qwen runs:

- eval5: `evals/run/2026-07-17-diverse-qwen-eval5-2/`
- eval6: `evals/run/2026-07-17-diverse-qwen-tuned-eval6/`
- eval7: `evals/run/2026-07-17-diverse-qwen-eval7-2/`
- eval8: `evals/run/2026-07-17-diverse-qwen-tuned-eval8-2/`
- eval9: `evals/run/2026-07-17-diverse-qwen-eval9/`
- eval10: `evals/run/2026-07-17-diverse-qwen-eval10/`
- eval11: `evals/run/2026-07-17-diverse-qwen-eval11/`

Each selected run keeps the prompt sent to Pi, raw model response, extracted
source, executable runner, `.excalidraw`, PNG, summary, retry errors when any,
and run report.

These run directories are local reproducibility evidence and are intentionally
gitignored. The committed eval surface consists of prompts, runner/contract
code, tests, skills, and this result summary rather than generated PNGs or raw
model responses.

## What changed because of observed failures

1. The existing graph-only contract could not express a literal candle, true
   indexed cells, nested UI controls, or probability bars. A second safe
   `visual` contract now exposes high-level `candle`, `candlestickChart`,
   `arrayStrip`, `uiWindow`, `classScores`, `stepStrip`, `card`, and `link`
   helpers. Raw `Scene` access and arbitrary JSON remain forbidden.

2. The first candle run allowed a short card to contain too many text lines.
   Cards now calculate a minimum height from wrapped content and fail hard when
   a model requests less space.

3. The first sliding-window composition put a card over the last two array
   cells. The visual runner now rejects every top-level object overlap and feeds
   the conflicting ids into the normal retry loop.

4. The generated wrapper initially escaped `\s+` incorrectly and split wrapped
   text on the letter `s`. The template now emits the intended whitespace regex;
   final PNGs were regenerated after the fix.

5. Two algorithm drafts preserved the main flow but omitted documented
   complexity. Both weak-model skills now require explicit results, ordering
   rules/invariants, decision branches, and complexity claims to survive the
   visual reduction. The hard Course Schedule prompt also marks its worked DAG,
   cycle example, and complexity as mandatory content rather than optional
   overview detail.

6. A code review found that regex-shaped source filtering could be bypassed by
   a computed constructor call. Both contracts now use a TypeScript AST
   allowlist, generated file paths are serialized, and runtime validation checks
   actual element containment, text fit, object overlap, and links crossing
   unrelated objects. Executable tests cover all eight visual helpers and the
   negative geometry/security cases.

7. The dense Course Schedule output initially left one long cross-section edge
   through a section title. The graph runner now chooses the quietest title
   position per section after routes exist; the regenerated reference and Qwen
   summaries report zero section-title crossings.

## Boundaries and next evidence

- The visual DSL is deliberately specialized, not a general raw-scene escape
  hatch. It does not yet provide a window bracket, leader-line candle callouts,
  free-form tables, or arbitrary nested UI layout.
- Geometry validation proves bounded object content, text fit, unique ids,
  AST-valid helper source, no top-level overlaps, and no links or link labels
  through unrelated objects. Semantic correctness still requires PNG inspection
  and prompt-specific checks.
- All final Qwen results are one local sample from
  `omlx/Qwen3.6-35B-A3B-4bit`. The next honest gate is a 3-sample run of all
  seven prompts, followed by comparison against another weak/local model.
