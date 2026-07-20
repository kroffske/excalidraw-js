---
eval: eval4
slug: support-intake-dictated-clarification
diagram_title: clarified support request workflow
thesis: Messages from chat and email become one deduplicated, prioritized support queue; AI drafts a response, a human approves or edits it, and the resolved ticket feeds audit and service metrics.
layout_family: process-spine with governance sidecars
mode: clarify
difficulty: hard
input_type: dictated-ambiguous
models: local-omlx-qwen36-35b-a3b-4bit, openrouter-qwen3-coder-30b-a3b-instruct
samples: 3
output_dir: evals/run/<date>-eval4
---

Task: draw the workflow I am describing. We have support messages coming from
chat and email, sometimes the same issue arrives twice, somebody should decide
what is urgent, and AI can probably help answer. A person still needs to be in
the loop. I also mentioned analytics, but I am not sure whether they belong in
the main flow. Make it useful for the people who will operate this process.

This request was dictated and is intentionally incomplete. Before drawing, use
the clarification workflow. After the answers are available, use the normalized
brief as the source of truth and reach for `$excalidraw-diagrams`
and `$plan-excalidraw-weak-llm`.
