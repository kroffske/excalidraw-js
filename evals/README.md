# Evals — weak-LLM diagram prompts

Each eval is a prompt the weak/local model runs to author an Excalidraw diagram.
You say *"run eval1 via pi"*; I run it and drop the rendered PNG into a dated run
folder. This file is the runbook for how I launch an eval.

## What a prompt says (and what it doesn't)

A prompt states the **problem only**: the task ("draw a diagram of this system")
plus the subject-matter appendix, and a pointer to *use the skill*. It does **not**
spell out how to build the diagram — no node/section/connect API, no allowed-icon
list, no expected sections, no pre-decomposed graph (primary edges / semantic
inventory), no layout dictation. The model decides the structure itself.

All of that "how" lives in the skills the runner injects
(`plan-excalidraw-graph`, `plan-excalidraw-weak-llm`, `excalidraw-diagrams`) — the
output contract (one fenced ` ```ts ` block, icon ids, size budget) is in
`skills/plan-excalidraw-weak-llm`. **That is the point of the eval:** it measures
whether the skill + the automated layout code are strong enough to carry a weak
model from a bare problem statement to a clean diagram. If a prompt has to teach
the model how to draw, fix the skill instead of the prompt.

## Layout convention

```
evals/
  README.md              # this runbook
  eval1/  prompt1.md     # ML training/validation system design (single-shot)
  eval2/  prompt2.md     # excalidraw-js repo map (stepwise: gather -> plan -> draw, with tools)
  eval3/  prompt3.md     # smart-bash daemon lifecycle (single-shot)
  run/                   # rendered outputs, gitignored
    <date>-evalN/        # e.g. run/2026-06-30-eval1/
      <model>/sample-K/  # diagram.png, source.ts, runner.mjs, diagram.excalidraw, summary.json
      run-report.md
```

Rules of the convention:

- **`evalN/` holds only markdown** — the prompt, plus any description/judging
  notes you want to keep (`evalN/notes-*.md`).
- **Generated JS and PNGs live only under `run/`**, never in `evalN/`.
- The output location is recorded in each prompt's frontmatter (`output_dir`,
  `eval`); the runner resolves `<date>` to today.

## Prompt file format

Frontmatter (read by the runner) + body (sent to the model):

```yaml
---
eval: eval1
slug: ml-system-design-train-val
diagram_title: ...        # header text on the diagram
thesis: ...               # one-sentence header subtitle + stepwise target
layout_family: ...
mode: single | stepwise
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval1
---
<the prompt body: the task + a "use the skill" pointer + the subject appendix —
 the problem, not a build recipe>
```

`mode: stepwise` runs gather (with tools) -> plan -> draw; the gather/plan step
prompts are generic and live in `scripts/weak-llm-improve/run-prompt.mjs`. Edit
the draw instructions in the prompt body. HTML comments in the body are operator
notes and are stripped before the model sees them.

## How I run an eval

Prerequisite: `npm run build` (so `dist/` exists) and `pi` configured with the
`omlx/*` + `openrouter/*` providers (`OPENROUTER_API_KEY` in `.env`, loaded by
the runner).

One eval, all models + samples from its frontmatter:

```sh
node scripts/weak-llm-improve/run-prompt.mjs --eval=evals/eval1
```

Narrow it (one model, one sample, pin the date):

```sh
node scripts/weak-llm-improve/run-prompt.mjs --eval=evals/eval2 \
  --model=local-omlx-qwen36-35b-a3b-4bit --samples=1 --date=2026-06-30
```

This reads the prompt, drives `pi` with the three skills
(`plan-excalidraw-graph`, `plan-excalidraw-weak-llm`, `excalidraw-diagrams`),
extracts the restricted-TS graph, renders it through the shared geometry runner,
and writes `diagram.png` + `source.ts` + `summary.json` under
`evals/run/<date>-evalN/<model>/sample-K/`, plus a `run-report.md`.

### Re-render a saved source

If a `source.ts` already exists (e.g. to re-render after a runner change):

```sh
node scripts/weak-llm-improve/render-graph.mjs \
  --source=evals/run/2026-06-30-eval1/<model>/sample-1/source.ts \
  --out=evals/run/2026-06-30-eval1/<model>/sample-1 \
  --prompt=evals/eval1/prompt1.md
```

### Manual pi flow (debug / transparency)

`run-prompt.mjs` is the executable form of these steps:

1. `pi --model <model> --no-tools --no-context-files --no-extensions
   --no-prompt-templates --skill skills/plan-excalidraw-graph --skill
   skills/plan-excalidraw-weak-llm --skill skills/excalidraw-diagrams
   -p "<prompt body>"`
2. Extract the single fenced ` ```ts ` block into `source.ts`.
3. `node scripts/weak-llm-improve/render-graph.mjs --source=source.ts --out=<dir> --prompt=<promptN.md>`.

For `mode: stepwise`, step 1 first runs a gather pass **with** tools (no
`--no-tools`) to write `step1-context.md`, then a plan pass to write
`step2-plan.md`, then the draw prompt above with the plan appended.

## Judging (orchestrator reads the PNGs)

Primary gate: **no hard fails** — broken artifacts (card overlap, clipping,
arrows through text, index-based edges, or a validation failure that exhausts
retries). The **local model is the priority lane.** Among hard-fail-free
results, prefer clean wide bands; tall single-column "vertical sheet" sections
are a soft negative. Output is non-deterministic, so weigh the sample set, not
one render. I read each PNG directly and cross-check against `summary.json`
(section titles, node/edge counts, `validation.ok`) — delegated image reads have
proven unreliable. Judging notes go as markdown in `evalN/`.

## Related

`scripts/weak-llm-improve/run-eval.mjs` is the batch before/after harness used by
the prompt-improvement loop (scenarios defined inline, matrix over models ×
samples). The per-eval flow here shares the same geometry runner
(`runner-template.mjs`).
