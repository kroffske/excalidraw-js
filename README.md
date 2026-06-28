# Excalidraw Diagrams

Agent skill and TypeScript package for drawing reviewable Excalidraw diagrams
from agent prompts, scripts, and small JSON specs.

![Agent-generated service flow](docs/assets/basic-service-flow.png)

## Contents

- [Install](#install): install the package and bundled agent skill.
- [Ask An Agent](#ask-an-agent): give an agent the right global or project-local preflight.
- [Renderer Dependencies](#renderer-dependencies): prepare Playwright, Chromium, and first PNG render commands.
- [Project Dependency](#project-dependency): install the package in a workspace that writes diagram scripts.
- [More Usage](#more-usage): jump to fuller API, CLI, release, and operator guides.

## Install

Install the package where your agent or project can run Node.js commands:

```bash
npm install -g @kroffske/excalidraw-diagrams
```

Install the bundled agent skill:

```bash
excalidraw-diagrams setup
```

The default setup target is:

- Generic agents and Pi: `~/.agents/skills/excalidraw-diagrams`

You can choose another target explicitly:

```bash
excalidraw-diagrams setup --agent generic
excalidraw-diagrams setup --agent claude
excalidraw-diagrams setup --agent codex
excalidraw-diagrams setup --project
```

Those targets write to:

- `--agent generic`: `~/.agents/skills/excalidraw-diagrams`
- `--agent claude`: `~/.claude/skills/excalidraw-diagrams`
- `--agent codex`: `~/.codex/skills/excalidraw-diagrams`
- `--project`: `./skills/excalidraw-diagrams`

Use `--force` only when replacing an existing skill directory is intended.

## Ask An Agent

After setup, give your coding agent a prompt that starts with the right
preflight for the install mode and then asks for the diagram:

```text
Use the excalidraw-diagrams skill. If this is a global CLI install, first run
`command -v excalidraw-diagrams`, `command -v excalidraw-assets`, and
`command -v excalidraw-render`; if any command is missing, stop and tell me the
exact PATH or install command to fix. If this is a project dependency install,
first resolve `@kroffske/excalidraw-diagrams` from the current workspace and use
`npx --no-install` for package binaries. Do not use absolute paths to package
binaries. Draw a simple service flow with an API request, an agent worker, a
guardrail check, and a database. Save the `.excalidraw` file and render a PNG.
```

The skill guides the agent to create a small script, use bundled SVG assets,
write an `.excalidraw` scene, and render a PNG with `excalidraw-render`.

## Renderer Dependencies

The skill setup command installs only the agent instructions. PNG rendering uses
the package renderer, Playwright, and a local Chromium browser.

For a global CLI install, fail fast by checking that all package binaries are
available through `PATH`:

```bash
command -v excalidraw-diagrams
command -v excalidraw-assets
command -v excalidraw-render
```

If `excalidraw-render` is missing after a global install, add your npm/global
Node bin directory to `PATH` instead of calling the binary through an absolute
path. Use your own npm prefix, for example:

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

Install the renderer once on machines where agents should produce PNGs:

```bash
excalidraw-render-setup
```

Use `<path_json>` as a placeholder for your generated `.excalidraw` JSON file.
You can let the render command perform setup before the first render:

```bash
excalidraw-render --setup <path_json> example.png
```

Render with the CLI binary exposed by the package:

```bash
excalidraw-render <path_json> example.png
```

For a project dependency install, first confirm the package resolves from the
current workspace:

```bash
node -e "const {createRequire}=require('node:module'); console.log(createRequire(process.cwd() + '/probe.js').resolve('@kroffske/excalidraw-diagrams'))"
```

Then use `npx --no-install` so npm does not fetch or install anything. On the
first render, include `--setup` so the renderer cache is prepared:

```bash
npx --no-install excalidraw-render --setup <path_json> example.png
```

After the renderer is already installed, the shorter command is enough:

```bash
npx --no-install excalidraw-render <path_json> example.png
```

On Linux, Playwright may require additional browser system libraries. If
Chromium fails to launch with missing dependency errors, install them with:

```bash
sudo npx playwright install-deps
```

If you cannot install system dependencies in the environment, keep the generated
`.excalidraw` JSON file and open it manually in the Excalidraw UI by importing
or dragging the file into <https://excalidraw.com/>.

## Project Dependency

If the agent should generate scripts inside a project, also install the package
there:

```bash
npm install @kroffske/excalidraw-diagrams
```

The main API exports are `Scene`, `AssetRegistry`, and `layout`.

## More Usage

See [docs/usage.md](docs/usage.md) for script examples, CLI commands, bundled
assets, renderer setup, and release checks. See
[docs/operator-guide.md](docs/operator-guide.md) for maintainer and agent
runtime boundaries.
