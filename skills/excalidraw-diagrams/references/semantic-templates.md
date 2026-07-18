# Strict Semantic Templates

Use these JSON templates when a weak/local model can state the diagram as facts
and the case fits the template exactly. The trusted package owns coordinates,
dimensions, styling, routing, text fitting, geometry checks, and scene output.

## Selection and precedence

| Question | Use the strict template when | Use the custom path when |
| --- | --- | --- |
| Which internal containers and dependencies exist? | Authoring a new fact-based internal Container view with 2-6 containers and at most 8 relationships: `c4.container`. | Converting existing C4/PlantUML, preserving external actors or custom breadth, or exceeding the strict schema: semantic redraw with `layout.*`. |
| What calls or returns happen, and in what order? | Input order plus `call`, `return`, and one optional note per message fully describe the interaction: `sequence.interaction`. | Concurrency, alternatives, loops, activation bars, or richer protocol semantics are load-bearing: custom layout or a more capable source format. |
| Who owns each activity and handoff? | A bounded acyclic workflow with 2-5 owner lanes fits the strict DAG limits: `flow.swimlane`. | The workflow needs cycles/retries, explicit phase bands, custom shapes, or exceeds a cap: custom `layout.*` composition or split views. |

Precedence is semantic, not visual: do not squeeze a case into a strict template
and then claim unsupported meaning. Existing source conversion goes to semantic
redraw even when its visible result resembles a strict template.

## Shared authoring contract

- Supply plain JSON objects containing only the fields listed below. Unknown
  root or nested fields fail validation.
- Every `id` matches `^[A-Za-z][A-Za-z0-9_-]{0,63}$`. IDs are unique across all
  entity collections in one document.
- Strings must be non-empty after trimming. Limits count the trimmed string.
- Never supply geometry such as `x`, `y`, `width`, `height`, `points`, or
  `ports`. Never supply raw styling such as `color`, `strokeColor`, `fillStyle`,
  or hex values such as `#1e3a8a`.
- Keep each diagram case-sized. Prefer one question, one reading order, and
  short labels. Split a view or use the custom path instead of weakening facts
  to fit a cap.

## `c4.container`: internal structure

Allowed fields and limits:

- Root: `template`, `title`, `system`, optional `relationships`.
- `title`: at most 80 characters.
- `system`: `id`, `name` (60), `description` (160), `containers`.
- Each container: `id`, `name` (60), `description` (160), `technology` (60),
  and optional exact `iconId`.
- `containers`: 2-6. `relationships`: 0-8, further bounded by unique unordered
  pairs: effective maximum `min(8, n * (n - 1) / 2)` for `n` containers.
- Each relationship: `id`, `from`, `to`, `description` (100), and optional
  `technology` (60). Endpoints reference container IDs.
- Self-links and duplicate or reverse unordered endpoint pairs are invalid.
  Choose the dominant direction; put a meaningful reverse interaction in
  annotation or another view.
- C4 strings are trimmed and length-limited; unlike sequence and swimlane, this
  v1 schema does not add a single-line-only check. Still use short phrases so
  the result stays readable.

Minimal valid JSON:

```json
{
  "template": "c4.container",
  "title": "Review runtime",
  "system": {
    "id": "review-system",
    "name": "Review system",
    "description": "Runs an internal code review workflow.",
    "containers": [
      {
        "id": "workflow",
        "name": "Trusted workflow",
        "description": "Coordinates review sessions.",
        "technology": "Node.js"
      },
      {
        "id": "artifacts",
        "name": "Task artifacts",
        "description": "Stores review evidence.",
        "technology": "Filesystem"
      }
    ]
  },
  "relationships": [
    {
      "id": "workflow-artifacts",
      "from": "workflow",
      "to": "artifacts",
      "description": "writes evidence"
    }
  ]
}
```

This view structurally supports internal containers and their directed
dependencies. Names, descriptions, technologies, people, gate state, timing,
parallelism, and call order are annotation or omitted facts, not native C4 v1
structure.

## `sequence.interaction`: ordered calls and returns

Allowed fields and limits:

- Root: `template`, `title`, `participants`, `messages`, optional `notes`.
- `title`: single-line, at most 80 characters.
- Participants: 2-6; fields `id`, `name` (single-line, 60).
- Messages: 1-12 in top-to-bottom semantic order; fields `id`, `from`, `to`,
  `label` (single-line, 100), and optional `kind`.
- `kind` is `call` or `return`; omitted `kind` defaults to `call`.
- Notes: 0-8; fields `id`, `message`, `text` (single-line, 160). A message can
  own at most one note.
- Message endpoints reference participant IDs. Self-messages are invalid.
  Repeated and reverse participant pairs are valid because message order is
  semantic.

Minimal valid JSON:

```json
{
  "template": "sequence.interaction",
  "title": "Review request",
  "participants": [
    { "id": "operator", "name": "Operator" },
    { "id": "workflow", "name": "Review workflow" }
  ],
  "messages": [
    {
      "id": "start",
      "from": "operator",
      "to": "workflow",
      "label": "start review"
    },
    {
      "id": "result",
      "from": "workflow",
      "to": "operator",
      "label": "return findings",
      "kind": "return"
    }
  ],
  "notes": [
    {
      "id": "evidence",
      "message": "result",
      "text": "Findings reference task evidence."
    }
  ]
}
```

This v1 view structurally supports participant endpoints, message array order,
and call/return kind. A note may mention concurrency, an alternative, or a
loop, but that is annotation only: never claim native concurrency, `alt`, or
`loop` semantics from this template.

## `flow.swimlane`: bounded owner-handoff DAG

Allowed fields and limits:

- Root: `template`, `title`, `lanes`, `activities`, `transitions`.
- `title`: single-line, at most 80 characters.
- Lanes: 2-5; fields `id`, `label` (single-line, 48). Every lane has at least
  one activity.
- Activities: 2-16; fields `id`, `lane`, `type`, `title` (single-line, 80).
  `type` is `step`, `decision`, or `artifact`.
- Transitions: 1-24; fields `id`, `from`, `to`, and optional `label`
  (single-line, 48). Directed endpoint pairs are unique; self-links are invalid.
- The activity graph must be acyclic. Longest-path depth is 0-6, and each
  `(lane, depth)` cell contains at most 3 activities.

Minimal valid JSON:

```json
{
  "template": "flow.swimlane",
  "title": "Review handoff",
  "lanes": [
    { "id": "agent", "label": "Agent" },
    { "id": "owner", "label": "Owner" }
  ],
  "activities": [
    {
      "id": "draft",
      "lane": "agent",
      "type": "artifact",
      "title": "Draft review"
    },
    {
      "id": "accept",
      "lane": "owner",
      "type": "decision",
      "title": "Accept review?"
    }
  ],
  "transitions": [
    {
      "id": "request-gate",
      "from": "draft",
      "to": "accept",
      "label": "request gate"
    }
  ]
}
```

This view structurally supports owner-lane membership, activity type, directed
handoffs, DAG reachability/depth, and fork/join topology. Activity and
transition array order only breaks layout/routing ties; it is not workflow
order evidence.

## Label density

Default to load-bearing labels. Label outcomes, gates, and material handoffs.
Omit a transition label when the source/target titles and arrow direction
already state the same fact. For C4, label each dependency with the carried
action or data. For sequence, every message label is required and should name
the interaction, not repeat participant names. Do not trade traceability for
fewer characters: labels stay short, but IDs and visible text must preserve the
fact a reviewer needs to locate.

## Trusted runner

Keep model output as JSON and execute it through the root API:

```js
import { readFileSync } from "node:fs";
import { buildDiagramSpec } from "@kroffske/excalidraw-diagrams";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("usage: node semantic-diagram.mjs spec.json out.excalidraw");
}

const spec = JSON.parse(readFileSync(inputPath, "utf8"));
const result = buildDiagramSpec(spec, { seed: 42 });
if (!result.ok) {
  throw new Error(JSON.stringify(result.diagnostics, null, 2));
}
result.scene.write(outputPath);
```

Run `node semantic-diagram.mjs spec.json out.excalidraw`. Rendering PNG is a
separate caller decision.

## Validate, repair, or fall back

1. Run `buildDiagramSpec` with a fixed seed. Success requires schema validation
   and clean geometry; a failed result has diagnostics and no partial scene.
2. Return only each diagnostic's `code`, `path`, `message`, and optional `hint`
   to the authoring model. Ask it to rewrite the JSON at those paths.
3. Retry at most twice with the same facts and seed. Never silently invent or
   delete entities, reverse endpoints, change `kind`/`type`, truncate meaning,
   or add unknown fields to make validation green.
4. If the same semantic limit remains, use the honest fallback: split the case
   or switch to the custom path named in the selection table. A cycle,
   concurrency/alternative/loop requirement, explicit phase structure, or an
   over-cap case is a view-selection failure, not geometry to patch.

After success, inspect the rendered image for readable scale, clear reading
order, clipped text, arrow-through-card collisions, and whether the visual
grammar matches the intended question. Validation proves the compiler contract;
it does not prove every diagram claim.

## Evidence and editability boundary

These rules are supported by direct review of three agent-workflow cases across
the three templates. That evidence supports case-sized view selection and
authoring guidance. It does not establish a general weak-model benchmark, pixel
superiority, lossless conversion, or universal workflow coverage.

All three outputs contain ordinary individually editable Excalidraw elements.
Only `flow.swimlane` currently emits native bound connectors that follow moved
endpoints. C4 and sequence arrows are editable but intentionally unbound; do not
describe all three templates as equally move-safe.
