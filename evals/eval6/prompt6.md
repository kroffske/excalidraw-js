---
eval: eval6
slug: leetcode-two-sum-trace
diagram_title: Two Sum — one-pass hash map
thesis: Each value checks whether its complement was seen before; the first match returns two distinct indices in linear time.
layout_family: indexed array trace
mode: single
contract: visual
difficulty: medium
input_type: documentation
models: local-omlx-qwen36-35b-a3b-4bit
samples: 1
output_dir: evals/run/<date>-eval6
---

Turn the documentation below into a one-screen visual explanation for a learner.
The answer must be visible from the picture, not hidden in a paragraph.

## Documentation excerpt

Problem: given `nums` and `target`, return indices of two different elements
whose sum equals `target`.

Example: `nums = [2, 7, 11, 15]`, `target = 9`, output `[0, 1]`.

One-pass hash-map rule: for each value at index `i`, compute
`need = target - value`. Check whether `need` is already in the map before
storing the current value and index. For the example, index 0 stores `2 -> 0`;
at index 1, `need = 2` is found, so return `[0, 1]`. Complexity is `O(n)` time
and `O(n)` extra space.

Use `$plan-excalidraw-weak-visual` and `$excalidraw-diagrams`.
