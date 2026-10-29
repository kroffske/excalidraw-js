---
title: Shared Graph Layout API
type: guide
status: active
updated: "2026-10-24T01:33:21Z"
source_commit: "e95521918f56"
update_event: "sync"
context: "changes=XL files=81 task=T-146/S4"
description: "Clarify local API availability, browser card measurement and executable authoring tour."
---

# Shared graph layout API

Use `@kroffske/excalidraw-diagrams/graph-layout` when integrating measured graph
objects with a renderer. It owns automatic placement, rectangular/diamond port
allocation, orthogonal routing, label placement, nested component/area geometry
and sequence participant/message/lifeline geometry. It
does not infer a system's meaning, select views, create an Excalidraw scene or
control a build. Authoring remains JavaScript/TypeScript, not raw scene JSON.

This is an opt-in integration API. Existing `diagram.flow`, strict templates,
`layout.*` and their scene-generation behavior are unchanged. The package's old
root entry remains Node-oriented; browser consumers import this subpath.

For the author-facing source exercise and exact field vocabulary, use the
[same executable tour](authoring.md#run-a-complete-source-example) as the other
guides. The snippets below target integrators who already own semantic admission.
They are not a universal authoring or view-selection layer.

## Node example

For a local tarball containing this API, install the exact optional engines only where automatic geometry is needed:

```sh
npm install /absolute/path/to/local-package.tgz @hpcc-js/wasm-graphviz@1.29.2 libavoid-js@0.5.0-beta.5
```

The new exports are currently part of the local migration source, not a claim
that the published 0.5.2 package contains them. Until a release, install a tarball
built from this checkout. The example below uses only the public package API:

```js
import { layoutGraph } from '@kroffske/excalidraw-diagrams/graph-layout';
import { createLayoutRuntime } from '@kroffske/excalidraw-diagrams/graph-layout/engines';

const request = {
  nodes: [
    { id: 'api', width: 320, height: 160, shape: 'rectangle' },
    { id: 'worker', width: 320, height: 160, shape: 'rectangle' },
  ],
  edges: [{ id: 'submit', from: 'api', to: 'worker', label: 'Submits order' }],
  direction: 'TB',
  defaultTopIds: ['api'],
  profile: {
    baseNodeGap: null, wideLabelCorridors: true, alignAdjacentRows: true,
    preferContentLabels: true, routeNudge: 64,
  },
  labelTypography: { fontSize: 20, lineHeight: 1.25, paddingX: 12, paddingY: 6 },
  fit: {
    viewport: { width: 1898, height: 909 }, minZoom: 0.1, maxZoom: 30,
    paddingFraction: 0.94, maxSideDrop: 0.2,
  },
};
const runtime = await createLayoutRuntime();
const geometry = layoutGraph(request, { runtime });
console.log(geometry.boxes.get('api'), geometry.edgeRoutes.get('submit'));
console.log(geometry.diagnostics);
```

Dimensions and typography are renderer inputs at this integration boundary.
An agent-facing application can measure its semantic cards before making the
request; this does not require its author to supply pixel positions. Labels
must already contain the exact admitted display text, including any conditions.

## Engine-free components and sequences

The one-argument `layoutComponent(request)` and `layoutSequence` are synchronous,
pure exports from the same browser-safe subpath. These calls need no engine
peers, initialization or WASM.
The caller resolves hierarchy and ordering before calling them; they never
infer ownership from node types, relationship labels or enclosing coordinates.
Both preserve input data and return Maps keyed by caller-supplied stable IDs.

```js
import { layoutComponent, layoutSequence } from '@kroffske/excalidraw-diagrams/graph-layout';

const component = layoutComponent({
  nodes: [
    { id: 'service', width: 320, height: 140, children: ['api', 'worker'] },
    { id: 'api', width: 260, height: 120, children: [] },
    { id: 'worker', width: 280, height: 140, children: [] },
  ],
  roots: ['service'],
  relations: [
    { id: 'owns-api', from: 'service', to: 'api', label: 'Contains', headerRail: true },
    { id: 'send', from: 'api', to: 'worker', label: 'Sends work', headerRail: false },
  ],
  direction: 'LR', labelFontSize: 18,
});
console.log(component.boxes.get('service'), component.edgeGeometry.get('send'));

const sequence = layoutSequence({
  participants: [
    { id: 'client', width: 260, height: 120 },
    { id: 'api', width: 280, height: 140 },
  ],
  messages: [
    { id: 'request', from: 'client', to: 'api', label: '1. Submit [accepted]' },
    { id: 'response', from: 'api', to: 'client', label: '2. Respond' },
  ],
  wrapLabels: true, labelFontSize: 18,
});
console.log(sequence.lifelines.get('api'), sequence.edgeGeometry.get('response'));
```

For components, `nodes` supplies each node's own measured size and explicit
ordered `children`; `roots` supplies the ordered roots of a complete forest.
Every node occurs exactly once in that forest. Sibling packing follows
`direction`, while separate roots stack vertically. The library reserves headers
and label corridors and expands containers around descendants. A relation's
`headerRail` selects the geometric rail from a container header toward a child;
it does not add or validate a semantic ownership relation. Relations do not
define the forest. Direct, self and reciprocal paths preserve the bounded
component convention; this is not an obstacle-avoiding router.

The component result has `boxes`, `containers`, `direction` and `edgeGeometry`.
Each edge geometry is `{x, y, points}`, with points relative to that origin.
Use node and edge IDs to associate geometry with the caller's original records.

For sequences, participant array order defines left-to-right placement and
message array order defines top-to-bottom execution. The library neither sorts
nor invents message numbers; supply exact display text, including numbering and
conditions. `wrapLabels: true` wraps that text between participant lifelines and
reserves enough vertical space. `false` retains the fixed-spacing, unwrapped
geometry used by older presentation profiles; the caller renders its admitted
label text. Self messages use a loop, and reverse messages retain their direction.

The sequence result has `boxes`, `direction: 'LR'`, `messageTop`, `messageGap`,
`messageLabels`, `lifelines` and `edgeGeometry`. Lifelines are `{x,y,width,height}`;
message geometry uses the same relative-point form as components. `messageLabels`
contains `{text,centerX}` only when wrapping is enabled. Presentation styles,
native scene IDs and endpoint bindings remain with the renderer adapter.

Both APIs reject duplicate/empty IDs, unknown endpoints, invalid dimensions or
options and non-finite calculated geometry. Components also reject incomplete,
repeated or cyclic forest membership. Empty inputs are valid. Failures are
`ComponentLayoutError` (`INVALID_LAYOUT_REQUEST`) or `SequenceLayoutError`
(`INVALID_SEQUENCE_LAYOUT_REQUEST`), with structured `diagnostics` containing
paths and applicable `nodeId`/`edgeId` subjects. They do not produce a partial scene or fall
back to an engine. Type declarations expose the complete request/result types.

## Opt-in routed component composition

`layoutComponent(request, { Avoid, measureHeader })` selects measured headers,
two-dimensional composition and obstacle-avoiding routes. Both options are
required. Supply an initialized `Avoid` from the existing engine provider;
the calculation itself does not use Graphviz. Importing the geometry API still
does not initialize peers or perform filesystem or DOM work. The one-argument
call retains its previous geometry and result shape.

```js
const routed = layoutComponent({
  nodes: [
    { id: 'service', width: 320, height: 96, children: ['api', 'worker'],
      composition: { row: ['api', 'worker'] } },
    { id: 'api', width: 260, height: 120, children: [] },
    { id: 'worker', width: 280, height: 140, children: [] },
  ],
  roots: ['service'], rootComposition: 'service',
  relations: [{ id: 'send', from: 'api', to: 'worker',
    label: 'Sends work [accepted]', headerRail: false }],
  direction: 'LR', labelFontSize: 18,
}, {
  Avoid: runtime.Avoid,
  measureHeader: (nodeId, boundaryWidth) => measureApplicationHeader(nodeId, boundaryWidth),
});
console.log(routed.headerBoxes.get('service'));
console.log(routed.edgeRoutes.get('send'), routed.messageLabels.get('send'));
```

`ComponentComposition` is an ID, `{row: [...]}` or `{column: [...]}`, recursively.
Each node's optional `composition` covers exactly its direct `children`;
`rootComposition` covers exactly `roots`. Rows run left to right, columns top
to bottom, with start alignment and no stretching. Unknown, repeated, missing
or indirect IDs, extra/mixed keys, empty groups, singleton wrappers and cyclic
or excessively deep groups fail before caller measurement. Omitted compositions
use their input order and `direction`. Forest membership remains explicit and
independent of relations; this API rejects `headerRail: true`.

The solver first measures children. An expanded node's full boundary width is
`max(320, childrenWidth + 64)`. It calls `measureHeader(id, boundaryWidth)` once
for that node, requiring a finite positive height. The header spans the boundary's
width at its top; children begin 32 units inside and 24 units below the header.
The bottom inset is 32. Row/column gaps are 160/112 units. These are placement
policy, not readability acceptance thresholds. Header content, typography and
semantic facts remain with the caller; leaf dimensions are preserved.

The result retains `boxes`, `containers`, `direction` and relative `edgeGeometry`,
and adds:

| Field | Contract |
| --- | --- |
| `headerBoxes` | Bindable header boxes for expanded nodes only, keyed by original node ID; `boxes` still contains their complete boundaries |
| `edgeRoutes` | One route per original edge ID, absolute orthogonal `points`, original `edge`, `sourceSide`, `targetSide`, exact `labelCenter` and `labelBox` |
| `messageLabels` | One `{text,width,height,center}` per original edge ID; render this exact display string and retain the caller's original text separately |
| `diagnostics` | An empty array for ordinary placement, or `COMPONENT_LABEL_RESERVATION` when the second routing pass was necessary |

Labels wrap before measurement/reservation using the supplied font size and existing
text measurement. Excalidraw 0.18.1 limits arrow text to `max(0.7 * arrow.width, 11 * fontSize)`;
the horizontal span can be zero, so component uses the guaranteed `11 * fontSize` floor.
Its text budget is `min(240, max(11 * fontSize - paddingX, 11 * fontSize / 2))`:
197 at font size 19 with paddingX 12. The second branch keeps the budget positive
for small/fractional font sizes. Padding is reservation space, not a native text inset;
allocation width can include padding/rounding beyond that native content floor.
Wrapping changes line breaks; it never deletes a condition or
word. The original relation string remains in `edgeRoutes.get(id).edge.label`.
Do not wrap `messageLabels.text` again in the renderer.

Only leaves and headers are solid routing obstacles. Transparent boundaries may
be crossed transversely, but routes cannot follow their strokes. Labels cannot
overlap a leaf/header, another label, a foreign route or a boundary stroke.
`placeRouteLabels` accepts optional `blockedSegments` for such transparent strokes;
its default is empty for other callers.

The solver runs the existing route-and-label pipeline first. Missing label space
triggers exactly one reservation pass for the complete label set, in stable
decreasing-area/ID order. At most 16384 grid candidates are inspected per label;
the grid becomes coarser for larger compositions. Candidates stay inside the
computed composition, prefer short and balanced endpoint distances and avoid
existing obstacles/strokes/labels. The canvas does not grow to force success.
`routeEdges` owns its internal `labelSlots` rectangles, fixed central left/right
label ports and route concatenation. No temporary node or edge identities enter
the returned result, and all libavoid resources are cleaned up on failure.

Each published label center is the native odd middle vertex through collinear
padding only, bounded by `2 * inputRouteVertices + 1`. A center within the existing
`1e-6` tolerance of its route uses the actual collinear projection consistently
in `labelCenter`, `messageLabels.center` and `labelBox`; the route is not bent
toward the requested center. Exact on-segment centers remain unchanged. Existing calls to
`excalidrawLabelPath` retain their default limit of 17. A longer padded path does
not establish that its real bends are readable; the consuming application still
needs visual and saved-scene verification.

No third pass or direct-line fallback exists. Missing reservation space gives
`ComponentLayoutError` with `LABEL_NO_SLOT`; an unsupported exact native anchor
gives `LABEL_ANCHOR_UNSUPPORTED`. Routing/port failures retain `RoutingError` and
its original edge/node subjects. Failure returns no partial layout. Saved-scene
admission and reopening remain the consumer's responsibility and should not rerun
this solver merely to validate a stored scene.

## Request and result

`layoutGraph(request, { runtime? })` is synchronous once the runtime is ready.
Its input is not mutated. Core imports perform no filesystem access, DOM access,
WASM initialization or engine download.

| Field | Contract |
| --- | --- |
| `nodes` | Unique IDs, finite positive width/height, explicit `rectangle` or `diamond` routing shape |
| `edges` | Unique IDs, existing `from`/`to` node IDs and exact `label`; identity is independent of display text |
| `constraints` | Normalized `{type:'row', ids, index}`, `{type:'place', node, place, index}` or `{type:'below'|'rightOf', node, other, index}`; `index` connects diagnostics to the caller's admitted hint |
| `defaultTopIds` | Caller-resolved preferences, overridden by applicable explicit constraints; no Person/external-system inference in the library |
| `positions` | Optional exact pins keyed by node ID; partial pins remain exact, complete pins bypass Graphviz |
| `routes` | Optional routes keyed by edge ID, with `sourceSide`, `targetSide`, and optional `{x,y}` waypoints; complete routes bypass libavoid |
| `areas` | Explicit presentation membership and optional parent, title and `{fontSize,lineHeight}` typography; enclosure does not create semantic containment |
| `profile` | Caller-selected spacing, corridor, alignment and routing policy; no family name is interpreted by the solver |
| `fit` | Explicit viewport/zoom/padding and side-placement budget; camera interaction and acceptance policy remain with the application |

The result includes `boxes`, `orderedEdges`, `edgeRoutes`, `areas`, compiled
constraints, diagnostics and an optional fit comparison. Geometry collections
are Maps keyed by stable IDs. Rejoin original semantic edge records by ID, not
by array position. `containers` remains empty on this automatic-layout route;
it does not represent a component containment solver.

Complete positions plus complete routes work without optional peers or runtime.
Missing automatic engines fail explicitly. Port capacity, degenerate routes,
constraint conflicts and the route point limit are refusals; `LABEL_NO_SLOT`
and fit warnings must remain visible. Fit states are `measured`, `unavailable`
or `unverified`; a pinned layout is not automatically a passed fit comparison.
Native label anchoring uses at most 17 route points. Inspect diagnostics before
accepting or publishing a generated scene.

Diagnostics carry `nodeId`, `edgeId` or `constraintIndex` for the applicable
subject. Paths escape ID segments as JSON Pointer (`~0` and `~1`); use the subject
fields instead of parsing a path to recover an identity. IDs may contain `/` or
`~` without breaking fallback label placement.

The core also exports the same common calculation owners for integrations:
`compileConstraints`, `routeEdges`, area/text/label helpers and fit predicates.
Use the emitted TypeScript declarations for their exact signatures. Callers own
semantic admission and translation; these helpers must not become a second
implementation of placement or routing in an application.
For direct `routeEdges` calls with nonempty edges, `options.nodes` must explicitly
declare one `{id, shape}` for every box. Missing, duplicate, foreign or unsupported
shapes fail before native routing; a diamond is never silently treated as a rectangle.

## Browser assets and initialization

Run preparation on Node during the application's build, using a **new** directory
whose parent exists:

```js
import { prepareLayoutAssets } from '@kroffske/excalidraw-diagrams/graph-layout/prepare-assets';
const prepared = await prepareLayoutAssets('public/layout-runtime');
console.log(prepared.assets);
```

The Node-only helper resolves the installed exact peers and copies
`libavoid.wasm`, `libavoid-js-LICENSE.txt` and `wasm-graphviz-LICENSE.txt`. It
refuses an existing destination or one overlapping an installed peer. The
application owns refreshing its generated deployment directory; do not copy
library-internal `node_modules` lookup rules into the application.

The browser imports the same engine subpath, whose conditional export selects
the browser implementation:

```js
import { createLayoutRuntime } from '@kroffske/excalidraw-diagrams/graph-layout/engines';
const runtime = await createLayoutRuntime({
  avoidWasmUrl: new URL('/layout-runtime/libavoid.wasm', location.href),
});
```

Supply an HTTP(S) URL on the page's own origin, adjusted for the application's
deployment base path. Redirects and cross-origin asset URLs are refused. There
is no default CDN or automatic download service. Node defaults to the installed
peer asset; its optional override accepts a filesystem path or file URL.

Before entering the pinned loader, the runtime checks the bytes, compiles the
WASM and checks required ABI exports. The browser fetches once and gives the
loader a temporary Blob URL for that validated snapshot; Node uses a temporary
file. Both snapshots are released after initialization. A strict browser CSP
must permit the local fetch, `blob:` loading and WebAssembly compilation.
This validation prevents ordinary missing/corrupt-asset failures; it is not an
authenticity check for untrusted binaries.

Matching concurrent calls share initialization. A failed attempt can be retried;
another source while initialization is pending or ready fails with
`LAYOUT_RUNTIME_CONFLICT`. A successfully initialized peer is realm-wide: use a
fresh process/page to change its source, and do not initialize `AvoidLib` behind
the package's back. Loading failures retain their cause. No fallback to a
different algorithm or engine occurs.

If engines are ready but snapshot cleanup fails, initialization reports
`LAYOUT_RUNTIME_CLEANUP_FAILED` and retains that ready state and cleanup owner.
A same-source retry retries cleanup without initializing the engines again;
it returns the same runtime after cleanup succeeds. A different source remains
a conflict. Cleanup errors are not silently relabelled as successful loading.

Graphviz's pinned package embeds WASM in its lazy JavaScript. Vite currently
also emits libavoid's unused default WASM copy alongside the prepared resource:
an additional 492,029 bytes before compression. Only the prepared resource is
fetched. This known build-size cost is not a second runtime request.

## Map integration and compatibility

Locus Map's adapter resolves model meaning, card measurements, labels, shapes,
initiator defaults and reader policy. This package owns the common automatic
semantic/decision geometry. Map rejoins the result to its original semantic
records and still owns official Excalidraw conversion, saved-scene admission,
view selection, staging, validation and publication.

Map also resolves containment, participant order, execution order and the current/
E2/pre-E2 presentation choice before calling the engine-free component/sequence
APIs. The library calculates their placement, relation paths, labels and lifelines;
Map keeps the source hierarchy and original ordered message records. Card measurement is already shared through the pure [`/card` entry](browser-cards.md);
Map still selects card contents and presentation. Authoring composition remains a separate API level. Existing saved
scenes are not regenerated on open. The unchanged
Stage 0 values remain the extraction comparator; updates are not accepted merely
because a new calculation produces a different result.

### Title-only component composition

`layoutComponent(request, options)` also supports an explicit `headerMode: 'title-only'`.
Without this discriminator, the existing legacy and routed full-width-header APIs
keep their behavior. `COMPACT_COMPONENT_LAYOUT_VERSION === 1` identifies the paired
compact implementation; consumers must refuse a missing capability rather than
silently treating the new request as the older layout.

The compact request uses the same ordered forest and bounded `row`/`column`
compositions. A relation may set `inline: true` to require a caption interface
between adjacent leaf branches with the same immediate owner. This is a placement
intent, not a promise of a straight arrow. Parent endpoints continue to identify
that parent's measured title. Parent/leaf loops retain real right/bottom pins;
service bands are presentation space, never additional nodes.

```ts
import { layoutComponent, COMPACT_COMPONENT_LAYOUT_VERSION }
  from '@kroffske/excalidraw-diagrams/graph-layout';

if (COMPACT_COMPONENT_LAYOUT_VERSION !== 1) throw new Error('Paired library required');
const result = layoutComponent(request, {
  headerMode: 'title-only',
  Avoid: runtime.Avoid,
  measureHeader: id => titleSizes.get(id)!,
  measureLabel: (id, authoredText) => measuredLabels.get(id)!,
  paint: {
    routes: routePaint, // every relation: { width: actualPaintedWidth, cap: 'round' }
    frames: framePaint, // every expanded ID: { width, cap: 'round' }
    nodes: nodePaint,   // every leaf/title ID: { outset: conservativePaintOutset }
    clearance: 4,
    pointError: { x: 0.005, y: 0.005 },
  },
});
```

Measurements are synchronous and called once per title/caption in the invocation.
`measureHeader(id)` returns only `{width,height}` for the complete title.
`measureLabel(id, authoredText)` returns `{text,width,height}`; only display reflow
may differ from the authored text. The shared `matchesTextReflow(visible, source)`
helper normalizes CRLF, permits one ASCII space to become a line break, and permits
inserted breaks at grapheme boundaries. It does not trim text, collapse repeated
spaces, replace tabs or remove authored breaks. The returned measured text is
published exactly; legacy `wrapText` behavior is unchanged.
Exact ID coverage, positive dimensions, round
stroke paint, nonnegative outsets/point errors and supported fields are checked
before routing. No renderer, application model or previously generated scene is
an input to the library. The caller owns conversion of its supported style and
anatomy into painted widths and node envelopes. Unknown paint is not zero.

The fresh flow uses an initial no-slot baseline and bounded path/grid caption
allocation. At most one affected-owner closure selects and reuses winning
composition layouts; there are at most `C * I` trials and `2 + C * I` total
materializations. A second baseline runs only after that closure. A reservation
route supplies typed raw legs for full-segment paint demand and structural
transport; one final route uses the derived paint pitch. Thus the maximum is
three routing phases without closure and four with closure. Each phase owns one
Router/transaction and releases all resources on success or failure. There is no
retry, additional grid after demand, viewport enlargement or fallback line.
The caller's existing worker timeout remains responsible for bounding synchronous
WASM execution.

Only a single straight node-to-caption leg establishes a structural alignment.
A coincident coordinate on a bent leg does not. Independent path and grid
reservations keep normalized owner-domain descriptors on unanchored axes; one
finite interval pass clamps free coordinates in their retained connected region.
Terminal and adjacent-support references cover finite end-cap constraints,
including a collinear horizontal companion of a vertical corner. Undefined order,
conflicting anchors, an empty interval or a repair requiring another pass is an
explicit refusal, not a partially accepted layout.

The result retains `boxes`, `headerBoxes`, `containers`, `direction`,
`edgeGeometry`, `edgeRoutes`, `messageLabels` and `diagnostics`. Expanded `boxes`
are the final unbound boundaries, and `headerBoxes` are their separate titles.
Allocation envelopes and temporary reservations are not scene or semantic nodes.
The `COMPONENT_COMPACT_RESOURCES` diagnostic contains numeric `counts` for QA;
it describes execution, not a user-facing quality warning. Saving/opening an
existing scene must not invoke this fresh producer.

### Shared finite paint geometry

`finiteStrokeClearance(first, second)` accepts two axis-aligned straight supports
`{points:[start,end],width,cap:'round'}` and returns exact `{distance,gap}`.
The distance includes finite end caps even when longitudinal projections touch
or do not overlap. A perpendicular X is classified separately by the caller.
Nonfinite/non-axis-aligned/unsupported paint is refused instead of returning a
clear result.

`strokeClearanceBudget(clearance, pointError)` returns:

- `pointErrorBudget = 2 * hypot(pointError.x, pointError.y)`;
- `requiredGap = clearance + pointErrorBudget`;
- `designGap = requiredGap + 1e-6`.

The compact pitch is maximum painted route width plus `designGap`. Source
admission requires the strict `requiredGap`, without subtracting a tolerance.
Actual SVG verification uses parsed supports, actual widths and zero point error;
its strict requested gap remains the supplied `clearance`. These helpers do not
claim a raster/SVG or reader result.

After non-frame gates pass, a single bottom-up finite frame-stroke completion may
move only unbound boundary sides inward within their allocation. It preserves
all title/leaf boxes, ports and caption centers. The caller-supplied node outsets,
own title and nested-frame paint must fit inside the parent's inner painted
boundary with source gap at least `pointErrorBudget`; design adds `1e-6`.
This containment gap is not the route-to-route clearance of four. Missing legal
intervals produce `NO_LEGAL_FRAME_STROKE`. Native conversion, actual painted
bounds/contacts, save/reopen, useful-viewer fit and readability remain caller QA.
