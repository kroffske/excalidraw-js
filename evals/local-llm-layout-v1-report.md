# Local LLM Layout v1 Report

Local package verification passed with `npm test` and `npm run release:check`.

The refreshed Pi skill in `~/.agents/skills/excalidraw-diagrams` includes the new `layout.tree(...)`, `secondaryEdges`, `sidecars`, and Mermaid `scenario: "tree"` guidance.

Local LLM verification did not pass. `Qwen3.6-27B-4bit` failed OMLX memory guard. `Qwen3-Coder-30B-A3B-Instruct-6bit` loaded, but in Pi it emitted pseudo tool-call text without executing tools; in no-tools mode it generated invalid API usage. No valid local-LLM `.excalidraw` or PNG artifact was produced.

The deterministic eval artifact `examples/out/agent-evals/plan-todo-session-tree.png` was visually checked and is readable. Follow-up should add a compact tree generator template or command wrapper so the local model fills data instead of inventing a full script.
