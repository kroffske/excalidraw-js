# Map layout migration baseline

`baseline.json` is a retained value record from the current Locus Map pipeline.
It is evidence for the accepted extraction into Excalidraw JS, not an alternative
layout implementation. Each case retains its input, source paths, recipe,
ordered geometry, diagnostics, repeated-run equality and input-preservation check.
The provenance records the Map revision, dirty working-tree caveat and installed
runtime/engine versions. No digest pins are used.

From the Excalidraw JS repository, check an explicit Map checkout:

```sh
node scripts/layout-migration/baseline.mjs --map-root /absolute/path/to/locus-map
npm test -- tests/map-layout-baseline.test.ts
```

The first command executes real Map code and requires its existing local
dependencies. The unit tests use only the retained JSON and local baseline tool;
they do not load Map or WASM. The tool has no implicit Map path.

The default operation compares exact semantic/geometry values and array order.
Differences include readable paths, expected values and actual values. Source
revision/dirty-state changes are reported separately; they do not replace value
comparison. Engine versions and the declared quality policy are compared.
Node/platform versions are provenance, not portability claims or rejection gates.

Create a new candidate in a new location when deliberately reviewing a changed
baseline; `--create` refuses any existing destination:

```sh
node scripts/layout-migration/baseline.mjs --map-root /absolute/path/to/locus-map \
  --create --baseline /absolute/path/to/new-candidate.json
```

The 18 cases cover four layout families, the retained Algo automatic layout,
partial/complete pins, complete authored routes without engines, nested DSL
areas, all three side-fit states, automatic-error versus pinned-warning severity,
missing engines, conflicting hints, port capacity, authored-waypoint admission,
and the actual pipeline `ROUTE_POINT_LIMIT` refusal. The retained explicit scene
also has an existing `LABEL_NO_SLOT`; it is preserved as an expected diagnostic,
not hidden or reclassified as clean geometry.

Layout records retain node boxes, ordered edge identities/direction, containers,
ports, route points, label boxes/anchors, constraints, sequence message geometry,
diagnostics and fit comparisons. Skeleton records retain paint order, shapes,
areas, node-owned visible text tiers, lifelines, native arrow endpoints and labels.
Node text records include positions, bounds, displayed/original text and font
metrics, so wrapping or heading movement is detectable even when card bounds
stay unchanged. Glyph paths and styling are outside this baseline.
The reference-unavailable case injects a failure only
into the reference Graphviz request; actual placement and routing use the real
engines. That case captures layout rather than running a second skeleton pass.

These Node checks prove the retained pipeline values. They do not prove official
conversion, browser rendering, PNG output or visual quality. Existing Map cold
saved-scene checks are recorded separately in the Stage 0 execution report.
