// A12 of T-145: the lexicon is a checked artifact, not prose. Contract:
// docs/system-design/flow-band/flow-band-contract.md — P14, A12.
// Rename a field without touching docs/system-design/dsl-lexicon.md and this fails.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BAND_EDGE_FIELDS,
  BAND_EDGE_KINDS,
  BAND_LANE_FIELDS,
  BAND_LAYOUT_FIELDS,
  BAND_NODE_FIELDS,
  BAND_NODE_TYPES,
  BAND_ROOT_FIELDS,
  BAND_STAGE_FIELDS,
} from "../src/semantic-band.js";

const LEXICON = readFileSync(
  new URL("../docs/system-design/dsl-lexicon.md", import.meta.url),
  "utf8",
);

/** Rows are `| term | concept | surfaces |`; the term cell is a single backticked name. */
interface LexiconRow {
  term: string;
  concept: string;
}

function rows(): LexiconRow[] {
  const parsed: LexiconRow[] = [];
  for (const line of LEXICON.split("\n")) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (match) {
      parsed.push({ term: match[1], concept: match[2] });
    }
  }
  return parsed;
}

/** `layout.maxBandWidth` is written with its container in the exceptions table. */
function leafTerm(term: string): string {
  return term.split(".").pop()!;
}

describe("A12(1): every model-facing name has a lexicon row", () => {
  const known = new Set(rows().map((row) => leafTerm(row.term)));

  const vocabulary: Array<[string, readonly string[]]> = [
    ["root field", BAND_ROOT_FIELDS],
    ["layout field", BAND_LAYOUT_FIELDS],
    ["lane field", BAND_LANE_FIELDS],
    ["stage field", BAND_STAGE_FIELDS],
    ["node field", BAND_NODE_FIELDS],
    ["edge field", BAND_EDGE_FIELDS],
    ["node type", BAND_NODE_TYPES],
    ["edge kind", BAND_EDGE_KINDS],
  ];

  it.each(vocabulary)("%s names are all documented", (_label, names) => {
    expect(names.filter((name) => !known.has(name))).toEqual([]);
  });
});

describe("A12(2): the mapping term<->concept is one-to-one", () => {
  it("no two terms describe the same concept", () => {
    const byConcept = new Map<string, string[]>();
    for (const row of rows()) {
      byConcept.set(row.concept, [...(byConcept.get(row.concept) ?? []), row.term]);
    }
    const collisions = [...byConcept.entries()]
      .filter(([, terms]) => new Set(terms).size > 1)
      .map(([concept, terms]) => `${concept}: ${terms.join(", ")}`);
    expect(collisions).toEqual([]);
  });

  it("no term carries two concepts", () => {
    const byTerm = new Map<string, string[]>();
    for (const row of rows()) {
      byTerm.set(row.term, [...(byTerm.get(row.term) ?? []), row.concept]);
    }
    const collisions = [...byTerm.entries()]
      .filter(([, concepts]) => new Set(concepts).size > 1)
      .map(([term, concepts]) => `${term}: ${concepts.join(" / ")}`);
    expect(collisions).toEqual([]);
  });
});

describe("A12(3): input field names carry no geometry or position", () => {
  // A weak model guesses `direction: left` and misreads `stage: 3`. This ban is the
  // mechanical half of that principle.
  const BANNED = /index|idx|pos|order|offset|^x$|^y$|width|height/i;
  const DECLARED_EXCEPTIONS = new Set(["maxBandWidth"]);

  const inputFields = [
    ...BAND_ROOT_FIELDS,
    ...BAND_LAYOUT_FIELDS,
    ...BAND_LANE_FIELDS,
    ...BAND_STAGE_FIELDS,
    ...BAND_NODE_FIELDS,
    ...BAND_EDGE_FIELDS,
  ];

  it("only the declared exception uses a banned word", () => {
    const offenders = inputFields.filter(
      (field) => BANNED.test(field) && !DECLARED_EXCEPTIONS.has(field),
    );
    expect(offenders).toEqual([]);
  });

  it("each exception is declared in the lexicon, not just in this test", () => {
    for (const exception of DECLARED_EXCEPTIONS) {
      expect(LEXICON).toContain(`layout.${exception}`);
      expect(LEXICON).toContain("Declared exception");
    }
  });
});

describe("A12(4): references between elements are id strings, never numbers", () => {
  it("a numeric reference is rejected by the schema", async () => {
    const { validateBandFlowSpec } = await import("../src/semantic-band.js");
    const base = {
      template: "flow.band",
      title: "Reference typing",
      lanes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      stages: [{ id: "one" }],
      nodes: [
        { id: "first", lane: "a", stage: "one", type: "step", title: "First" },
        { id: "second", lane: "b", stage: "one", type: "step", title: "Second" },
      ],
      edges: [{ from: "first", to: "second" }],
    };

    // Position addressing is exactly what the principle forbids: a lane by number, a
    // stage by number, an edge endpoint by number.
    for (const mutation of [
      { nodes: [{ ...base.nodes[0], lane: 0 }, base.nodes[1]] },
      { nodes: [{ ...base.nodes[0], stage: 0 }, base.nodes[1]] },
      { edges: [{ from: 0, to: 1 }] },
    ]) {
      const result = validateBandFlowSpec({ ...base, ...mutation });
      expect(result.ok, JSON.stringify(mutation)).toBe(false);
    }
  });
});
