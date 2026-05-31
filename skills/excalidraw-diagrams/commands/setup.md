# Setup Command

Use this command when you want to install the excalidraw-diagrams skill for an agent runner or project. This is intentionally separate from `SKILL.md`, which describes how to use the library after setup.

```text
Set up the excalidraw-diagrams skill for this project.

Goal:
- Install the `@kroffske/excalidraw-diagrams` npm package.
- Install the `excalidraw-diagrams` skill where this agent runner or project can load it.
- Verify the package by generating a small `.excalidraw` file.
- Do not commit generated outputs unless I explicitly ask.

Steps:
1. Inspect the current repository and identify whether it is the `@kroffske/excalidraw-diagrams` checkout.
2. If this is the checkout, run:
   npm install && npm run build
3. If this is another project and the package is available on npm, install it:
   npm install @kroffske/excalidraw-diagrams
4. Install the skill from the installed npm package.

   Default user install goes to the shared generic target, `~/.agents/skills/excalidraw-diagrams`.
   ```bash
   excalidraw-diagrams setup
   ```

   Explicit user targets for Pi and Claude Code:
   ```bash
   excalidraw-diagrams setup --agent generic
   excalidraw-diagrams setup --agent claude
   ```

   Do not install into `~/.codex/skills` unless the user explicitly asks for the private Codex target. Pi should use `~/.agents/skills`.

   Project install:
   ```bash
   excalidraw-diagrams setup --project
   ```

   If the target already exists, re-run with `--force` only after confirming replacement is intended.
5. Verify usage with the package CLI: `npx excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline`. This writes `examples/out/baseline/excalidraw-js-architecture.excalidraw` and validates it.
6. If PNG export is needed, render with `npx excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png`. Renderer setup is separate from skill setup.

Do not use Python, `uv pip`, `.venv`, `site-packages`, or `excalidraw_diagrams` for this TypeScript skill path.

Report:
- Package install path or version.
- Skill install path.
- Verification command and result.
- Any skipped step and why.
```
