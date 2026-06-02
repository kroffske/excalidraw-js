# Local LLM Layout v1 Report

Local package verification passed with `npm test` and `npm run release:check`.

The refreshed Pi skill in `~/.agents/skills/excalidraw-diagrams` includes the new `layout.tree(...)`, `secondaryEdges`, `sidecars`, and Mermaid `scenario: "tree"` guidance.

Initial local LLM verification did not pass. `Qwen3.6-27B-4bit` failed OMLX memory guard. `Qwen3-Coder-30B-A3B-Instruct-6bit` loaded, but in Pi it emitted pseudo tool-call text without executing tools; in no-tools mode it generated invalid TypeScript API usage.

Follow-up verification passed with the data-only path. The package now has `excalidraw-diagrams tree-spec spec.json --out output.excalidraw --png output.png`, and `Qwen3-Coder-30B-A3B-Instruct-6bit` returned a valid JSON tree spec. The CLI rendered it to `examples/out/local-llm-layout-v1/llm-json-plan-todo-session-tree.excalidraw` and `examples/out/local-llm-layout-v1/llm-json-plan-todo-session-tree.png`.

The deterministic eval artifact `examples/out/agent-evals/plan-todo-session-tree.png` and the local-model JSON artifact `examples/out/local-llm-layout-v1/llm-json-plan-todo-session-tree.png` were visually checked and are readable. The local-model result is sparse, but it uses the intended tree, secondary edge, and sidecar structure.
