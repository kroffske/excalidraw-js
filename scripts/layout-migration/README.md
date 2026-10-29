# Shared-layout migration checks

## Stages 1–2: the real package and Map consumer

Stages 1–2 use the public `graph-layout` package entry, not the private Stage 0
prototype. Stage 2 adds engine-free component/sequence geometry. First build the
library and install its paired files into Map:

```sh
npm run build
# In the paired locus-map checkout:
npm ci --ignore-scripts --no-audit --no-fund
```

Map's `.npmrc` keeps the local file dependency installed as packed files, not a
symlink. Repeat `npm ci` after a library build; ordinary `npm install` may keep
the old copy when the package version is unchanged. External delivery must
replace that local dependency with the future released library version.

From the library checkout, run with fresh output directories:

```sh
node scripts/layout-migration/verify-installed.mjs --output .local/layout-migration-stage2/installed/my-run
node scripts/layout-migration/verify-map.mjs --map-root /absolute/path/to/locus-map --output .local/layout-migration-stage2/map-my-run
```

The installed check builds a tarball and tests clean Node/Vite consumers with
and without optional peers. It executes real placement/routing, same-page WASM
failure/retry, explicit engine-free geometry, lifecycle failures, notice copying
and Node/browser value equality. See [its guide](installed/README.md).
The same cold Node/production-browser consumers execute nested components and
wrapped/unwrapped sequences with all engine imports and WASM calls refused,
including a clean installation where neither optional peer exists. Stage 1
output roots remain supported for historical reproduction; use new Stage 2
directories for current evidence rather than overwriting earlier runs.

The Map check runs the library tests/typecheck, unchanged Stage 0 value
comparisons in the current Node and Node 20.20.2, Map's full default tests/build,
and four real official-browser pages. The dedicated component/sequence page
blocks engine resources and WebAssembly while exercising actual conversion,
restore, SVG/PNG and current/legacy saved manual edits. It saves screenshots and exact command
logs. Default Map tests contain environment skips; the separate browser pages
provide renderer evidence rather than relabelling those skipped tests as passes.
The checker uses an already installed Playwright/Chromium runtime; Node 20 can
be acquired into npm's local execution cache. No global installation occurs.

## Retained Stage 0 checks

These checkout-only tools retain current Locus Map behavior and test the
installed-runtime boundary before moving the implementation into Excalidraw JS.
They do not add a production graph-layout API or change Map's active renderer.
The ordinary package manifest and exports are unchanged.

## Check retained behavior

From the Excalidraw JS repository root:

```sh
node scripts/layout-migration/baseline.mjs --map-root /absolute/path/to/locus-map
npm test -- tests/map-layout-baseline.test.ts
```

The first command runs the real Map pipeline twice with frozen cloned inputs
and compares readable semantic, geometry and diagnostic values against the
retained fixture. Supply a Map checkout with its existing dependencies installed;
there is no implicit checkout path. The focused unit tests need neither Map nor
WASM. Normal checks never regenerate expected values.

See the [baseline guide](../../tests/fixtures/map-layout-migration/README.md)
for the 18-case coverage, provenance and explicit candidate-creation command.
The baseline includes node text positions/wrapping, not merely card bounds.
Known warnings are retained rather than relabelled as clean layouts. This is
not a whole-scene screenshot or a claim about visual quality.

## Check installed Node/browser/WASM operation

Choose a new output directory for every run:

```sh
node scripts/layout-migration/probe-installed.mjs --output .local/layout-migration-stage0/package/my-run
```

The runner packs the current checkout, installs the tarball in a clean temporary
consumer and exercises its public Node API. It records the known current root
entry's Vite browser build failure from Node builtin imports. Separately, it
packs a private feasibility prototype and verifies actual Graphviz placement
and libavoid routing in Node and a browser serving the Vite production output.
Node and browser computation results must agree.

The prototype's pure entry works without the optional engine peers. Explicit
initialization loads the engines; browser WASM comes from a prepared deployment
asset over loopback HTTP, with upstream notices preserved. Neither npm link,
checkout-relative runtime URLs, CDN delivery nor stubbed engines establish this
result. The prototype is **not** a capability of the current published package.

Requires Node 24 for cold-import instrumentation, npm network/cache access,
and an already installed Playwright/Chromium runtime. See the
[installed probe guide](probe/README.md) for the runtime override and details.
No browser is downloaded. Runs preserve temporary consumers, logs, lockfiles,
tarballs and production output; an existing evidence directory is refused.
Browser operations have a 30-second deadline and close their browser/server
resources on failure. The complete runner also executes an artificial
never-settling browser operation with a short deadline to check cancellation
and cleanup. That negative check is not a WASM failure-recovery guarantee.

## Evidence boundaries and next step

- Current package: Node operation is verified; the root browser import remains
  unsupported. The migration needs a separate browser-safe entry.
- Prototype: installed runtime and local WASM delivery are demonstrated, not
  production algorithm parity, a stable public API or a release.
- The pinned Graphviz distribution embeds WASM in JavaScript. Vite also emits
  an unused duplicate libavoid WASM file (492,029 bytes) alongside the prepared
  copy. Only the prepared copy is fetched; eliminating the extra output is
  separate implementation work.
- Missing peers and retry after that failure are checked. Missing-WASM HTTP
  recovery and the complete runtime/resource failure lifecycle are not implied.
- Node 20, other package managers/bundlers, other browsers and deployment base
  paths remain unverified by this probe.
- Saved-scene admission, official renderer output and authoring/build ordering
  require their real Map checks; retained Node geometry is not their substitute.

These are the historical Stage 0 feasibility boundaries. Stage 1 checks above
exercise the real implementation and Map adapter against the retained values.
Do not infer Stage 1 acceptance from a historical Stage 0 pass, or regenerate
the expected fixture to make a changed calculation pass.
