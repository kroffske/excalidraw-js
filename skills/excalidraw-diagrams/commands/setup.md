# Setup Command

Use this command only when the user explicitly asks to set up or install the
excalidraw-diagrams package or skill. This setup flow is intentionally separate
from `SKILL.md`, which describes how to use the library after setup.

Do not follow this setup command during ordinary diagram generation. If the
package is missing during generation, report the setup command to the user and
stop.

```text
Set up the excalidraw-diagrams skill for this project.

Goal:
- Install the `@kroffske/excalidraw-diagrams` npm package.
- Install the `excalidraw-diagrams` skill where this agent runner or project can load it.
- Verify the package by generating a small `.excalidraw` file.
- Do not commit generated outputs unless I explicitly ask.

Steps:
1. Inspect the current repository and identify whether the user asked to set up
   the `@kroffske/excalidraw-diagrams` checkout or a consumer project.
2. If the user explicitly asked to set up this package checkout, run:
   npm install && npm run build
3. If the user explicitly asked to set up another project and the package is
   available on npm, install it:
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
5. Verify usage with the already installed package CLI: `npx --no-install excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline`. This writes `examples/out/baseline/excalidraw-js-architecture.excalidraw` and validates it. If `npx --no-install` fails because the package is not installed, report that setup is incomplete instead of fetching a package implicitly.
6. If PNG export is needed, render with `npx --no-install excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png`. Renderer setup is separate from skill setup.

Do not use Python, `uv pip`, `.venv`, `site-packages`, or `excalidraw_diagrams` for this TypeScript skill path.

Report:
- Package install path or version.
- Skill install path.
- Verification command and result.
- Any skipped step and why.
```
