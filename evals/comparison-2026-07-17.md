# Local weak-model eval — 2026-07-17

Runtime: Pi CLI with `omlx/Qwen3.6-35B-A3B-4bit`, one sample per scenario.
Pi's local catalog identifies this as a custom model because the catalog is
stale, but the live oMLX endpoint accepted the model and completed every run.

## Blind reference pass

An agent without conversation context received only each eval prompt, the
diagram skills, and an isolated output directory. All three existing scenarios
produced semantically usable source and rendered PNGs. Direct image review still
found a shared runner defect: long diagram theses were clipped at the canvas
edges. It also confirmed that valid geometry does not guarantee a clean story;
the repository and ML maps retained optional long routes.

Reference artifacts: `evals/run/2026-07-17-reference-blind/`.

## Before/after findings

- The fresh pre-change eval2 render reported `validation.ok=true` but visibly
  clipped its subtitle. The runner now wraps the thesis and records its bounds.
- Section groups wider than the canvas are now a hard failure. Rows above four
  cards are partitioned into balanced rows by the runner.
- Each section title now uses its quietest alignment selected after edge
  routing. All four final renders have zero visible-title crossings without
  rerouting node-safe arrows through cards.
- Contract validation now ignores words such as `export`, `children:`, and
  `x:` inside titles, bullets, and comments, while still rejecting the same
  constructs when they occur as executable graph syntax.
- The clarification scenario first asks material questions, then reads a user
  answer artifact, emits a brief with explicit inclusions/exclusions, and sends
  both the brief and authoritative answers to the drawing pass. This prevented
  the audit-log requirement from disappearing during normalization.

## Final local matrix

| eval | difficulty / input | attempts | nodes / edges / sections | hard geometry | title crossings | visual judgment |
| --- | --- | ---: | ---: | --- | ---: | --- |
| eval1 | medium / documentation | 1 | 15 / 15 / 6 | pass | 0 | Clear ML lifecycle; a few long feedback routes remain secondary. |
| eval2 | hard / repository | 3 | 16 / 15 / 5 | pass | 0 | Correct layered repo story; core-to-render area remains the busiest case. |
| eval3 | easy / documentation | 1 | 9 / 7 / 5 | pass | 0 | Sparse, readable lifecycle with ownership and exit state visible. |
| eval4 | hard / dictated-ambiguous | 2 | 10 / 9 / 2 | pass | 0 | Compact two-row process spine; mandatory human gate, audit, and metrics preserved. |

Final artifacts: `evals/run/2026-07-17-final-2/eval1/` through
`evals/run/2026-07-17-final-2/eval4/`.

These paths are local reproducibility evidence. `evals/run/**` is intentionally
gitignored because it contains generated PNGs, raw model responses, executable
runners, and other run-specific outputs.

`attempts` counts draw attempts after any gather/clarify stages. `hard geometry`
means no card overlap, clipping, arrow-through-card failure, oversized section,
or exhausted validation retry. `title crossings` counts routed edges through
the measured visible title text, not through unused header-band whitespace.

## Verdict and limit

The local 4-bit lane is usable for these four typical workflows: every final
artifact passed the hard gate, and the new ambiguous-input case preserved its
operator constraints. This is a one-sample smoke matrix, not a stability claim.
For a release gate, rerun three samples per scenario and compare hard-fail rate
plus best-of-three visual quality.
