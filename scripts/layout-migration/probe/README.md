# Stage 0 installed-package feasibility

Run from the repository root with a **new** evidence directory:

```sh
node scripts/layout-migration/probe-installed.mjs --output .local/layout-migration-stage0/package/my-run
```

The runner prepares and packs the current repository, installs that tarball in
a clean temporary consumer, executes its public Node API, and records the
current root entry's expected Vite browser build failure. It separately packs
the private `package/` prototype and installs it in independent consumers with
and without the exact optional peers used by Map. The core-only production
browser build is also executed without either optional peer. Nothing is published.

The prototype is a packaging experiment, **not an implemented public feature**.
Its `graph-layout` entry is pure and its engine entry imports Graphviz and
libavoid only on an explicit call. A Node-only preparation entry resolves the
installed public peer entries, checks their versions, and copies libavoid's
unexported WASM and both upstream license texts to a caller-selected new
deployment directory. A repeated destination is refused before any copy.
The browser receives that deployment URL; it never receives a checkout path.

Actual engine checks cover Graphviz left-to-right placement and orthogonal
libavoid routing around a blocking rectangle, including finite outputs,
direction, endpoints, obstacle avoidance, and Node/browser equality. The browser
serves the Vite production output over loopback HTTP and records cold requests,
runtime requests, responses, WASM bytes, computation results, and a screenshot.
This checks distribution feasibility, not Map layout parity or visual quality.
Browser operations have a 30-second deadline and always close their browser and
HTTP server, including after failure. The runner also checks a deliberately
never-settling browser operation against a shorter deadline and verifies cleanup.
That artificial timeout check does not test missing-WASM recovery.

To run only the timeout/cleanup regression check:

```sh
node scripts/layout-migration/probe/deadline-check.mjs
```

Requires npm/network or a warm cache for isolated local installs, Node 24 for
the probe's `registerHooks` cold-import instrumentation, and an existing
Playwright/Chromium runtime. The runtime is discovered at the bundled Codex
dependency path. Set `LAYOUT_PROBE_PLAYWRIGHT` to an existing Playwright module
directory when using a different installed runtime. No browser is downloaded.

The runner preserves the clean temporary consumers and records their path.
Logs, tarballs, lockfiles, production output, and browser evidence go to the
requested directory. Existing evidence is never overwritten. The prototype is
not added to this repository's production manifest, exports, or build.

Known distribution cost: Vite also emits libavoid's own default WASM URL even
when the explicit deployment URL is used. The browser fetches one WASM copy,
but this prototype retains both copies in production output. Engine JavaScript
is lazy; Graphviz's pinned distribution embeds its WASM in JavaScript.
