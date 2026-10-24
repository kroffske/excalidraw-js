# Excalidraw Diagrams Documentation

Write diagrams as JavaScript/TypeScript source using the semantic package API.
The library generates editable Excalidraw scenes; the renderer exports PNG.

## Learn and use

- [Authoring guide](authoring.md): objects, relationships, layout, validation,
  and the boundary between this library and a consuming application.
- [Usage guide](usage.md): runnable scripts, strict templates, CLI and rendering.
- [Browser-safe cards](browser-cards.md): pure text/card measurement through `/card`, with no Node I/O or renderer.
- [Shared graph layout](graph-layout.md): browser-safe measured geometry,
  engine-free component/sequence APIs, optional automatic-routing engines,
  local WASM preparation and application integration.
- [API reference](../skills/excalidraw-diagrams/references/api.md): supported
  calls, arguments, compatibility limits, and composition examples.
- [Strict template reference](../skills/excalidraw-diagrams/references/semantic-templates.md):
  C4, sequence, swimlane, and band fields, limits, and diagnostics.
- [Custom composition](../skills/excalidraw-diagrams/references/custom-scene.md):
  measured sections, trees, and routed connections.
- [Semantic redraw](../skills/excalidraw-diagrams/references/semantic-redraw.md):
  interpret an existing architecture source and create an editable view.
- [Assets](../skills/excalidraw-diagrams/references/assets.md): icon discovery.
- [Mermaid imports](../skills/excalidraw-diagrams/references/mermaid.md): limited
  compatibility input, not the primary authoring language.

The references live beside the [agent skill](../skills/excalidraw-diagrams/SKILL.md)
so an installed skill has its own complete reading path. They are also ordinary
documentation pages for human readers, linked here without a second API copy.

## Maintain

- [Operator guide](operator-guide.md): package and runtime boundaries.
- [Layout design](system-design/layout-rendering/layout-rendering-std.md).
- [Band contract](system-design/flow-band/flow-band-contract.md): requirements
  and revision history; a requirement is not proof of implementation.
- [DSL lexicon](system-design/dsl-lexicon.md): shared field vocabulary.

Maintained documentation and API examples are written in English. Local task
records and historical source evidence are separate from this documentation.
Diagram labels may use the language explicitly requested by the reader.
