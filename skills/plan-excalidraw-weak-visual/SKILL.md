---
name: plan-excalidraw-weak-visual
description: Help weak/local LLMs compose bounded pictorial Excalidraw artifacts such as array traces, UI wireframes, charts, presentation cards, and simple objects through a safe high-level helper DSL.
---

# Plan Excalidraw Weak Visual

## Goal

Turn a problem statement into one clean, presentation-ready visual without raw
Excalidraw JSON or low-level scene geometry. Choose the smallest high-level
helper set that expresses the requested idea.

The runner owns repeated shapes, styling, text placement, routes, file output,
and the fixed 1600×1000 canvas. You own the semantic content, major regions,
stable ids, and the few coarse coordinates that arrange those regions.

## Output Contract

- Return exactly one fenced ` ```ts ` block and no prose outside it.
- The source is helper calls only. Do not use imports, variables, loops,
  callbacks, method/property access, `Scene`, or raw JSON.
- Stable ids are unique `snake_case` strings.
- Content must stay in `x=24..1576`, `y=118..976`.
- Use only the helpers below. Do not invent helper names.
- Prefer 1-4 large semantic objects. Do not rebuild a helper's internal cells,
  bars, controls, or arrows by hand.
- Preserve every explicit answer/result, ordering rule or invariant, decision
  branch, and complexity claim from source documentation. Put these facts in
  the visual; do not silently drop them to save space.

## Allowed tones

`neutral`, `accent`, `success`, `warning`, `danger`, `purple`.

## Helpers

### Literal object and chart

```ts
candle("wax_candle", "A literal candle", {
  x: 80, y: 170, w: 390, h: 650,
  caption: "flame • wick • wax",
});

candlestickChart("ohlc_chart", "Market candlesticks", [
  { label: "Mon", open: 42, high: 49, low: 39, close: 47 },
  { label: "Tue", open: 47, high: 51, low: 43, close: 44 },
  { label: "Wed", open: 44, high: 54, low: 42, close: 52 },
], { x: 540, y: 170, w: 980, h: 650 });
```

`candlestickChart` needs 3-12 entries with numeric `open`, `high`, `low`, and
`close`. Each entry must satisfy `low <= open/close <= high`. The runner scales
the axes and draws the wick/body colors.

### Array/index trace

```ts
arrayStrip("input", [2, 7, 11, 15], {
  x: 130, y: 210, cell: 120,
  label: "nums, target = 9",
  highlights: { 0: "accent", 1: "success" },
  pointers: [
    { index: 0, label: "i = 0", tone: "accent" },
    { index: 1, label: "match", tone: "success" },
  ],
});
card("rule", "Complement lookup", ["need = target - value", "return [0, 1]"], {
  x: 820, y: 210, w: 610, h: 190, tone: "accent",
});
link("input_to_rule", "input", "rule", "lookup");
```

`values` has 2-14 items. `highlights` maps numeric indices to tones. `pointers`
contains `{ index, label, tone? }` entries. Indices are shown unless
`indices: false`.

### Generic explanation card

```ts
card("invariant", "Window invariant", [
  "characters are unique inside [left, right]",
  "move left after a duplicate",
], { x: 920, y: 180, w: 520, h: 190, tone: "purple" });
```

`card(id, title, lines, options)` supports `x`, `y`, `w`, `h`, and `tone`.

### Process strip

```ts
stepStrip("trace", [
  { title: "Read value", caption: "7 at index 1" },
  { title: "Compute need", caption: "9 - 7 = 2", tone: "accent" },
  { title: "Return", caption: "[0, 1]", tone: "success" },
], { x: 100, y: 690, w: 1400, h: 210, label: "One-pass trace" });
```

Use 2-7 steps. The runner sizes boxes and draws arrows.

### UI wireframe

```ts
uiWindow("support_console", "Support operations", {
  x: 70, y: 145, w: 1460, h: 790,
  workspace: "Acme Support",
  sidebar: ["Inbox", "Assigned", "Analytics"],
  listTitle: "Priority queue",
  items: [
    { title: "Checkout failed", meta: "Urgent • 2 min" },
    { title: "Duplicate charge", meta: "High • 8 min" },
  ],
  detailTitle: "Checkout failed",
  detail: ["Customer cannot pay", "AI draft ready", "Human approval required"],
  composer: "Draft response…",
  actions: ["Edit draft", "Approve & send"],
});
```

This helper draws the browser chrome, navigation, queue, detail view, composer,
and action buttons. Do not add nested cards on top of it.

### Three-class ML explanation

```ts
classScores("prediction", "photo_024.jpg", [
  { label: "Cat", value: 0.72, tone: "accent" },
  { label: "Dog", value: 0.21, tone: "success" },
  { label: "Other", value: 0.07, tone: "purple" },
], {
  x: 100, y: 180, w: 1400, h: 600,
  title: "Prediction at a glance",
  winner: "Cat",
  caption: "Exactly three classes; uncertainty is a separate decision state.",
});
```

Exactly three classes are required. Scores are decimals from 0 to 1. Use
`uncertain: true` only when the output should route to review; uncertainty must
not appear as a fourth class.

### Links

```ts
link("evidence_to_decision", "evidence", "decision", "supports", { tone: "accent", dashed: false });
```

Both endpoint objects must already exist. Use links only between distinct
top-level helpers. The runner rejects routes and labels that cross an unrelated
object. Internal helper geometry already carries its own story.

## Composition Rules

- Literal comparison: use one `candle` plus one `candlestickChart` as a diptych.
- Algorithm trace: use one or two `arrayStrip` objects, one explanation `card`,
  and optionally one `stepStrip`. Keep the output/result, invariant or ordering
  rule, and documented time/space complexity visible.
- UI request: prefer one full-canvas `uiWindow`.
- Three-class prediction: prefer one full-width `classScores` object.
- If the brief is naturally a named node/edge architecture graph, use the graph
  contract instead of forcing it into this visual contract.

## Common Failures

- Too many tiny cards: merge them into one helper with concise lines.
- Canvas error: reduce `w`/`h` or move the object; never exceed the content
  bounds.
- Unknown helper: replace it with an allowed helper.
- Property/method-access error: remove calculations and call helpers directly
  with literals.
- Cluttered links: delete supporting links; helpers already draw internal flow.
