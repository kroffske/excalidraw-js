---
eval: eval7
slug: longest-substring-sliding-window
diagram_title: Longest substring without repeats
thesis: The sliding window expands while characters are unique and moves its left boundary past a duplicate, producing a maximum length of three for abcabcbb.
layout_family: indexed sliding-window trace
mode: single
contract: visual
difficulty: hard
input_type: documentation
models: local-omlx-qwen36-35b-a3b-4bit
samples: 1
output_dir: evals/run/<date>-eval7
---

Create a compact teaching visual for the algorithm described below. It should
make the window invariant, the duplicate reaction, and the final answer visible
at a glance.

## Documentation excerpt

Input: `s = "abcabcbb"`. Find the length of the longest substring without
repeating characters.

Maintain a window `[left, right]` whose characters are unique. Expand `right`
one character at a time. When the new character already appears inside the
window, move `left` to one position after that character's previous occurrence.
The first window `"abc"` has length 3. Reading the next `a` moves `left` from 0
to 1, so the active window becomes `"bca"`. No later window is longer. Final
answer: `3`. Complexity: `O(n)` time and `O(k)` space for last-seen positions.

Use `$plan-excalidraw-weak-visual` and `$excalidraw-diagrams`.
