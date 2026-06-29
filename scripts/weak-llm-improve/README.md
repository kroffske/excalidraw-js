# Weak-LLM Prompt Improvement Loop

Reusable harness for measuring and improving how a weak/local model authors
Excalidraw diagrams as restricted TypeScript graph source. The experimental
variable is the text of the weak-model lane skills
(`skills/plan-excalidraw-weak-llm/**`); everything else (the eval harness, the
scenarios, the geometry/routing runner) is held fixed so a re-run isolates the
effect of a prompt change.

## Pieces

- `run-eval.mjs` — the execution layer. Drives a weak model through `pi` with
  the live skills, extracts the restricted-TS graph, runs it through the
  hardened geometry/routing runner, renders a PNG, and writes a structured
  `report.json` + `comparison.md`. Parameterized by `--model`, `--scenario`,
  `--out`, `--run-id`.
- `improve.workflow.mjs` — the agent-triad reasoning. One Workflow invocation =
  one improvement iteration: diagnose (triad), apply edit, review, then a
  before/after verdict (triad) that recommends commit or rollback.

## The triad rule

Any step that **evaluates and produces a conclusion** (diagnose what to change,
judge whether it improved) runs as a *triad*: two independent generators — one
`codex` agent (structured / validation logic) and one `opus` agent (semantic /
prose) — each produce a variant, and an `opus` synthesizer merges them into the
final artifact.

Any **execution** step runs single-agent: `opus` when the edit is semantic /
prose (skill wording), `codex` when it is structured (validation / routing
logic). The applied edit is then **reviewed by one agent** (not a triad).

The runner always owns geometry: section positions, card sizing, icon-id
validation, edge ports, routing, overlap / arrow-through-block checks.

**Visual judging is done by the orchestrator (main-loop opus), not by
subagents.** A subagent asked to read a rendered PNG confidently reported
fabricated section titles and a non-existent overlap, so delegated visual QA is
not trustworthy here. The orchestrator reads each PNG directly and cross-checks
its scorecard against the runner's `summary.json` ground truth (section titles,
node/edge counts, `validation.ok`). The triad then reasons over those vetted
scorecards as text — it does not look at the images itself.

## One iteration

1. **Eval (before)** — `run-eval.mjs` over the chosen models × scenarios.
2. **Judge (before)** — score each rendered PNG against the rubric in
   `skills/plan-excalidraw-weak-llm/references/eval-suite.md`:
   - hard failure: card overlap, unreadable text, clipping, arrows through card
     text, relationships by numeric index
   - medium: long routes along section borders, labels too close to lines, many
     optional edges obscuring the primary story
   - pass: the layout thesis is understandable without reading the source and
     the primary edge path is visually clear
3. **Diagnose (triad)** — from the scorecards, propose a concrete edit to the
   weak-model lane skills.
4. **Apply (single agent)** — write the new skill text.
5. **Review (single agent)** — check the edit for correctness / consistency.
6. **Eval (after)** + **Judge (after)** — re-run and re-score.
7. **Verdict (triad)** — compare before vs after. Better → keep. Worse / no
   change → revert the skill edit.
8. **Commit or rollback** — commit the skill change when the verdict is "better";
   otherwise `git checkout` the skill files back to the baseline.

## Running an eval pass

```sh
# Full pass: both models × both scenarios into one report.
node scripts/weak-llm-improve/run-eval.mjs --run-id=iter0

# Split by backend so the local model and the API run concurrently with no
# GPU contention:
node scripts/weak-llm-improve/run-eval.mjs \
  --model=local-omlx-qwen36-35b-a3b-4bit --out=.tmp/weak-llm-loop/iter0-local &
node scripts/weak-llm-improve/run-eval.mjs \
  --model=openrouter-qwen3-coder-30b-a3b-instruct --out=.tmp/weak-llm-loop/iter0-openrouter &
wait
```

Each `--out` directory gets `report.json`, `comparison.md`, and per-combo
`attempt-N-*` artifacts (prompt, raw response, source, excalidraw, png,
summary, error). Outputs live under `.tmp/` and are gitignored.

## Requirements

- `pi` CLI configured with the `omlx/*` (local MLX server) and `openrouter/*`
  providers; `OPENROUTER_API_KEY` available via `.env` (loaded by the runner).
- The package built (`npm run build`) so `dist/index.js` and the render bin
  exist.
