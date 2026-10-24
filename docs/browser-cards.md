# Browser-safe card measurement

`@kroffske/excalidraw-diagrams/card` exports pure `fitCard` / `fitText`, their
compatibility aliases and TypeScript types. It imports no `Scene`, filesystem,
DOM or layout engines. It works in React/browser code as well as Node. The
consumer receives dimensions and relative coordinates, then creates elements
with its renderer. It does not create an official Excalidraw scene.

This API belongs to the current local source; the unchanged package version
0.5.2 is not a claim that registry 0.5.2 contains this subpath. See the
[authoring levels and executable tour](authoring.md).

```js
import { fitCard } from '@kroffske/excalidraw-diagrams/card';
const card = fitCard({
  id: 'adapter', title: 'Scene adapter',
  rows: [{ id: 'description', text: 'Converts the model into elements.', size: 20, minSize: 20 }],
  width: 320, padding: 20, titleSize: 24, titleMinSize: 24,
  titleMaxLines: Infinity, metrics: 'helvetica', lineHeight: 1.25,
  strict: true,
});
console.log(card.width, card.height, card.title, card.rows);
```

`metrics: 'helvetica'` uses the shared graph-layout text measurement, including
Cyrillic. The default `approximate` keeps the earlier width estimate. `lineHeight`
sets the line-height multiplier explicitly; its old default remains `1.22`.
A font family name alone does not change the measurement mode. Render using the
same font and spacing to match these calculations; this is pure calculation,
not a DOM measurement of whatever fonts happen to be installed.

`title`, `rows` and `badge` retain fitted text, coordinates, available width and
source records. Height grows with content. `maxLines`, `minSize`, `overflow`,
`maxHeight` and `strict` keep their previous meaning. Strict mode refuses a card
when even a minimum-sized character cannot fit. Nonpositive widths are rejected.

The consumer owns roles, statuses, localization, text selection and shortening.
Map's model fields and profiles are not library card options. Root Node APIs
`fitCard`, `nodeCard`, `fitText` and `textBox` use the same calculation; their
existing imports and defaults remain supported. Use `/card` in a browser to
avoid pulling in root Node I/O. Combine its measurements with
[graph-layout](graph-layout.md) when geometry, rather than a standalone card,
is required.
