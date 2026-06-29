# Release Checklist

Use this checklist before publishing `@kroffske/excalidraw-diagrams` to npm.

## Verify

```bash
npm view @kroffske/excalidraw-diagrams version --json
npm run release:check
```

For the initial 0.1.0 publish on 2026-05-31, `npm view` returned 404 before publish and returned `0.1.0` after registry propagation. For future releases, confirm it returns the current version before publishing a new one.

`npm run release:check` runs:

- TypeScript build.
- Vitest test suite.
- Agent diagram evaluation scenarios with `.excalidraw`, `.png`, and HTML report generation.
- `npm pack --dry-run --pack-destination build/npm` to inspect publish contents without leaving tarballs in the repository root.

## Publish

Use `/Users/ravius/projects/instructions/npm-publishing.md` for the local
publish flow. It reads the npm token from the `npm-kroffske-publish` Keychain
item into a temporary `.npmrc`; do not paste tokens into the shell or commit any
npm config file.

The publish command still ends with:

```bash
npm publish --access public
```

For local tarball proof before publishing:

```bash
npm run pack:local
```

The tarball is written to `build/npm/`, which is ignored by git.

## Public GitHub Readiness

Before the first public GitHub push, verify the repo boundary:

```bash
brew install gitleaks
npm run public:check
```

`npm run public:check` verifies GitHub metadata, confirms `.locus/` utility
files are not tracked, checks tracked files for local user-home paths, runs
`gitleaks git --redact --no-banner .`, runs `npm run pack:check`, and prints
`git status --short --ignored`.

Expected package contents:

- `dist/` compiled API and CLI binaries.
- `assets/` bundled SVG packs and manifests.
- `renderer/` browser renderer source and lockfile.
- `skills/` bundled `excalidraw-diagrams` agent skill.
- `README.md` and `LICENSE`.

## Smoke Test After Publish

```bash
npm view @kroffske/excalidraw-diagrams version
mkdir /tmp/kroffske-excalidraw-diagrams-smoke
cd /tmp/kroffske-excalidraw-diagrams-smoke
npm init -y
npm install @kroffske/excalidraw-diagrams tsx
npx @kroffske/excalidraw-diagrams install --project --skip-global --skip-renderer --force
npx excalidraw-assets show robot_agent
```

Create `smoke.ts`:

```ts
import { AssetRegistry, Scene, layout } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({ seed: 42, assetRegistry: AssetRegistry.bundled() });
const api = layout.iconWithLabel(scene, "api_connector", 0, 0, { label: "API" });
const agent = layout.iconWithLabel(scene, "robot_agent", 180, 0, { label: "Agent" });
layout.connect(scene, api, agent);
scene.write("out/smoke.excalidraw");
```

Then run:

```bash
npx tsx smoke.ts
npx excalidraw-render-setup
npx excalidraw-render out/smoke.excalidraw out/smoke.png
```
