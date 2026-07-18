# Bundled asset provenance

## Project-authored bundled assets

Repository owner and maintainer `kroffske` attested on 2026-07-18 that the
complete bundled `core` and `trading` SVG asset set was authored for this
project. This is the explicit provenance statement for all 128 assets listed in
the two canonical v2 manifests:

- `assets/core/manifest.json` — 64 project-authored SVGs.
- `assets/trading/manifest.json` — 64 project-authored SVGs.

The asset set was introduced in repository commit
[`d28d62eaa0f4c6b0ceb06af216f91ed5f4545bd7`](https://github.com/kroffske/excalidraw-js/commit/d28d62eaa0f4c6b0ceb06af216f91ed5f4545bd7).
Every currently shipped SVG blob is byte-identical to its path at that commit.
Each manifest descriptor binds this statement to the shipped file through its
exact `provenance.svg_sha256` value.

The assets are distributed under the repository's top-level
[`MIT` license](https://github.com/kroffske/excalidraw-js/blob/d28d62eaa0f4c6b0ceb06af216f91ed5f4545bd7/LICENSE).
Manifest provenance therefore records:

- `source_kind`: `project-authored`
- `source_ref`: `assets/PROVENANCE.md#project-authored-bundled-assets`
- `license_spdx`: `MIT`
- `attribution`: `Project-authored by repository owner and maintainer kroffske.`

This record relies on the named maintainer attestation; Git authorship alone is
not treated as proof of asset authorship. Catalog generation fails if an SVG is
missing, its recorded hash differs, its attestation binding is absent, or its
SPDX identifier is not the allowed `MIT` value. Any future third-party asset
requires a separately verified source, license, and attribution before it can
enter a bundled manifest.
