import { BLUE, GRAY, Scene } from "../src/index.ts";

// "BEFORE" proof: the pre-MVP path. Fixed-size cards with `scene.text` (which
// only breaks on explicit \n) — long function names overflow the frame, and two
// hand-placed notes collide because nothing resolves the overlap. Rendered for
// the human before/after gate; intentionally NOT run through validateDiagram.

const scene = new Scene({ seed: 99 });
const width = 300;
const height = 96;
const colGap = 90;
const xs = [0, width + colGap, (width + colGap) * 2];

interface OldCard {
  title: string;
  bullets: string[];
}

const planning: OldCard[] = [
  { title: "Strategy.decide", bullets: ["reads RiskDecision.attributes", "emits approve / reject"] },
  {
    title: "approve_batch_with_optional_reaper",
    bullets: ["batches pending approvals", "optional reaper sweep on timeout"],
  },
  { title: "RiskDecision.attributes gate", bullets: ["validates exposure window", "short-circuits on breach"] },
];

planning.forEach((card, index) => {
  const x = xs[index];
  scene.rect(x, 0, width, height, { color: BLUE, strokeWidth: 1 });
  // No wrapping: long titles run past the right edge of the card.
  scene.text(x + 14, 14, card.title, { size: 17, color: BLUE });
  card.bullets.forEach((bullet, bulletIndex) => {
    scene.text(x + 14, 48 + bulletIndex * 22, `- ${bullet}`, { size: 13, color: BLUE });
  });
});

// Two notes placed by hand, overlapping — nothing pushes them apart.
const noteY = height + 90;
scene.rect(0, noteY, 260, 70, { color: GRAY, strokeWidth: 1 });
scene.text(14, noteY + 12, "Invariant", { size: 14, color: GRAY });
scene.text(14, noteY + 36, "- reaper never runs mid-batch", { size: 12, color: GRAY });

scene.rect(40, noteY + 24, 260, 70, { color: GRAY, strokeWidth: 1 });
scene.text(54, noteY + 36, "Follow-up", { size: 14, color: GRAY });
scene.text(54, noteY + 60, "- measure reaper latency in p99", { size: 12, color: GRAY });

const outPath = "examples/out/reaper_before.excalidraw";
scene.write(outPath);
console.log(JSON.stringify({ excalidrawPath: outPath, elements: scene.elements.length }, null, 2));
