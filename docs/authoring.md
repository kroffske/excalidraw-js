# Authoring Diagrams In JavaScript

JavaScript/TypeScript is the primary authoring language, as accepted by the
project owner on 2026-10-23. Write one `.mjs` or `.ts` source describing entities,
relationships, and reading intent through the semantic API. This is an embedded
DSL: JavaScript supplies the syntax, and the package supplies diagram concepts.
Strict template objects are ordinary values in that source, not a requirement
to maintain a separate JSON document. JSON imports remain compatible.

This choice keeps the authoring language familiar while leaving geometry to the
library. It does not claim that JS empirically outperforms every alternative for
every model. Reconsider a separate grammar only for a demonstrated unmet authoring
need. Generated `.excalidraw` JSON is a scene artifact, not the authored model.

## Run a complete source example

The bundled [authoring tour](../skills/excalidraw-diagrams/assets/authoring-tour.mjs)
is the same executable linked from the usage guide, API reference and skill.
From this checkout, after `npm run build`, use new output directories:

```sh
mkdir -p out
node skills/excalidraw-diagrams/assets/authoring-tour.mjs out/orders-before
node skills/excalidraw-diagrams/assets/authoring-tour.mjs out/orders-after --edited
```

It writes strict C4 and named-flow `.excalidraw` scenes from one small fictional
dataset. `--edited` changes the API name/description and relationship text while
keeping IDs and endpoints. The script maps `name`/`description` to C4 fields and
`title`/`bullets` to flow fields explicitly; it does not add a universal model or
view API to the library. Render either file with an already prepared
`excalidraw-render INPUT.excalidraw OUTPUT.png` runtime and inspect the result.
This checkout execution is not a clean-package installation proof.

## Runtime and availability

Node 20+ is the package's declared minimum; use the current paired local source
for this tour and the new integration subpaths. The checkout still declares
version 0.5.2. Registry 0.5.2 is not evidence that `/card`, `/graph-layout` or the
latest local authoring changes have been published. No new release is implied.

| Entry | Environment | Author data versus calculation |
| --- | --- | --- |
| Root `Scene`, `diagram`, `buildDiagramSpec` | Node | Author supplies names, responsibilities, relations and genre; library creates a scene and supports file output |
| `/layout` | Node; imports Scene/assets | Caller supplies blocks/composition; helpers return measured bounds/elements |
| `/card` | Pure Node or browser, no DOM/I/O | Caller supplies exact text/typography; `fitCard`/`fitText` return measurements and relative coordinates |
| `/graph-layout` | Pure Node or browser | Caller supplies measured graph/hierarchy/order; library returns geometry and diagnostics, not a scene |
| `/graph-layout/engines` | Conditional Node/browser entry | Optional local engines for automatic geometry; not needed for component/sequence |
| `/graph-layout/prepare-assets` | Node build time | Prepares local WASM/license assets for an application |

A React application may import the pure subpaths; it must keep the root's Node
scene/file operations out of its browser bundle. See [browser cards](browser-cards.md)
and [graph geometry](graph-layout.md). Browser safety does not mean these APIs
choose semantic meaning, render an official scene or manage evidence.

## Choose the API by meaning

| What the reader needs | API | Boundary |
| --- | --- | --- |
| Internal containers and dependencies | `buildDiagramSpec({ template: "c4.container", ... })` | One system, 2–6 internal containers, no external actors or reusable views |
| Ordered calls and returns | `sequence.interaction` template | No native concurrency, alternatives, or loops |
| A bounded acyclic owner-handoff process | `flow.swimlane` template | Lane and activity limits apply |
| Lanes across ordered stages, wrapping or feedback | `flow.band` template | Engine wraps bands; author names lane/stage IDs |
| A small named graph outside these genres | `diagram.flow(scene, ...)` | Measured rows, not a general graph solver |
| A custom hierarchy, nested sections, or editable redraw | `layout.*` | Explicit composition; some advanced geometry remains caller-controlled |

Read the [strict schema reference](../skills/excalidraw-diagrams/references/semantic-templates.md)
before choosing a template. Do not remove external actors, cycles, or conditions
just to satisfy its limits. The genre determines what an arrow means: a component
dependency, a process transition, and a message in time are different relations.

## Declare nodes and relationships

After installing the package, save this as `diagram.mjs` and run `node diagram.mjs`:

```js
import { Scene, diagram } from "@kroffske/excalidraw-diagrams";

const scene = new Scene({ seed: 42 });
const graph = diagram.flow(scene, {
  title: "Order processing",
  defaults: { layout: { preset: "lr-flow" }, node: { strict: true } },
});
graph.node("api", { title: "Order API", bullets: ["Accepts orders"] });
graph.node("worker", { title: "Order worker", bullets: ["Processes accepted orders"] });
graph.row("processing", ["api", "worker"]);
graph.edge("api", "worker", { id: "submit", label: "Submits order", kind: "primary" });
graph.layout();
graph.assertHealthy();
scene.write("out/orders.excalidraw");
```

IDs connect declarations; labels explain them to the reader. Change a visible
title without changing its ID when identity is unchanged. Declare meaningful
edge IDs when you need to refer to an edge later. Use an action and object such
as “Submits order” or “Reads customer record”, rather than a generic “Uses”.
`from`/`to` establish direction; a visual direction hint does not reverse meaning.
For component diagrams, name modules and explain responsibility. For process
diagrams, name actions and explain results. An actor is not a decision diamond.

The same relationship has genre-specific field names:

| API | Relationship declaration | Visible text |
| --- | --- | --- |
| Named graph | `graph.edge("api", "worker", { id: "submit", label: "Submits order" })` | `label` |
| Strict C4 | `relationships: [{ id: "submit", from: "api", to: "worker", description: "Submits order", technology: "HTTPS" }]` | `description` and optional `technology` |
| Band flow | `edges: [{ from: "accept", to: "process", label: "Accepted", kind: "primary" }]` | `label`; `kind` has band-specific semantics |
| Swimlane | `transitions: [{ id: "handoff", from: "accept", to: "process", label: "Accepted" }]` | `label` |
| Sequence | `messages: [{ id: "request", from: "api", to: "worker", label: "Process order", kind: "call" }]` | `label`; array order is temporal order |

These rows are fragments for their respective specs, not interchangeable schemas.
Do not transfer an edge `kind` across genres without checking its meaning.

## Снимок деклараций до раскладки

`diagram.flow(scene).snapshot()` возвращает полные декларации независимо от
`layout()`: он не меняет `Scene`, не рассчитывает геометрию и не создаёт ID элементов.
Для авторства без `Scene` используйте чистый вход пакета:

```js
import { GraphDefinition } from "@kroffske/excalidraw-diagrams/graph-definition";

const graph = new GraphDefinition();
graph.edge("api", "worker", {
  id: "submit",
  label: "Submits order",
  data: { id: "submit", from: "api", to: "worker", condition: "order accepted" },
});
graph.node("worker", { title: "Order worker", data: { responsibility: "Processes orders" } });
graph.node("api", { title: "Order API" });
const snapshot = graph.snapshot();
```

Ссылки на узлы можно объявить раньше самих узлов. Снимок проверяет endpoints
после завершения деклараций; параллельные отношения требуют разных явных `id`.
Отсутствующий `id` у единственного отношения остаётся отсутствующим: снимок
не подставляет идентификаторы и defaults раскладки.

Формат снимка:

```js
{
  format: "excalidraw-flow",
  version: 1,
  nodes: [{ id: "api", spec: { title: "Order API" } }],
  edges: [], // полные { from, to, ...spec } в порядке объявлений
  rows: [],  // { id, nodes: [nodeId, ...] }
  notes: [], // { id, spec }, включая annotation
  options: {}, // объявленные title/subtitle/theme/defaults/layout/overrides
}
```

Порядок всех массивов сохраняется. `row`, `note`, `annotation` и
`applyOverrides` доступны и у `GraphDefinition`; `note(...).attachTo(...)`
сохраняет цель и параметры привязки. Как и прежде, `annotation` добавляет
`placement: "bottom-right"` и `color: "note"`, если автор их не переопределил.
`overrides` объединяются по словарям `nodes`/`edges`/`lanes` с прежним приоритетом
последнего вызова. Пустые необъявленные словари не добавляются в снимок.

`GraphNodeSpec.data` и `GraphEdgeSpec.data` переносят доменный JSON целиком;
раскладка их не интерпретирует. `snapshot()` копирует все декларации, включая
дополнительные поля, и не теряет отсутствующие необязательные поля. `undefined`,
функции, символы, `NaN`, бесконечные числа, циклы, свойства с getter/setter, экземпляры
классов, массивы с пропусками и скрытые свойства отклоняются без вызова getter или
`toJSON`. Для необязательного поля без значения опустите ключ. Изменение возвращённого
снимка не меняет накопитель; последующее изменение исходного `spec` не меняет
уже полученный снимок.

Исходные коллекции конструктора проверяются до исключения их ключей из
`options`: пропущенный ключ допустим, явные `undefined`/`null` и пропуски в
массиве `edges` отклоняются. Пустые `{}`/`[]` остаются допустимыми декларациями.
Чистый `new GraphDefinition(spec)` не вызывает getter ни при накоплении, ни при
снимке. Конструктор прежнего `diagram.flow(scene, spec)` сохраняет прежнее
немедленное чтение коллекций, включая getter и их порядок; последующий
`snapshot()` отвергает такой исходный accessor без повторного вызова. Эти
правила снимка не делают nullish-коллекции недопустимыми для старого layout.

Прежняя семантика `diagram.flow` до `layout()` сохраняется: `node` и обычный `note`
хранят ссылку на `spec`; `edge`, `row` и привязанный `note` используют прежнюю
поверхностную копию. Новые правила JSON и проверки снимка не применяются
неявно к `layout()`. После успешного `layout()` мутация через методы `FlowDiagram`
по-прежнему запрещена; повторный `layout()` возвращает прежний результат.

Отказы снимка имеют тип `GraphDefinitionError` с `code`, путём `path` в формате JSON Pointer
и сообщением: `INVALID_JSON`, `INVALID_DECLARATION`, `UNKNOWN_ENDPOINT`,
`DUPLICATE_EDGE_ID`, `PARALLEL_EDGE_ID_REQUIRED`. Повторный `node` или `note`
отказывает сразу с `DUPLICATE_NODE_ID` или `DUPLICATE_NOTE_ID`.
Чистый `/graph-definition` не загружает встроенные модули Node, `Scene`, ресурсы или
движки; корневой вход с `Scene` предназначен для авторов на Node.
Потребитель снимка отдельно определяет допустимую доменную схему. Например,
наличие рядов flow не означает поддержку вложенной компонентной композиции.

## Where nodes go

For `diagram.flow`, insertion order determines the default left-to-right row.
`graph.row("name", [ids])` declares explicit rows in call order. Every node should
appear once; omitted nodes are appended in an extra row. `two-row-flow` splits
insertion order into two halves when explicit rows are absent. It does not infer
stages, dependencies, or optimal positions from the edges. Changing an edge's
`direction` changes connector routing, not the node layout.

The engine measures cards, positions them within those rows, and resolves
overlaps. Its graph router chooses direct or outer paths; use `lane: "outer"`
only for a meaningful secondary route. Feedback and provenance edges are dashed
by default. This path does not promise arbitrary obstacle-free graph routing or
native connectors that follow every manual move. Inspect the rendered result.

Strict C4 nesting is exactly one `system` with 2–6 direct internal
`containers`. Containers cannot have their own `children` or nested `containers`;
there is no arbitrary C4 hierarchy in that template. Use explicit measured
composition for a different hierarchy, or Map's canonical `contains` forest
when working in Map. `diagram.flow` does not provide `description`/`children`
fields or infer nesting; its body text is `bullets`.

Strict templates own their geometry: C4 uses a bounded grid, sequence lays out
participants and message order, swimlane places activities by ownership and
flow, and band wraps lane/stage cells into bands. Authors supply semantic order
and membership, not pixel coordinates. `layout.row`, `layout.column`, and
measured sections support explicit nested composition when a template does not
fit. See [custom composition](../skills/excalidraw-diagrams/references/custom-scene.md).

Some older graph types expose unsupported knobs. In `diagram.flow`, edge
`labelOffset` is ignored, node `body`/`text` are not applied per node, and
`overrides.lanes` does not place rows. Use `bullets` for node body text, the
documented row APIs, and engine-owned label placement. The
[API reference](../skills/excalidraw-diagrams/references/api.md) records these
limits. A field in a TypeScript interface alone is not a working layout feature.

## Build, inspect, and regenerate

For strict templates, call `buildDiagramSpec(spec, { seed: 42 })`, inspect `ok`
and `diagnostics`, then write `result.scene` on success. For a named graph, call
`layout()` and `assertHealthy()` before `scene.write(...)`. These checks have
different coverage; success is not proof that a reader understands the diagram.
Render a PNG with the installed `excalidraw-render` CLI and inspect labels,
crossings, clipping, and reading order. The CLI's output is PNG, not SVG.

Keep the JS/TS source as the authored truth. Regeneration uses that source and
does not merge manual canvas edits back into it. A hand-edited scene can be kept
as a separate presentation artifact; there is no general scene-to-model
round-trip. C4 and sequence template arrows are editable but unbound; swimlane
and band connectors have native bindings. Do not promise identical edit behavior
for every authoring layer.

## Library and application ownership

The intended shared boundary is:

| Excalidraw JS | Consuming application, such as Locus Map |
| --- | --- |
| Public JS/TS diagram vocabulary and reusable templates | Source research, evidence, and truth of the modeled system |
| Card measurement, primitive composition, geometry | Reader questions, view selection, semantic grouping and ordering |
| Layout strategies, edge routing and label placement | Choosing the suitable genre and expressing supported layout intent |
| Scene generation and geometry/binding diagnostics | Workflow, review, retries and artifact lifecycle |
| Generic rendering capabilities | Viewer navigation, selection, evidence panels, persistence and reconciliation |

The application decides that an object is a component, action, actor, or
artifact; the library applies the selected representation. It must not infer
project facts from coordinates. Application-specific semantic APIs may wrap the
shared API, but should not become an independently evolving geometry engine.

The [shared graph-layout API](graph-layout.md) now provides an opt-in,
browser-safe measured geometry boundary for automatic placement, orthogonal
routing and labels, plus engine-free component and sequence geometry. Map supplies its admitted labels, shapes, defaults and
reader policy; the library does not interpret Map's semantic types. This route
does not replace `diagram.flow` or change existing template geometry.

The migration is incremental: Map still owns card content/profile selection,
containment and message-order semantics, the authoring/build process and official
browser scene conversion. The library calculates component packing and sequence
paths/lifelines from that resolved input. Pure card measurement is already shared through `/card`; application-specific
card content, styling and semantic admission remain with Map. Saved scenes are admitted without automatic re-layout. These local source
changes do not imply that the new API is already published on npm.
