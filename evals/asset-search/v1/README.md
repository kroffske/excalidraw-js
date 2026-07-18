# Asset search evaluation v1

Run `npm run benchmark:asset-search` after building the package. The runner
writes `current/report.json`, `current/report.md`, and
`current/catalog-snapshot.json`.

The first run records the immutable first-scored catalog in
`baseline-catalog.json`. Later runs compare against that baseline and list each
changed pack-qualified id and top-level descriptor field; rerunning cannot
erase the diff by replacing the current snapshot. Use `--baseline FILE` to
compare against another retained snapshot.

The v1 compatibility manifests under
`catalog-review/assets/v1/baseline/` are immutable benchmark input. Catalog
generation reads and verifies them but never rewrites them.

Machine-specific latency results apply only to the environment hash recorded in
the report. The retrieval claims apply only to the frozen 48-query fixture.
