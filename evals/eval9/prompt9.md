---
eval: eval9
slug: support-console-wireframe
diagram_title: Support operations console
thesis: Operators triage a shared priority queue, inspect one customer issue, review an AI draft, and explicitly approve the final reply.
layout_family: desktop application wireframe
mode: single
contract: visual
difficulty: medium
input_type: product-brief
models: local-omlx-qwen36-35b-a3b-4bit
samples: 1
output_dir: evals/run/<date>-eval9
---

Create a desktop UI wireframe for a support operations console. It needs a
left navigation with Inbox, Assigned, and Analytics; a middle priority queue
showing several tickets with urgency and age; and a large detail area for the
selected checkout-failure ticket. The detail view should summarize the customer
issue, show that an AI reply draft is ready, provide a reply composer, and make
human approval explicit through separate "Edit draft" and "Approve & send"
actions. The hierarchy should be realistic enough to discuss with product and
operations stakeholders.

Use `$plan-excalidraw-weak-visual` and `$excalidraw-diagrams`.
