# Excalidraw Diagrams Guide

This guide is for agents and maintainers who need a working diagram delivery,
not just a package checkout that happens to run locally.

## What This Package Owns

`@kroffske/excalidraw-diagrams` ships four things together:

- A TypeScript API for writing `.excalidraw` JSON: `Scene`, `AssetRegistry`, and `layout`.
- CLI tools for setup, examples, asset discovery, and PNG rendering.
- Bundled SVG asset packs under `assets/`.
- The portable `skills/excalidraw-diagrams` drawing skill and
  `skills/plan-excalidraw-graph` planning skill.

The supported path is TypeScript/npm. Do not use the old Python package path,
`uv`, `.venv`, `site-packages`, or `excalidraw_diagrams` for this skill.

## Install And Generate

In a project that needs diagrams:

```bash
npm install @kroffske/excalidraw-diagrams
npx --no-install excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline
npx --no-install excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png
```

For custom diagrams, write a small `.mjs` file and import from the installed
package:

```js
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({ seed: 42, assetRegistry: AssetRegistry.bundled() });
const input = layout.iconWithLabel(scene, "api_connector", 0, 0, { label: "Input" });
const agent = layout.iconWithLabel(scene, "robot_agent", 180, 0, { label: "Agent" });
layout.connect(scene, input, agent);
scene.write("examples/out/agent-flow.excalidraw");
```

Then render:

```bash
node diagram.mjs
npx --no-install excalidraw-render --setup examples/out/agent-flow.excalidraw examples/out/agent-flow.png
```

## Install The Skill

Default user install goes to the shared `agents` target used by Pi-style agents.
Install the package itself with npm:

```bash
npm install -g @kroffske/excalidraw-diagrams
```

Then run setup. It asks which agent skill targets should receive the bundled
skills and asks whether to prepare the PNG renderer because it downloads
Playwright Chromium:

```bash
excalidraw-diagrams setup
```

Explicit non-interactive user targets:

```bash
excalidraw-diagrams setup --agents agents,claude --with-png --force
```

Do not install into `~/.codex/skills` unless the user explicitly asks for the
private Codex target:

```bash
excalidraw-diagrams setup --agent codex --no-png --force
```

For a project-local copy:

```bash
excalidraw-diagrams setup --project --no-png --force
```

Use `--force` only when replacing an existing skill directory is intended.

## Agent Runtime Boundary

Installation is a user/operator setup step. During ordinary diagram generation,
the loaded skill must not run `npm install`, `npm install <path>`, `npm install
file:...`, `npx @kroffske/excalidraw-diagrams install`,
`npx @kroffske/excalidraw-diagrams setup`, `excalidraw-diagrams setup`, or
`excalidraw-diagrams install`. It should only use an already installed project
dependency or already available CLI commands.

If the package is missing, stop and tell the user which setup command to run:

```bash
npm install @kroffske/excalidraw-diagrams
```

For a Pi/global CLI setup:

```bash
npm install -g @kroffske/excalidraw-diagrams
excalidraw-diagrams setup
```

When drawing a target repository, treat that repository as read-only source
material. Do not install from the target repository path and do not execute its
checkout `dist/bin`.

## Proof That Counts

A manual diagram in the checkout is not enough proof that the skill works for
another agent or project.

Minimum useful proof:

- The package is installed in a separate project.
- `npx --no-install excalidraw-diagrams example excalidraw-js-architecture --out-dir out/baseline` runs from that project.
- `npx --no-install excalidraw-render --setup out/baseline/excalidraw-js-architecture.excalidraw out/baseline/excalidraw-js-architecture.png` creates a PNG.
- The JSON has `type == "excalidraw"`, non-empty `elements`, and non-empty `files`.
- The PNG exists and is non-empty.
- The command path resolves from `node_modules/@kroffske/excalidraw-diagrams`, not from the source checkout `dist/bin`.

For Pi proof, the prompt should say explicitly:

```text
Use $plan-excalidraw-graph from ~/.agents first if the graph scope is unclear,
then use the excalidraw-diagrams skill from ~/.agents. The package is already
installed; do not run npm install. Draw two reviewable diagrams about the target
repository and render PNGs under ./out.
```

## Build And Pack

Development checks:

```bash
npm install
npm run build
npm test
npm run eval:agent-diagrams
```

Release gate:

```bash
npm run release:check
```

Local tarball proof:

```bash
npm run pack:local
```

Pack artifacts are written under `build/npm/`. The repository root should stay
free of generated `.tgz` files.

## Publish Boundary

`npm publish --dry-run --access public` proves package shape only. It does not
prove that the registry install path works.

Do not claim post-publish proof until all of these are true:

- `npm publish --access public` completed.
- `npm view @kroffske/excalidraw-diagrams version` returns the published version.
- A clean project installs from the registry, not a local tarball.
- The baseline JSON and PNG proof is repeated from that registry install.
