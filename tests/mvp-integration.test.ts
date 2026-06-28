import { describe, expect, it } from "vitest";
import {
  AssetRegistry,
  PlacedNodeCard,
  Scene,
  assertDiagramHealthy,
  avoidOverlap,
  nodeCard,
  validateDiagram,
} from "../src/index.js";
import { DiagramEdge } from "../src/validate.js";
import { elementBounds } from "../src/geometry.js";

/**
 * Reaper-like two-row graph: long function names, two notes, and a reverse
 * execution row. The whole diagram is expressed with named nodes/edges/notes —
 * no numeric element indices — and must pass assertDiagramHealthy.
 */
function buildReaperDiagram(): {
  scene: Scene;
  cards: PlacedNodeCard[];
  notes: PlacedNodeCard[];
  edges: DiagramEdge[];
} {
  const scene = new Scene({ seed: 99, assetRegistry: AssetRegistry.bundled() });
  const width = 300;
  const colGap = 90;
  const rowGap = 90;
  const xs = [0, width + colGap, (width + colGap) * 2];

  // Planning row (left-to-right).
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
  const row1Bottom = Math.max(...planning.map((card) => card.bounds.bottom));
  const row2Y = row1Bottom + rowGap;

  // Execution row (reverse: right-to-left).
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

  const cards = [...planning, ...execution];

  // Two notes placed below the rows, intentionally overlapping each other so
  // the opt-in resolver has to separate them.
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

  // Resolve the note overlap (reading order preserved).
  const noteItems = notes.map((note) => ({ id: note.id, block: note.block, kind: "note" as const }));
  avoidOverlap(noteItems, { gap: 20 });
  for (const note of notes) {
    note.bounds = note.block.bounds;
  }

  const edges = [
    edge(scene, "p1", planning[0], "right", planning[1], "left"),
    edge(scene, "p2", planning[1], "right", planning[2], "left"),
    edge(scene, "down", planning[2], "bottom", execution[2], "top"),
    edge(scene, "x1", execution[2], "left", execution[1], "right"),
    edge(scene, "x2", execution[1], "left", execution[0], "right"),
  ];

  return { scene, cards, notes, edges };
}

function edge(
  scene: Scene,
  id: string,
  from: PlacedNodeCard,
  fromAnchor: string,
  to: PlacedNodeCard,
  toAnchor: string,
): DiagramEdge {
  const start = from.anchors[fromAnchor];
  const end = to.anchors[toAnchor];
  scene.arrow([start, end]);
  return { id, points: [start, end], from: from.id, to: to.id };
}

describe("reaper integration diagram", () => {
  it("passes assertDiagramHealthy with no overlaps and text inside frames", () => {
    const { cards, notes, edges } = buildReaperDiagram();
    const blocks = [...cards, ...notes].map((card) => ({
      id: card.id,
      bounds: card.bounds,
      overflowed: card.overflowed,
      texts: card.texts,
      padding: 0,
    }));

    const result = validateDiagram({ blocks, edges, gap: 16 });
    expect(result.errors, JSON.stringify(result.errors, null, 2)).toHaveLength(0);
    expect(() => assertDiagramHealthy({ blocks, edges, gap: 16 })).not.toThrow();

    // No card reports overflowed text.
    for (const card of cards) {
      expect(card.overflowed, `${card.id} overflowed`).toBe(false);
    }

    // Every text element lies within its card frame.
    for (const card of cards) {
      for (const text of card.texts) {
        const tb = elementBounds(text);
        expect(tb.left).toBeGreaterThanOrEqual(card.bounds.left - 1);
        expect(tb.right).toBeLessThanOrEqual(card.bounds.right + 1);
      }
    }
  });

  it("separates the two notes while keeping reading order", () => {
    const { notes } = buildReaperDiagram();
    expect(notes[0].id).toBe("note_invariant");
    expect(notes[1].id).toBe("note_followup");
    expect(notes[1].bounds.top).toBeGreaterThanOrEqual(notes[0].bounds.bottom);
  });
});
