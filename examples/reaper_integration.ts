import {
  AssetRegistry,
  PlacedNodeCard,
  Scene,
  assertDiagramHealthy,
  avoidOverlap,
  nodeCard,
} from "../src/index.ts";
import { DiagramEdge } from "../src/validate.ts";

// Advanced primitive proof. Most architecture diagrams should start from
// `diagram.flow(...)` instead; this file demonstrates the lower-level
// `nodeCard(...)`, `avoidOverlap(...)`, anchors, and explicit validation pieces
// that `diagram.flow(...)` orchestrates for the default authoring path.

const scene = new Scene({ seed: 99, assetRegistry: AssetRegistry.bundled() });
const width = 300;
const colGap = 90;
const rowGap = 90;
const xs = [0, width + colGap, (width + colGap) * 2];

const planning = [
  nodeCard(scene, {
    id: "strategy_decide",
    title: "Strategy.decide",
    bullets: ["reads RiskDecision.attributes", "emits approve / reject"],
    x: xs[0],
    y: 0,
    width,
  }),
  nodeCard(scene, {
    id: "approve_batch",
    title: "approve_batch_with_optional_reaper",
    bullets: ["batches pending approvals", "optional reaper sweep on timeout"],
    x: xs[1],
    y: 0,
    width,
  }),
  nodeCard(scene, {
    id: "risk_gate",
    title: "RiskDecision.attributes gate",
    bullets: ["validates exposure window", "short-circuits on breach"],
    x: xs[2],
    y: 0,
    width,
  }),
];

const row2Y = Math.max(...planning.map((card) => card.bounds.bottom)) + rowGap;

const execution = [
  nodeCard(scene, {
    id: "exec_persist",
    title: "persist_execution_row",
    bullets: ["writes ledger entry", "fans out to settlement"],
    x: xs[0],
    y: row2Y,
    width,
  }),
  nodeCard(scene, {
    id: "exec_route",
    title: "route_to_venue",
    bullets: ["selects venue by cost", "honors do_not_trade list"],
    x: xs[1],
    y: row2Y,
    width,
  }),
  nodeCard(scene, {
    id: "exec_intake",
    title: "intake_execution_request",
    bullets: ["normalizes payload", "stamps correlation id"],
    x: xs[2],
    y: row2Y,
    width,
  }),
];

const notesY = Math.max(...execution.map((card) => card.bounds.bottom)) + 60;
const notes = [
  nodeCard(scene, {
    id: "note_invariant",
    title: "Invariant",
    bullets: ["reaper never runs mid-batch"],
    x: 0,
    y: notesY,
    width: 260,
    color: "note",
  }),
  nodeCard(scene, {
    id: "note_followup",
    title: "Follow-up",
    bullets: ["measure reaper latency in p99"],
    x: 40,
    y: notesY + 24,
    width: 260,
    color: "note",
  }),
];

// Opt-in overlap resolution for the two notes (reading order preserved).
avoidOverlap(
  notes.map((note) => ({ id: note.id, block: note.block, kind: "note" as const })),
  { gap: 20 },
);
for (const note of notes) {
  note.bounds = note.block.bounds;
}

function edge(id: string, from: PlacedNodeCard, fromAnchor: string, to: PlacedNodeCard, toAnchor: string): DiagramEdge {
  const start = from.anchors[fromAnchor];
  const end = to.anchors[toAnchor];
  scene.arrow([start, end]);
  return { id, points: [start, end], from: from.id, to: to.id };
}

const edges = [
  edge("p1", planning[0], "right", planning[1], "left"),
  edge("p2", planning[1], "right", planning[2], "left"),
  edge("down", planning[2], "bottom", execution[2], "top"),
  edge("x1", execution[2], "left", execution[1], "right"),
  edge("x2", execution[1], "left", execution[0], "right"),
];

const blocks = [...planning, ...execution, ...notes].map((card) => ({
  id: card.id,
  bounds: card.bounds,
  overflowed: card.overflowed,
  texts: card.texts,
  padding: 0,
}));

// Validation gate — throws before write if the diagram is unhealthy.
const report = assertDiagramHealthy({ blocks, edges, gap: 16 });

const outPath = "examples/out/reaper_integration.excalidraw";
scene.write(outPath);

console.log(
  JSON.stringify(
    {
      excalidrawPath: outPath,
      elements: scene.elements.length,
      nodes: planning.length + execution.length,
      notes: notes.length,
      edges: edges.length,
      validation: { ok: report.ok, warnings: report.warnings.length, errors: report.errors.length },
    },
    null,
    2,
  ),
);
