// W1 of T-145: closed schema + diagnostics for `flow.band`.
// Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.1), A7/A9.
import { describe, expect, it } from "vitest";
import {
  BandFlowSpec,
  DEFAULT_MAX_BAND_WIDTH,
  validateBandFlowSpec,
} from "../src/semantic-band.js";
import type { DiagramDiagnostic, DiagramDiagnosticCode } from "../src/semantic-schema.js";

function spec(): BandFlowSpec {
  return {
    template: "flow.band",
    title: "LIVE smoke workflow",
    subtitle: "two sequential agent sessions",
    lanes: [
      { id: "operator", label: "OPERATOR" },
      { id: "workflow", label: "WORKFLOW", sublabel: "orchestration and checks" },
      { id: "agents", label: "FULL AGENT SESSIONS" },
    ],
    stages: [
      { id: "intake", label: "intake" },
      { id: "prepare" },
      { id: "run" },
    ],
    nodes: [
      { id: "request", lane: "operator", stage: "intake", type: "actor", title: "Operator request" },
      {
        id: "check",
        lane: "workflow",
        stage: "intake",
        type: "decision",
        title: "Input check",
        details: ["non-empty string after trim?"],
      },
      { id: "topic", lane: "workflow", stage: "prepare", type: "step", title: "Use supplied topic" },
      { id: "explore", lane: "agents", stage: "run", type: "agent", title: "Agent: explore" },
      { id: "journal", lane: "workflow", stage: "run", type: "artifact", title: "journal.ndjson" },
    ],
    edges: [
      { from: "request", to: "check", label: "optional input" },
      { from: "check", to: "topic" },
      { from: "topic", to: "explore" },
      { from: "explore", to: "journal", kind: "provenance" },
    ],
  };
}

function codes(diagnostics: DiagramDiagnostic[]): DiagramDiagnosticCode[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

function reject(mutate: (draft: Record<string, unknown>) => void): DiagramDiagnostic[] {
  const draft = spec() as unknown as Record<string, unknown>;
  mutate(draft);
  const result = validateBandFlowSpec(draft);
  expect(result.ok).toBe(false);
  return result.diagnostics;
}

describe("validateBandFlowSpec — accepted spec", () => {
  it("normalizes defaults without touching the input", () => {
    const input = spec();
    const result = validateBandFlowSpec(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.layout.maxBandWidth).toBe(DEFAULT_MAX_BAND_WIDTH);
    expect(result.value.legend).toBe("auto");
    expect(result.value.edges[0].kind).toBe("primary");
    // E9: normalization happens on a copy.
    expect(input.legend).toBeUndefined();
    expect(input.edges[0].kind).toBeUndefined();
  });

  it("derives edge ids from the pair and disambiguates by kind only when needed", () => {
    const draft = spec();
    draft.edges.push({ from: "topic", to: "explore", kind: "feedback", label: "retry" });
    const result = validateBandFlowSpec(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const ids = result.value.edges.map((edge) => edge.id);
    expect(ids).toContain("request->check");
    expect(ids).toContain("topic->explore:primary");
    expect(ids).toContain("topic->explore:feedback");
  });

  it("keeps an authored edge id", () => {
    const draft = spec();
    draft.edges[0].id = "operator-input";
    const result = validateBandFlowSpec(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.edges[0].id).toBe("operator-input");
  });

  it("A9: reordering stages keeps every node bound to its stage by id", () => {
    const draft = spec();
    draft.stages = [draft.stages[2], draft.stages[0], draft.stages[1]];
    const result = validateBandFlowSpec(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.nodes.map((node) => `${node.id}:${node.stage}`)).toEqual([
      "request:intake",
      "check:intake",
      "topic:prepare",
      "explore:run",
      "journal:run",
    ]);
  });
});

describe("validateBandFlowSpec — structural diagnostics", () => {
  it("rejects a non-object document", () => {
    const result = validateBandFlowSpec("nope");
    expect(result.ok).toBe(false);
    expect(codes(result.diagnostics)).toContain("INVALID_DOCUMENT");
  });

  it("rejects an unknown template and unknown fields", () => {
    expect(codes(reject((draft) => {
      draft.template = "flow.swimlane";
    }))).toContain("UNSUPPORTED_TEMPLATE");
    expect(codes(reject((draft) => {
      draft.targetAspect = 1.2;
    }))).toContain("UNKNOWN_FIELD");
    expect(codes(reject((draft) => {
      (draft.layout as Record<string, unknown>) = { repeatLaneHeaders: true };
    }))).toContain("UNKNOWN_FIELD");
  });

  it("rejects a boolean legend and keeps the enum single-typed", () => {
    const diagnostics = reject((draft) => {
      draft.legend = false;
    });
    expect(codes(diagnostics)).toContain("INVALID_STRING");
    expect(diagnostics[0].path).toBe("$.legend");
  });

  it("S4: a numeric stage reference is not a stage id", () => {
    const diagnostics = reject((draft) => {
      (draft.nodes as Array<Record<string, unknown>>)[0].stage = 0;
    });
    expect(codes(diagnostics)).toContain("INVALID_STRING");
  });
});

describe("validateBandFlowSpec — one negative fixture per code (A7)", () => {
  const cases: Array<{ code: DiagramDiagnosticCode; path?: string; mutate: (draft: Record<string, unknown>) => void }> = [
    {
      code: "INVALID_LANE_COUNT",
      mutate: (draft) => {
        draft.lanes = [{ id: "only", label: "Only" }];
        draft.nodes = [
          { id: "request", lane: "only", stage: "intake", type: "step", title: "Request" },
        ];
        draft.edges = [];
      },
    },
    {
      code: "INVALID_STAGE_COUNT",
      mutate: (draft) => {
        draft.stages = Array.from({ length: 13 }, (_, index) => ({ id: `s${index}` }));
      },
    },
    {
      code: "INVALID_NODE_COUNT",
      mutate: (draft) => {
        draft.nodes = [];
      },
    },
    {
      code: "INVALID_EDGE_COUNT",
      mutate: (draft) => {
        draft.edges = Array.from({ length: 41 }, () => ({ from: "request", to: "check" }));
      },
    },
    {
      code: "INVALID_NODE_TYPE",
      path: "$.nodes[0].type",
      mutate: (draft) => {
        (draft.nodes as Array<Record<string, unknown>>)[0].type = "operator";
      },
    },
    {
      code: "INVALID_EDGE_KIND",
      path: "$.edges[0].kind",
      mutate: (draft) => {
        (draft.edges as Array<Record<string, unknown>>)[0].kind = "dashed";
      },
    },
    {
      code: "INVALID_BAND_WIDTH",
      path: "$.layout.maxBandWidth",
      mutate: (draft) => {
        draft.layout = { maxBandWidth: 3200 };
      },
    },
    {
      code: "UNKNOWN_STAGE",
      path: "$.nodes[0].stage",
      mutate: (draft) => {
        (draft.nodes as Array<Record<string, unknown>>)[0].stage = "missing";
      },
    },
    {
      code: "UNKNOWN_NODE_LANE",
      path: "$.nodes[0].lane",
      mutate: (draft) => {
        (draft.nodes as Array<Record<string, unknown>>)[0].lane = "missing";
      },
    },
    {
      code: "UNKNOWN_EDGE_ENDPOINT",
      path: "$.edges[0].to",
      mutate: (draft) => {
        (draft.edges as Array<Record<string, unknown>>)[0].to = "missing";
      },
    },
    {
      code: "SELF_EDGE",
      path: "$.edges[0]",
      mutate: (draft) => {
        (draft.edges as Array<Record<string, unknown>>)[0].from = "check";
      },
    },
    {
      code: "DUPLICATE_EDGE_PAIR",
      mutate: (draft) => {
        (draft.edges as Array<Record<string, unknown>>).push({ from: "request", to: "check" });
      },
    },
    {
      code: "DUPLICATE_ID",
      mutate: (draft) => {
        (draft.stages as Array<Record<string, unknown>>)[0].id = "operator";
      },
    },
    {
      code: "EMPTY_LANE",
      mutate: (draft) => {
        (draft.lanes as Array<Record<string, unknown>>).push({ id: "artifacts", label: "ARTIFACTS" });
      },
    },
    {
      code: "FLOW_CELL_CAPACITY_EXCEEDED",
      mutate: (draft) => {
        const nodes = draft.nodes as Array<Record<string, unknown>>;
        for (const suffix of ["a", "b", "c"]) {
          nodes.push({
            id: `extra-${suffix}`,
            lane: "workflow",
            stage: "prepare",
            type: "step",
            title: `Extra ${suffix}`,
          });
        }
      },
    },
    {
      code: "STRING_TOO_LONG",
      path: "$.nodes[1].details",
      mutate: (draft) => {
        (draft.nodes as Array<Record<string, unknown>>)[1].details = ["a", "b", "c", "d", "e"];
      },
    },
    {
      code: "MISSING_FIELD",
      path: "$.stages",
      mutate: (draft) => {
        delete draft.stages;
      },
    },
  ];

  it.each(cases)("$code", ({ code, path, mutate }) => {
    const diagnostics = reject(mutate);
    const match = diagnostics.find((diagnostic) => diagnostic.code === code);
    expect(match, `expected ${code}, got ${codes(diagnostics).join(", ")}`).toBeDefined();
    if (path) {
      expect(match!.path).toBe(path);
    }
  });
});

describe("validateBandFlowSpec — cycles are a semantic decision, not a style (A2/A7)", () => {
  function withBackEdge(kind: "primary" | "feedback"): BandFlowSpec {
    const draft = spec();
    draft.edges.push({ from: "explore", to: "check", kind, label: "retry" });
    return draft;
  }

  it("rejects a cycle built from primary edges and names the repair", () => {
    const result = validateBandFlowSpec(withBackEdge("primary"));
    expect(result.ok).toBe(false);
    const cycle = result.diagnostics.find((diagnostic) => diagnostic.code === "CYCLIC_FLOW");
    expect(cycle).toBeDefined();
    expect(cycle!.hint).toBe('Mark the back edge kind: "feedback".');
  });

  it("accepts the same graph once the back edge is marked feedback", () => {
    expect(validateBandFlowSpec(withBackEdge("feedback")).ok).toBe(true);
  });

  it("provenance edges never participate in the cycle check", () => {
    const draft = spec();
    draft.edges.push({ from: "journal", to: "topic", kind: "provenance" });
    expect(validateBandFlowSpec(draft).ok).toBe(true);
  });
});
