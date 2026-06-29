export const meta = {
  name: 'weak-llm-improve',
  description: 'One weak-LLM prompt-improvement iteration: triad diagnose -> apply -> review, or triad before/after verdict',
  whenToUse: 'Run after the orchestrator has produced visual scorecards for an eval pass. mode="diagnose" proposes+applies+reviews a skill edit; mode="verdict" compares before/after scorecards and recommends commit or rollback.',
  phases: [
    { title: 'Generate', detail: 'codex + opus each propose an edit / verdict' },
    { title: 'Synthesize', detail: 'opus merges the two variants' },
    { title: 'Apply', detail: 'single agent edits the skill files (diagnose only)' },
    { title: 'Review', detail: 'single agent reviews the applied edit (diagnose only)' },
  ],
}

// args:
//   mode: 'diagnose' | 'verdict'
//   iteration: number
//   targetFiles: string[]               // skill files the loop may edit
//   scorecards: object[]                // before-scorecards (vetted by orchestrator)
//   scorecardsAfter?: object[]          // after-scorecards (verdict mode)
//   knownIssues?: string[]              // recurring medium issues to attack

const mode = args?.mode ?? 'diagnose'
const iteration = args?.iteration ?? 1
const targetFiles = args?.targetFiles ?? [
  'skills/plan-excalidraw-weak-llm/SKILL.md',
  'skills/plan-excalidraw-weak-llm/references/layout-reasoning.md',
]
const before = JSON.stringify(args?.scorecards ?? [], null, 2)
const after = JSON.stringify(args?.scorecardsAfter ?? [], null, 2)
const knownIssues = (args?.knownIssues ?? []).map((s) => `- ${s}`).join('\n') || '- (none provided)'
const fileList = targetFiles.map((f) => `- ${f}`).join('\n')

const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rationale: { type: 'string' },
    topIssues: { type: 'array', items: { type: 'string' } },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string' },
          intent: { type: 'string' },
          guidance: { type: 'string' },
        },
        required: ['file', 'intent', 'guidance'],
      },
    },
    expectedEffect: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['rationale', 'topIssues', 'changes', 'expectedEffect'],
}

const APPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    applied: { type: 'boolean' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    diffStat: { type: 'string' },
  },
  required: ['applied', 'filesChanged', 'summary'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    notes: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    contractRespected: { type: 'boolean' },
  },
  required: ['ok', 'notes', 'contractRespected'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['better', 'worse', 'same'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    rationale: { type: 'string' },
    recommend: { type: 'string', enum: ['commit', 'rollback'] },
    perScenario: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'confidence', 'rationale', 'recommend'],
}

const CONTRACT = `Hard rules the weak-model lane must keep (do not weaken these):
- The model authors a NAMED GRAPH with node(id,title,iconId,bullets), section(title,group), connect(edgeId,from,to,label). It never writes raw Excalidraw JSON, Scene, coordinates, gaps, sizes, or numeric indexes.
- The RUNNER owns geometry and routing: section positions, card sizing, icon-id validation, edge ports, outer-lane routing, overlap and arrow-through-block checks.
- A layered map uses one top-level layout.row(...) per section, never one parent row wrapping all sections.
The loop may only improve GUIDANCE that helps the weak model pick better row order, drop noisy optional edges, keep labels short, and reduce long diagonal / border-hugging routes. It must not move geometry responsibility onto the model.`

if (mode === 'verdict') {
  phase('Generate')
  const legs = await parallel([
    () => agent(
      `You are the STRUCTURED evaluator (codex). Compare two weak-LLM diagram eval passes.

Known recurring issues being attacked this iteration:
${knownIssues}

BEFORE scorecards (JSON):
${before}

AFTER scorecards (JSON):
${after}

Judge strictly on measurable signal: validation.ok, attempts (fewer is better), counts of hard failures and medium issues across all combos, and whether any combo regressed from pass to fail. A change that increases hard failures or breaks validation is WORSE even if some notes improved. Be skeptical; default to "same" if the deltas are within noise.

Return your verdict.`,
      { label: 'verdict:codex', phase: 'Generate', agentType: 'codex', schema: VERDICT_SCHEMA },
    ),
    () => agent(
      `You are the SEMANTIC evaluator (opus). Compare two weak-LLM diagram eval passes on readability quality.

Known recurring issues being attacked this iteration:
${knownIssues}

BEFORE scorecards (JSON):
${before}

AFTER scorecards (JSON):
${after}

Judge whether the AFTER diagrams tell their layout thesis more clearly: fewer long diagonals, fewer border-hugging routes, labels not crowding lines, optional edges pruned rather than drawn. Weigh the orchestrator's per-PNG notes. Do not reward cosmetic churn. Default to "same" if improvements are marginal or traded against new problems.

Return your verdict.`,
      { label: 'verdict:opus', phase: 'Generate', schema: VERDICT_SCHEMA },
    ),
  ])
  const valid = legs.filter(Boolean)

  phase('Synthesize')
  const final = await agent(
    `You are the SYNTHESIZER (opus, LLM-chat role). Two evaluators judged whether a weak-LLM prompt change improved diagram quality. Produce the single authoritative verdict.

Structured (codex) verdict:
${JSON.stringify(valid[0] ?? null, null, 2)}

Semantic (opus) verdict:
${JSON.stringify(valid[1] ?? null, null, 2)}

Rules:
- recommend "commit" ONLY if the change is at least "better" with medium+ confidence AND no combo regressed validation or gained a hard failure.
- If the two evaluators disagree, prefer the more conservative call (a regression flagged by either side blocks commit).
- recommend "rollback" for "worse" or for "same" with no clear win.

BEFORE scorecards:
${before}

AFTER scorecards:
${after}

Return the final verdict.`,
    { label: 'verdict:synth', phase: 'Synthesize', schema: VERDICT_SCHEMA },
  )
  return { mode, iteration, legs: valid, final }
}

// mode === 'diagnose'
phase('Generate')
const proposals = await parallel([
  () => agent(
    `You are the STRUCTURED proposer (codex) for iteration ${iteration} of the weak-LLM diagram prompt loop.

${CONTRACT}

Files you may propose to edit:
${fileList}

Read those files. Then read these visual scorecards (produced by the orchestrator from the rendered PNGs; trust them as ground truth):
${before}

Recurring issues to attack:
${knownIssues}

Propose ONE focused, low-risk edit set that gives the weak model crisper, more checkable RULES (ordering heuristics, explicit "omit this edge when..." conditions, label-length limits, anti-diagonal guidance). Favor precise, testable instructions over prose. Keep the diagram contract intact. Do not rewrite whole files; target specific additions/refinements.

This is a real task, not a drill. Never return placeholder values ("test", "x", "y", "z", "one"/"two"/"three"). Every field must be your actual analysis, and every change.guidance must tie to a concrete issue seen in the scorecards above (name the scenario/issue it addresses). If you genuinely find nothing worth changing, return a single change explaining why and what you checked.`,
    { label: 'diagnose:codex', phase: 'Generate', agentType: 'codex', schema: PROPOSAL_SCHEMA },
  ),
  () => agent(
    `You are the SEMANTIC proposer (opus) for iteration ${iteration} of the weak-LLM diagram prompt loop.

${CONTRACT}

Files you may propose to edit:
${fileList}

Read those files. Then read these visual scorecards (produced by the orchestrator from the rendered PNGs; trust them as ground truth):
${before}

Recurring issues to attack:
${knownIssues}

Propose ONE focused edit set that improves how clearly the guidance teaches a weak model to think as a graph designer: better worked examples, sharper wording on row ordering and optional-edge omission, and concrete phrasing the model can imitate. Keep the diagram contract intact. Do not rewrite whole files; target specific additions/refinements.

This is a real task, not a drill. Never return placeholder values ("test", "x", "y", "z", "one"/"two"/"three"). Every field must be your actual analysis, and every change.guidance must tie to a concrete issue seen in the scorecards above (name the scenario/issue it addresses). If you genuinely find nothing worth changing, return a single change explaining why and what you checked.`,
    { label: 'diagnose:opus', phase: 'Generate', schema: PROPOSAL_SCHEMA },
  ),
])
const validProposals = proposals.filter(Boolean)

phase('Synthesize')
const directive = await agent(
  `You are the SYNTHESIZER (opus, LLM-chat role) for iteration ${iteration}. Merge two proposals into ONE final edit directive that the apply agent will execute.

${CONTRACT}

Structured (codex) proposal:
${JSON.stringify(validProposals[0] ?? null, null, 2)}

Semantic (opus) proposal:
${JSON.stringify(validProposals[1] ?? null, null, 2)}

Produce a single, bounded directive: keep the best of both, drop redundancy, ensure the change is small enough to evaluate in one eval pass and cannot weaken the contract. Each change entry must name a real target file from:
${fileList}
and give concrete enough guidance that an editor can apply it precisely.`,
  { label: 'diagnose:synth', phase: 'Synthesize', schema: PROPOSAL_SCHEMA },
)

phase('Apply')
const applied = await agent(
  `You are the APPLY agent (single executor, semantic edit -> opus). Apply this edit directive to the repo using the Edit/Write tools.

Directive (JSON):
${JSON.stringify(directive, null, 2)}

Allowed files (edit ONLY these):
${fileList}

Rules:
- Apply ONLY the changes listed in the directive's \`changes\` array. Realize each change's \`guidance\` faithfully and nothing more.
- Do NOT author new sections, procedures, worked examples, or rules that the directive did not ask for. Do not "improve" beyond the directive — extra unrequested content breaks the loop's single-variable measurement even when it looks helpful. If the directive's anchor text does not exist verbatim, insert the minimal anchor the guidance needs and say so in summary; do not invent surrounding content.
- Preserve all existing sections and the diagram contract; only add/refine the guidance the directive names.
- Do not touch any file outside the allowed list. Do not edit runner code, src/, or tests.
- After editing, run \`git --no-pager diff --stat -- ${targetFiles.join(' ')}\` and include the output in diffStat.
Return what you changed.`,
  { label: 'apply', phase: 'Apply', schema: APPLY_SCHEMA },
)

phase('Review')
const review = await agent(
  `You are the REVIEW agent (single reviewer). The apply agent edited weak-LLM lane skill files for iteration ${iteration}.

${CONTRACT}

Directive that was supposed to be applied (JSON):
${JSON.stringify(directive, null, 2)}

Run \`git --no-pager diff -- ${targetFiles.join(' ')}\` and read the actual change. Verify:
- the edit faithfully realizes the directive,
- no existing critical guidance or worked example was deleted,
- the diagram contract is intact (no geometry responsibility pushed to the model, no raw-JSON/coords/index allowances introduced),
- the markdown is well-formed.
Set ok=false if any of these fail. Be concrete in notes.`,
  { label: 'review', phase: 'Review', schema: REVIEW_SCHEMA },
)

return { mode, iteration, proposals: validProposals, directive, applied, review }
