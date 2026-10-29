# Installed Stage 2 acceptance

Run from the library checkout after the geometry and runtime sources compile:

```sh
node scripts/layout-migration/verify-installed.mjs --output .local/layout-migration-stage2/installed/run-01
```

The destination must be new and under the Stage 1 or Stage 2 installed-evidence
directory. Results identify the current Stage 2 checks and retained Stage 1
runtime/failure coverage. The checker runs the real `prepack`, packs the actual
library, and installs the tarball into fresh temporary Node/Vite projects. Engine
peers are explicitly absent in one project and installed at their supported exact
versions in the other. It uses bundled Playwright and an existing Chromium; set
`LAYOUT_PROBE_PLAYWRIGHT` to another installed Playwright module if needed. It does
not download a browser, use `npm link`, or publish anything.

The same neutral requests call the public `graph-layout` export in Node and the
production Vite output. Assertions cover engine-free cold imports, complete pins
and manual routes, real Graphviz placement and Avoid routing, ordered geometry,
labels, diagnostics, fit state, input preservation, and exact Node/browser values.
Stage 2 cases call `layoutComponent` and `layoutSequence` before runtime imports.
Frozen requests and exact numeric expectations distinguish nested/root/child
order, LR/TB placement, current/legacy label spacing, header rails, self/reverse
relations, participant/message order, wrapped labels, tie-breaking between label
corridors, message rows and lifeline lengths. The tarball must include both
geometry modules and their declarations. Both clean projects run a cold Node
process with engine-import refusal and fetch/WebAssembly initialization guards;
production browser chunks are inspected and cold effects must remain empty.
Real routers and owned Avoid values are counted on success and router, shape,
connector, configuration, transaction and extraction failures. Failure injection keeps the actual engines
and checks error causes, cleanup and recovery through the public runtime option.

The prepared asset comes from the installed peer. Node checks missing and invalid
files, temporary snapshot cleanup, shared initialization and conflicting sources.
One browser page checks URL refusals, real HTTP 404, invalid bytes, an incompatible
WASM ABI, then successful retry and reuse. It checks one local HTTP acquisition,
Blob URL release, no external requests, no unhandled errors, and deployment copies
of both complete upstream license notices. Only built files are served.

Each child process has a three-minute deadline and bounded output; the browser
operation has a 45-second deadline with browser/server cleanup. Evidence retains
the tarball, command logs, lockfiles, production output, screenshots and readable
values in `results.json`. Fresh temporary consumers are retained for inspection.
The existing Stage 0 prototype and baseline scripts are separate and unchanged.
Map fixture parity, official Excalidraw generation and root API regression checks
remain the parent integration lane's responsibility.
