---
eval: eval8
slug: course-schedule-kahn
diagram_title: Course Schedule — Kahn's algorithm
thesis: Courses become available when all prerequisites are removed; processing every course proves the schedule is possible, while leftover indegree reveals a cycle.
layout_family: process-spine with graph example and decision branch
mode: single
contract: graph
difficulty: hard
input_type: documentation
models: local-omlx-qwen36-35b-a3b-4bit
samples: 1
output_dir: evals/run/<date>-eval8
---

Draw a one-screen algorithm overview from the documentation below. The audience
knows arrays and queues but is learning graph algorithms. Make the main Kahn
process and its success/failure decision unmistakable. The picture must also
preserve the worked acyclic example, the separate two-node cycle example, and
the documented `O(V + E)` complexity; none of those three items is optional.

## Documentation excerpt

Course Schedule asks whether all courses can be completed given prerequisite
pairs. Treat every course as a vertex and every prerequisite as a directed edge.
Build an adjacency list and an indegree count. Put every zero-indegree course in
a queue. Repeatedly pop one course, count it as completed, remove its outgoing
edges, and enqueue neighbors whose indegree becomes zero. If the processed count
equals the number of courses, a valid topological order exists. If some courses
remain with positive indegree, the graph contains a cycle and the schedule is
impossible.

Use this small example in the overview: prerequisites `0 -> 1`, `0 -> 2`,
`1 -> 3`, `2 -> 3`. Initial indegrees are `[0, 1, 1, 2]`; processing 0 unlocks
1 and 2, then both unlock 3. A separate short cycle example `0 -> 1 -> 0`
should explain the failure branch. Complexity: `O(V + E)` time and space.

Use `$plan-excalidraw-graph`, `$plan-excalidraw-weak-llm`, and
`$excalidraw-diagrams`.
