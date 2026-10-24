# DSL lexicon

Shared vocabulary for the package's model-facing surfaces. Contract P14
([flow.band contract](flow-band/flow-band-contract.md)) requires **one term per
concept**: input names come from the diagram genre, not from geometry.

This is an executable documentation artifact as well as a reference.
`tests/dsl-lexicon.test.ts` (A12) compares these tables with field and enum lists
in code. New fields or values require a row here in the same change.

Row format: `term | concept | surfaces`.
Surface lists illustrate usage; the strict schema reference defines exhaustive
field eligibility. In particular, status support is explicitly limited below.

## 1. Input specification fields

| Term | Concept | Surfaces |
|---|---|---|
| `template` | template name used to dispatch the build | `flow.band`, `flow.swimlane`, `sequence.interaction`, C4 |
| `title` | heading of a diagram or card | root, `nodes[]`, `activities[]` |
| `subtitle` | diagram subheading, one line below `title` | `flow.band` root |
| `palette` | named color scheme | all templates |
| `legend` | automatic legend mode: `auto` \| `none` | `flow.band` root |
| `layout` | container of author-controlled layout settings | `flow.band` root |
| `lanes` | horizontal responsibility lanes | `flow.band`, `flow.swimlane` |
| `stages` | vertical process stages (columns) | `flow.band` |
| `nodes` | diagram entities (genre-specific names, see §4) | `flow.band` |
| `edges` | relationships between entities (genre-specific names, see §4) | `flow.band` |
| `id` | stable entity identifier used by all references | all templates |
| `label` | short caption on an entity or relationship | `lanes[]`, `stages[]`, `edges[]` |
| `sublabel` | second line of a lane caption | `flow.band` `lanes[]` |
| `lane` | reference to `lanes[].id` | `nodes[]`, `activities[]` |
| `stage` | reference to `stages[].id` | `nodes[]` |
| `type` | **entity** archetype | `nodes[]`, `activities[]` |
| `kind` | **relationship** category | `edges[]`, message `kind` |
| `from` | source entity ID of a relationship | `edges[]`, `transitions[]` |
| `to` | target entity ID of a relationship | `edges[]`, `transitions[]` |
| `status` | semantic state annotation on a supported entity or relationship | C4 containers/relationships; sequence participants/messages; swimlane activities/transitions; band nodes only, not band edges |
| `icon` | asset-pack icon name | `nodes[]` |
| `details` | additional lines inside a card | `nodes[]` |
| `maxBandWidth` | maximum width of one wrapped band in pixels | `flow.band` `layout` |

`title` and `label` name different concepts: a diagram/card heading versus a
short caption on an entity or arrow. They do not violate the one-term rule.

### Declared exception to the field-name restriction

The geometry-name restriction for input fields
(`index|idx|pos|order|offset|^x$|^y$|width|height`) has **exactly one** exception:

| Term | Reason for the exception |
|---|---|
| `layout.maxBandWidth` | The only author-supplied pixel quantity is the medium budget (page, slide, screen), not an entity coordinate. Contract S12/E4. |

Add any new exception to this table in the same change as the field.

## 2. Enum values

| Term | Concept | Surfaces |
|---|---|---|
| `actor` | participant external to the system | `nodes[].type` |
| `agent` | agent or executor session | `nodes[].type` |
| `artifact` | file or record produced by work | `nodes[].type` |
| `decision` | branching point | `nodes[].type`, `activities[].type` |
| `step` | ordinary process step | `nodes[].type`, `activities[].type` |
| `primary` | main control flow | `edges[].kind` |
| `provenance` | evidence of origin, not control flow | `edges[].kind` |
| `feedback` | feedback relationship permitting a backward edge in a cycle | `edges[].kind` |
| `added` | supported entity or relationship was added | `status` |
| `changed` | supported entity or relationship was changed | `status` |
| `removed` | supported entity or relationship was removed | `status` |
| `risk` | supported entity or relationship is marked as risky | `status` |
| `auto` | engine constructs the legend | `legend` |
| `none` | no legend | `legend` |

## 3. Result and diagnostic terms

| Term | Concept | Surfaces |
|---|---|---|
| `band` | one portion of the process after engine-managed wrapping | `metadata.bands[]`, `maxBandWidth`, `BAND_COUNT_EXCEEDED` |
| `metadata` | machine-readable description of the generated scene | build result |
| `diagnostics` | build findings | build result |
| `severity` | finding level: `error` \| `warning` | `diagnostics[]` |
| `code` | stable finding code (SCREAMING_SNAKE for specification diagnostics) | `diagnostics[]` |
| `path` | JSON path into the specification, such as `$.nodes[3]` | `diagnostics[]` |
| `hint` | action the author can take in response to a finding | `diagnostics[]` |
| `geometry` | geometry self-validation result | build result |

`band` is the only coined concept introduced by the template name; it has the
same meaning across all surfaces (P14).

A diagnostic `path` addresses the **author's specification**, not a geometric
position. Its array index points to authored source and does not violate the ban
on numeric entity references.

## 4. Genre-specific names across templates

A concept may have different names **across templates** when each name follows
its genre's convention. This is the naming policy, not a measured claim about
model performance.

| Concept | `flow.band` | `flow.swimlane` | `sequence.interaction` |
|---|---|---|---|
| diagram entity | `nodes` | `activities` | `participants` |
| relationship | `edges` | `transitions` | `messages` |

Synonyms within one template are not allowed.
