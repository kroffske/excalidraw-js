# Excalidraw Diagrams Guide

This guide is for agents and maintainers who need a working diagram delivery,
not just a package checkout that happens to run locally.

## What This Package Owns

`@kroffske/excalidraw-diagrams` ships four things together:

- A TypeScript API for writing `.excalidraw` JSON: `Scene`, `AssetRegistry`, and `layout`.
- CLI tools for setup, examples, asset discovery, and PNG rendering.
- Bundled SVG asset packs under `assets/`.
- The portable `skills/excalidraw-diagrams` agent skill.

The supported path is TypeScript/npm. Do not use the old Python package path,
`uv`, `.venv`, `site-packages`, or `excalidraw_diagrams` for this skill.

## Install And Generate

In a project that needs diagrams:

```bash
npm install @kroffske/excalidraw-diagrams
npx excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline
npx excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png
```

For custom diagrams, write a small TypeScript file and import from the installed
package:

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({ seed: 42, assetRegistry: AssetRegistry.bundled() });
const input = layout.iconWithLabel(scene, "api_connector", 0, 0, { label: "Input" });
const agent = layout.iconWithLabel(scene, "robot_agent", 180, 0, { label: "Agent" });
layout.connect(scene, input, agent);
scene.write("examples/out/agent-flow.excalidraw");
```

Then render:

```bash
npx tsx diagram.ts
npx excalidraw-render --setup examples/out/agent-flow.excalidraw examples/out/agent-flow.png
```

## Install The Skill

Default user install goes to the shared generic target used by Pi-style agents:

```bash
npx excalidraw-diagrams setup
```

Explicit user targets:

```bash
npx excalidraw-diagrams setup --agent generic
npx excalidraw-diagrams setup --agent claude
```

Do not install into `~/.codex/skills` unless the user explicitly asks for the
private Codex target:

```bash
npx excalidraw-diagrams setup --agent codex
```

For a project-local copy:

```bash
npx excalidraw-diagrams setup --project
```

Use `--force` only when replacing an existing skill directory is intended.

## Proof That Counts

A manual diagram in the checkout is not enough proof that the skill works for
another agent or project.

Minimum useful proof:

- The package is installed in a separate project.
- `npx excalidraw-diagrams example excalidraw-js-architecture --out-dir out/baseline` runs from that project.
- `npx excalidraw-render --setup out/baseline/excalidraw-js-architecture.excalidraw out/baseline/excalidraw-js-architecture.png` creates a PNG.
- The JSON has `type == "excalidraw"`, non-empty `elements`, and non-empty `files`.
- The PNG exists and is non-empty.
- The command path resolves from `node_modules/@kroffske/excalidraw-diagrams`, not from the source checkout `dist/bin`.

For Pi proof, the prompt should say explicitly:

```text
Use the excalidraw-diagrams skill from ~/.agents. Use the installed npm package
CLI. Do not use the source checkout path, checkout dist/bin, Python, uv, .venv,
site-packages, or excalidraw_diagrams.
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
