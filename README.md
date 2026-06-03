# Excalidraw Diagrams

Agent skill and TypeScript package for drawing reviewable Excalidraw diagrams
from agent prompts, scripts, and small JSON specs.

![Agent-generated service flow](docs/assets/basic-service-flow.png)

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

After setup, ask your coding agent to use the skill:

```text
Use the excalidraw-diagrams skill. Draw a simple service flow with an API
request, an agent worker, a guardrail check, and a database. Save the
.excalidraw file and render a PNG.
```

The skill guides the agent to create a small script, use bundled SVG assets,
write an `.excalidraw` scene, and render a PNG with `excalidraw-render`.

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
