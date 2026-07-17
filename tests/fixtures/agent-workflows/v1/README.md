# Agent workflow acceptance corpus v1

This directory freezes three independent workflow cases as test evidence for
semantic diagram work. It is deliberately not a production workflow DSL.
Files under `src/` must not import this corpus; each diagram family must map the
facts into its own test fixture.

The corpus was captured from a changing, read-only `locus-pi` working tree.
Repository HEAD identifies the surrounding checkout, not the uncommitted bytes.
Every source/render therefore carries its own hash, working-tree state, capture
time, and evidence grade.

## Normative test-only shape

`manifest.json` has exactly:

- `schema`: `agent-workflow-corpus.v1`;
- `baseline`: the `excalidraw-js` commit from which the cascade starts;
- `capture`: external repository path, HEAD, branch, and dirty state;
- `crossCaseTransitions`: always empty in v1 because the cases are comparison
  snapshots, not one executable chain;
- `cases`: one entry per fixture with a file name, complete required fact-id
  list, and source/render provenance.

Each fixture has exactly:

- `schema`, `id`, and `title`;
- view-neutral `owners`;
- `stages` with owner, mode, dependencies, artifact reads/writes, and optional
  parallel-group membership;
- `parallelGroups`, `decisions` with separate producer and router,
  `artifacts`, `humanGates` with an optional initial state,
  `writeBoundaries`, and stable-id `invariants`.

Allowed owner kinds are `human`, `orchestrator`, `agent`, and
`artifact-store`. Allowed stage modes are `read-only`, `task-artifact-write`,
and `isolated-source-write`. Unknown fields, duplicate ids, dangling
references, manifest/file mismatches, invalid evidence grades, and cross-case
execution edges fail the integrity tests.

Evidence grades:

- `live-dirty-working-tree`: bytes existed in the dirty external checkout and
  have their own SHA-256; file state is `modified` or `untracked`.
- `claude-read-recovery`: text was recovered from a named read-only Claude
  session and tool call after the live file disappeared.
- `unavailable`: the referenced file was missing at freeze time; no hash or
  content claim is made.

## Case boundary

- `review` captures a blocked early exit, two parallel review lanes, a join
  requiring both, and conditional publication of an all-pending fix plan.
- `review-plan` is recovered text evidence. It captures immutable review input,
  refusal to overwrite an existing plan, exact finding coverage, and pending
  dispositions. Its legacy PNG and `.excalidraw` do not survive.
- `review-fix` captures accepted-only mutation in a distinct linked worktree,
  unchanged HEAD/no commit, independent verification, and unresolved findings
  preventing completion.

Current `review` can publish `fix-plan.md`; recovered `review-plan` refuses to
overwrite one. Consequently v1 intentionally declares no `review ->
review-plan` transition.

## Downstream use

- T-127 follows the cascade order but does not import this corpus.
- T-122 maps these facts into view-specific swimlane test specs.
- T-128 authors separate C4, sequence, and swimlane specs and compares new
  renders against the frozen facts. It cannot claim equality with the vanished
  review-plan render or fall back to live `locus-pi` paths.
