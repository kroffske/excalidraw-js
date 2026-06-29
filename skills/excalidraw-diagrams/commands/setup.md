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
- Install the `@kroffske/excalidraw-diagrams` npm package globally with npm.
- Install the `excalidraw-diagrams` skill where the selected agent runners or project can load it.
- Ask whether to prepare the PNG renderer because that path downloads Playwright Chromium.
- Verify the package by generating a small `.excalidraw` file.
- Do not commit generated outputs unless I explicitly ask.

Steps:
1. Inspect the current repository and identify whether the user asked to set up
   the `@kroffske/excalidraw-diagrams` checkout or a consumer project.
2. If the user explicitly asked to set up this package checkout, run:
   npm install && npm run build
3. For a normal user-level machine install, first install the npm package:
   ```bash
   npm install -g @kroffske/excalidraw-diagrams
   ```

   Then run setup. It asks which agent skill targets to write and whether PNG rendering should be prepared:
   ```bash
   excalidraw-diagrams setup
   ```

   Explicit non-interactive user targets:
   ```bash
   excalidraw-diagrams setup --agents agents,claude --with-png --force
   excalidraw-diagrams setup --agent codex --no-png --force
   ```

   Do not install into `~/.codex/skills` unless the user explicitly asks for the private Codex target. Pi should use `~/.agents/skills`.

   Project-local skill install when the package is already available in that project:
   ```bash
   excalidraw-diagrams setup --project --no-png --force
   ```

   If the target already exists, use `--force` only when replacement is intended.
4. If the package is already installed and only the skill must be copied, use the
   narrower skill-only command:
   ```bash
   excalidraw-diagrams setup --agent agents --no-png --force
   excalidraw-diagrams setup --agent claude --no-png --force
   excalidraw-diagrams setup --agent codex --no-png --force
   excalidraw-diagrams setup --project --no-png --force
   ```
5. Verify usage with the already installed package CLI: `npx --no-install excalidraw-diagrams example excalidraw-js-architecture --out-dir examples/out/baseline`. This writes `examples/out/baseline/excalidraw-js-architecture.excalidraw` and validates it. If `npx --no-install` fails because the package is not installed, report that setup is incomplete instead of fetching a package implicitly.
6. If PNG export is needed, render with `npx --no-install excalidraw-render --setup examples/out/baseline/excalidraw-js-architecture.excalidraw examples/out/baseline/excalidraw-js-architecture.png`.

Do not use Python, `uv pip`, `.venv`, `site-packages`, or `excalidraw_diagrams` for this TypeScript skill path.

Report:
- Package install path or version.
- Skill install path.
- Verification command and result.
- Any skipped step and why.
```
