# Excalidraw Diagrams

TypeScript API, CLI tools, bundled SVG assets, PNG renderer, and agent skill for generating reviewable `.excalidraw` diagrams.

For a fuller operator guide covering package usage, skill installation, proof artifacts, and release checks, see [`GUIDE.md`](GUIDE.md).

## Quick Start

Install the package in a project:

```bash
npm install @kroffske/excalidraw-diagrams
```

Generate a diagram:

```bash
cat > diagram.mjs <<'JS'
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const assets = AssetRegistry.bundled();
const scene = new Scene({ seed: 42, assetRegistry: assets });

const api = layout.iconWithLabel(scene, "api_connector", 0, 90, { label: "API" });
const agent = layout.iconWithLabel(scene, "robot_agent", 180, 90, { label: "Agent" });
const db = layout.iconWithLabel(scene, "historical_database", 360, 90, { label: "Database" });

scene.text(0, 20, "Service flow", { size: 28, width: 470, align: "center" });
layout.connect(scene, api, agent, { direction: "left-to-right", path: "orthogonal" });
layout.connect(scene, agent, db, { direction: "left-to-right", path: "orthogonal" });

scene.write("out/service-flow.excalidraw");
JS

node diagram.mjs
```

Render a PNG:

```bash
npx --no-install excalidraw-render --setup out/service-flow.excalidraw out/service-flow.png
```

Install the bundled agent skill:

```bash
# Default user install: shared generic ~/.agents skills for Pi and Codex-style runners.
npx @kroffske/excalidraw-diagrams setup

# Explicit Pi/generic and Claude Code targets.
npx @kroffske/excalidraw-diagrams setup --agent generic
npx @kroffske/excalidraw-diagrams setup --agent claude

# Private Codex target only when explicitly intended.
npx @kroffske/excalidraw-diagrams setup --agent codex

# Project-local skill target: ./skills/excalidraw-diagrams
npx @kroffske/excalidraw-diagrams setup --project
```

For Pi with a local model, perform setup before opening the Pi session. The
agent skill is a draw-time guide, not an installer:

```bash
npm install -g @kroffske/excalidraw-diagrams
excalidraw-diagrams setup --agent generic --force
```

In a project where the agent should write custom scripts, install the package
there as a normal user setup step:

```bash
npm install @kroffske/excalidraw-diagrams
```

Copy-paste prompt for agents:

```text
Use the excalidraw-diagrams skill. The package is already installed; do not run
npm install or install from a source checkout. Generate a small .mjs script that
imports AssetRegistry, Scene, and layout from @kroffske/excalidraw-diagrams,
uses a fixed Scene seed, places bundled SVG assets by alias, writes a
.excalidraw file under examples/out/, and renders a PNG with excalidraw-render.
```

## From a Checkout

```bash
npm install
npm run build
npm test
npm run eval:agent-diagrams
```

The eval command writes scenario artifacts and a report to `examples/out/agent-evals/`.

Generate the baseline architecture proof for this repository:

```bash
npx --no-install excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline
npx --no-install excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png
```

## API

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({
  seed: 123,
  assetRegistry: AssetRegistry.bundled(),
});

const prompt = layout.iconWithLabel(scene, "prompt_template", 0, 0, { label: "Prompt" });
const worker = layout.iconWithLabel(scene, "robot_agent", 180, 0, { label: "Agent" });
layout.connect(scene, prompt, worker, { direction: "left-to-right", path: "orthogonal" });

scene.write("examples/out/agent-flow.excalidraw");
```

Main exports:

- `Scene`: Excalidraw JSON scene builder.
- `AssetRegistry`: bundled or custom SVG asset lookup.
- `layout`: helpers for icon labels, cards, panels, bullets, distribution, alignment, and arrows.
- `Bounds` and `PlacedBlock`: geometry primitives used by layout helpers.

For top-down trees, describe the hierarchy as data. Put true parent/child
relationships under `children`; put cross-links in `secondaryEdges`; put weak
non-hierarchy details in `sidecars` instead of drawing long reverse arrows:

```ts
const diagram = layout.tree(scene, {
  root: {
    id: "session",
    title: "Session",
    iconId: "memory_database",
    bullets: ["shared state"],
    children: [
      { id: "plan", title: "plan", iconId: "agent_planner", bullets: ["tasks"] },
      { id: "loop", title: "loop", iconId: "model_refresh", bullets: ["turns"] },
    ],
  },
  secondaryEdges: [{ from: "loop", to: "plan", kind: "feedback", label: "restore" }],
  sidecars: [{ id: "hook-note", attachTo: "loop", side: "right", title: "hook", bullets: ["restores state"] }],
}, { x: 80, y: 120, nodeWidth: 240 });
```

For quick drafts, convert a small Mermaid flowchart subset. Use
`scenario: "tree"` when solid arrows should become hierarchy and dotted or
labeled arrows should become routed secondary edges:

```ts
const diagram = layout.fromMermaid(scene, `
  graph TD
    Session["Session"] --> Plan["plan"]
    Session --> Loop["loop"]
    Loop -. restores .-> Plan
`, {
  scenario: "tree",
  icons: { Session: "memory_database", Plan: "agent_planner", Loop: "model_refresh" },
});
```

## CLI Commands

```bash
excalidraw-diagrams setup [--agent auto|codex|claude|generic] [--project] [--force]
excalidraw-diagrams example excalidraw-js-architecture [--out-dir examples/out/baseline]
excalidraw-assets packs
excalidraw-assets groups
excalidraw-assets --pack trading list --group trading
excalidraw-assets show robot_agent
excalidraw-assets export ./asset-catalog
excalidraw-render-setup
excalidraw-render input.excalidraw output.png --scale 2 --background "#ffffff"
```

## Assets

The package ships two bundled SVG packs:

- `core`: neutral agent and data workflow icons.
- `trading`: fintech and market workflow icons.

Resolve assets by full id, short alias such as `robot_agent`, or numeric code such as `01-01`.

## Agent Skill

The npm package includes `skills/excalidraw-diagrams`, a portable skill for Codex, Claude Code, or generic agent runners. The setup command copies it to one of these targets:

- Generic agents and Pi: `~/.agents/skills/excalidraw-diagrams` (the default)
- Claude Code: `~/.claude/skills/excalidraw-diagrams`
- Codex private target: `~/.codex/skills/excalidraw-diagrams` only with explicit `--agent codex`
- Project-local: `./skills/excalidraw-diagrams`

Use `--force` only when replacing an existing skill directory is intended.

The installed skill should not install packages during ordinary diagram
generation. If a package or CLI is missing, it should report the setup command
for the user to run and stop.

## Evaluation and Release

Agent evaluation scenarios live in `evals/agent-diagram-scenarios.json` and `evals/agent-diagram-scenarios.md`.

```bash
npm run eval:agent-diagrams
npm run release:check
```

`npm run eval:agent-diagrams` generates:

- `examples/out/agent-evals/*.excalidraw`
- `examples/out/agent-evals/*.png`
- `examples/out/agent-evals/report.html`

`npm run release:check` runs the build, tests, eval generation, and `npm pack --dry-run` with pack output scoped under `build/npm/`. See `RELEASE.md` for the publish checklist.
