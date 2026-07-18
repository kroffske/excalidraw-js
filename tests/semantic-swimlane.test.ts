import {
  DiagramSpec,
  DiagramDiagnosticCode,
  SequenceInteractionSpec,
  SwimlaneFlowSpec,
  buildDiagramSpec,
  validateDiagramSpec,
  validateNativeBindings,
} from "../src/index.js";
import { elementBounds } from "../src/geometry.js";
import {
  buildC4DiagramSpec,
  validateC4DiagramSpec,
} from "../src/semantic-c4.js";
import {
  buildSequenceDiagramSpec,
  validateSequenceDiagramSpec,
} from "../src/semantic-sequence.js";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});

function spec(): SwimlaneFlowSpec {
  return {
    template: "flow.swimlane",
    title: "Release ownership",
    lanes: [
      { id: "product", label: "Product" },
      { id: "engineering", label: "Engineering" },
    ],
    activities: [
      { id: "request", lane: "product", type: "step", title: "Request release" },
      { id: "approve", lane: "engineering", type: "decision", title: "Approve release" },
      { id: "report", lane: "product", type: "artifact", title: "Release report" },
    ],
    transitions: [
      { id: "review", from: "request", to: "approve", label: "review" },
      { id: "publish", from: "approve", to: "report" },
    ],
  };
}

function expectDiagnostic(
  value: unknown,
  code: DiagramDiagnosticCode,
  path: string,
  options: Parameters<typeof validateDiagramSpec>[1] = {},
): void {
  const validation = validateDiagramSpec(value, options);
  expect(validation.ok).toBe(false);
  expect(validation.diagnostics).toContainEqual(
    expect.objectContaining({ code, path, severity: "error" }),
  );

  const build = buildDiagramSpec(value, options);
  expect(build.ok).toBe(false);
  expect("scene" in build).toBe(false);
}

describe("flow.swimlane validation contract", () => {
  it("normalizes strings and derives root-zero longest-path depths", () => {
    const value = spec();
    value.title = "  Release ownership  ";
    value.lanes[0].label = "  Product  ";
    value.activities[0].title = "  Request release  ";
    value.transitions[0].label = "  review  ";

    const result = validateDiagramSpec(value);

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.template !== "flow.swimlane") {
      return;
    }
    expect(result.value.title).toBe("Release ownership");
    expect(result.value.lanes[0].label).toBe("Product");
    expect(result.value.activities.map(({ id, depth }) => [id, depth])).toEqual([
      ["request", 0],
      ["approve", 1],
      ["report", 2],
    ]);
    expect(result.value.transitions[0].label).toBe("review");
    expect(result.diagnostics).toEqual([]);
  });

  it.each([
    ["root", (value: SwimlaneFlowSpec) => ({ ...value, invented: true }), "$.invented"],
    [
      "lane",
      (value: SwimlaneFlowSpec) => ({
        ...value,
        lanes: [{ ...value.lanes[0], invented: true }, value.lanes[1]],
      }),
      "$.lanes[0].invented",
    ],
    [
      "activity",
      (value: SwimlaneFlowSpec) => ({
        ...value,
        activities: [{ ...value.activities[0], invented: true }, ...value.activities.slice(1)],
      }),
      "$.activities[0].invented",
    ],
    [
      "transition",
      (value: SwimlaneFlowSpec) => ({
        ...value,
        transitions: [{ ...value.transitions[0], invented: true }, value.transitions[1]],
      }),
      "$.transitions[0].invented",
    ],
  ])("rejects unknown fields at the %s level", (_level, mutate, path) => {
    expectDiagnostic(mutate(spec()), "UNKNOWN_FIELD", path);
  });

  it("enforces exact counts, types, references, and one id namespace", () => {
    const oneLane = spec();
    oneLane.lanes = [oneLane.lanes[0]];
    oneLane.activities = oneLane.activities.map((activity) => ({
      ...activity,
      lane: "product",
    }));
    expectDiagnostic(oneLane, "INVALID_LANE_COUNT", "$.lanes");

    const oneActivity = spec();
    oneActivity.activities = [oneActivity.activities[0]];
    oneActivity.transitions = [];
    expectDiagnostic(oneActivity, "INVALID_ACTIVITY_COUNT", "$.activities");
    expectDiagnostic(oneActivity, "INVALID_TRANSITION_COUNT", "$.transitions");

    const invalidType = spec();
    (invalidType.activities[0] as { type: string }).type = "task";
    expectDiagnostic(invalidType, "INVALID_ACTIVITY_TYPE", "$.activities[0].type");

    const unknownLane = spec();
    unknownLane.activities[0].lane = "missing";
    expectDiagnostic(unknownLane, "UNKNOWN_ACTIVITY_LANE", "$.activities[0].lane");

    const emptyLane = spec();
    emptyLane.activities = emptyLane.activities.map((activity) => ({
      ...activity,
      lane: "product",
    }));
    expectDiagnostic(emptyLane, "EMPTY_LANE", "$.lanes[1]");

    const unknownEndpoint = spec();
    unknownEndpoint.transitions[0].from = "missing";
    expectDiagnostic(
      unknownEndpoint,
      "UNKNOWN_TRANSITION_ENDPOINT",
      "$.transitions[0].from",
    );

    const duplicateId = spec();
    duplicateId.transitions[0].id = duplicateId.lanes[0].id;
    expectDiagnostic(duplicateId, "DUPLICATE_ID", "$.transitions[0].id");
  });

  it.each([
    {
      field: "lanes",
      accepted: maximumLaneSpec(5),
      rejected: maximumLaneSpec(6),
      code: "INVALID_LANE_COUNT" as const,
      path: "$.lanes",
    },
    {
      field: "activities",
      accepted: maximumActivitySpec(16),
      rejected: maximumActivitySpec(17),
      code: "INVALID_ACTIVITY_COUNT" as const,
      path: "$.activities",
    },
    {
      field: "transitions",
      accepted: maximumTransitionSpec(24),
      rejected: maximumTransitionSpec(25),
      code: "INVALID_TRANSITION_COUNT" as const,
      path: "$.transitions",
    },
  ])("accepts the exact $field cap and rejects cap plus one", ({
    accepted,
    rejected,
    code,
    path,
  }) => {
    expect(validateDiagramSpec(accepted)).toMatchObject({
      ok: true,
      diagnostics: [],
    });
    expectDiagnostic(rejected, code, path);
  });

  it.each([
    {
      field: "title",
      limit: 80,
      path: "$.title",
      mutate: (value: SwimlaneFlowSpec, text: string) => {
        value.title = text;
      },
    },
    {
      field: "lane label",
      limit: 48,
      path: "$.lanes[0].label",
      mutate: (value: SwimlaneFlowSpec, text: string) => {
        value.lanes[0].label = text;
      },
    },
    {
      field: "activity title",
      limit: 80,
      path: "$.activities[0].title",
      mutate: (value: SwimlaneFlowSpec, text: string) => {
        value.activities[0].title = text;
      },
    },
    {
      field: "transition label",
      limit: 48,
      path: "$.transitions[0].label",
      mutate: (value: SwimlaneFlowSpec, text: string) => {
        value.transitions[0].label = text;
      },
    },
  ])("accepts exact maximum $field length and rejects maximum plus one", ({
    limit,
    path,
    mutate,
  }) => {
    const accepted = spec();
    mutate(accepted, "x".repeat(limit));
    expect(validateDiagramSpec(accepted)).toMatchObject({
      ok: true,
      diagnostics: [],
    });

    const rejected = spec();
    mutate(rejected, "x".repeat(limit + 1));
    expectDiagnostic(rejected, "STRING_TOO_LONG", path);
  });

  it("enforces the exact id grammar, length cap, and finite integer seed", () => {
    const exactMax = spec();
    exactMax.activities[0].id = "a".repeat(64);
    exactMax.transitions[0].from = exactMax.activities[0].id;
    expect(validateDiagramSpec(exactMax)).toMatchObject({
      ok: true,
      diagnostics: [],
    });

    const invalid = spec();
    invalid.activities[0].id = "1-invalid";
    expectDiagnostic(invalid, "INVALID_ID", "$.activities[0].id");

    const overlength = spec();
    overlength.activities[0].id = "a".repeat(65);
    expectDiagnostic(overlength, "INVALID_ID", "$.activities[0].id");

    expectDiagnostic(
      spec(),
      "INVALID_SEED",
      "$.seed",
      { seed: Number.NaN },
    );
    expectDiagnostic(spec(), "INVALID_SEED", "$.seed", { seed: 1.5 });
  });

  it("keeps multi-error diagnostics in deterministic schema and input order", () => {
    const value = maximumLaneSpec(6) as SwimlaneFlowSpec & {
      invented?: boolean;
    };
    value.activities = [
      { id: "first", lane: "lane-0", type: "step", title: "First" },
      { id: "second", lane: "lane-1", type: "step", title: "Second" },
    ];
    value.transitions = [
      { id: "same", from: "first", to: "second" },
      { id: "same", from: "first", to: "second" },
    ];
    value.invented = true;

    const result = validateDiagramSpec(value, { seed: 1.5 });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code, path }) => [code, path])).toEqual([
      ["INVALID_LANE_COUNT", "$.lanes"],
      ["EMPTY_LANE", "$.lanes[2]"],
      ["DUPLICATE_ID", "$.transitions[1].id"],
      ["DUPLICATE_TRANSITION_PAIR", "$.transitions[1].to"],
      ["UNKNOWN_FIELD", "$.invented"],
      ["INVALID_SEED", "$.seed"],
    ]);
    expect(validateDiagramSpec(structuredClone(value), { seed: 1.5 }))
      .toEqual(result);
  });

  it("rejects line breaks and preserves required activity type", () => {
    const lineBreak = spec();
    lineBreak.activities[0].title = "First\nSecond";
    expectDiagnostic(lineBreak, "INVALID_STRING", "$.activities[0].title");

    const missingType = spec();
    delete (missingType.activities[0] as Partial<typeof missingType.activities[number]>).type;
    expectDiagnostic(missingType, "MISSING_FIELD", "$.activities[0].type");
  });

  it("rejects self, duplicate, cyclic, over-depth, and over-capacity flows", () => {
    const self = spec();
    self.transitions[0].to = self.transitions[0].from;
    expectDiagnostic(self, "SELF_TRANSITION", "$.transitions[0].to");

    const duplicate = spec();
    duplicate.transitions[1] = {
      id: "review-again",
      from: "request",
      to: "approve",
    };
    expectDiagnostic(
      duplicate,
      "DUPLICATE_TRANSITION_PAIR",
      "$.transitions[1].to",
    );

    const cyclic = spec();
    cyclic.transitions.push({ id: "cycle", from: "report", to: "request" });
    expectDiagnostic(cyclic, "CYCLIC_FLOW", "$.transitions[0]");
    expect(validateDiagramSpec(cyclic).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "CYCLIC_FLOW",
        hint: "Remove retry/back edges or describe them in a separate acyclic view.",
      }),
    );

    const deep = chainSpec(8);
    expectDiagnostic(deep, "FLOW_DEPTH_EXCEEDED", "$.activities[7]");
    expect(validateDiagramSpec(deep).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "FLOW_DEPTH_EXCEEDED",
        hint: "Shorten the longest chain or split the flow into multiple diagrams.",
      }),
    );

    const crowded = capacitySpec();
    expectDiagnostic(
      crowded,
      "FLOW_CELL_CAPACITY_EXCEEDED",
      "$.activities[3]",
    );
    expect(validateDiagramSpec(crowded).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "FLOW_CELL_CAPACITY_EXCEEDED",
        hint: "Move an activity to another lane/depth or split the flow.",
      }),
    );
  });

  it("keeps exact flow dispatch additive to legacy template diagnostics", () => {
    const malformedFlow = {
      template: "flow.swimlane",
      title: "Malformed",
      lanes: [],
      activities: [],
      transitions: [],
    };
    expectDiagnostic(malformedFlow, "INVALID_LANE_COUNT", "$.lanes");

    const legacyUnsupported = validateDiagramSpec({
      template: "flow.swimlane.v2",
      title: "Unsupported",
    });
    expect(legacyUnsupported).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "UNSUPPORTED_TEMPLATE",
          path: "$.template",
          message: "unsupported template 'flow.swimlane.v2'",
          hint: "Use 'c4.container'.",
        },
        {
          severity: "error",
          code: "MISSING_FIELD",
          path: "$.system",
          message: "required field 'system' is missing",
        },
      ],
    });
  });

  it("keeps fixed C4 and sequence public dispatch projections unchanged and unbound", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T02:00:00.000Z"));
    const c4 = fixedC4Spec();
    const sequence = fixedSequenceSpec();

    expect(validateDiagramSpec(c4)).toEqual(validateC4DiagramSpec(c4));
    expect(validateDiagramSpec(sequence)).toEqual(
      validateSequenceDiagramSpec(sequence),
    );

    const publicC4 = buildDiagramSpec(c4, { seed: 404 });
    const directC4 = buildC4DiagramSpec(c4, { seed: 404 });
    expect(publicC4).toEqual(directC4);
    expect(publicC4.ok).toBe(true);
    if (!publicC4.ok) {
      return;
    }
    expect(publicC4.scene.elements.map((element) => element.type)).toEqual([
      "text",
      "rectangle", "text", "rectangle", "text", "text",
      "rectangle", "text", "rectangle", "text", "text",
      "rectangle", "text",
      "arrow", "text",
    ]);
    expectLegacyUnboundProjection(publicC4.scene.elements);

    const publicSequence = buildDiagramSpec(sequence, { seed: 404 });
    const directSequence = buildSequenceDiagramSpec(sequence, { seed: 404 });
    expect(publicSequence).toEqual(directSequence);
    expect(publicSequence.ok).toBe(true);
    if (!publicSequence.ok) {
      return;
    }
    expect(publicSequence.scene.elements.map((element) => element.type)).toEqual([
      "text",
      "rectangle", "text",
      "rectangle", "text",
      "line", "line",
      "arrow", "text",
    ]);
    expectLegacyUnboundProjection(publicSequence.scene.elements);
  });
});

describe("flow.swimlane renderer", () => {
  it("renders measured semantic cards, dashed artifacts, metadata, and bindings", () => {
    const result = buildDiagramSpec(spec(), { seed: 77 });

    expect(result.ok).toBe(true);
    if (!result.ok || result.metadata.template !== "flow.swimlane") {
      return;
    }
    expect(result.geometry).toEqual({
      ok: true,
      issues: [],
      errors: [],
      warnings: [],
    });
    expect(result.metadata.lanes.map((lane) => lane.id)).toEqual([
      "product",
      "engineering",
    ]);
    expect(result.metadata.activities.map(({ id, depth }) => [id, depth])).toEqual([
      ["request", 0],
      ["approve", 1],
      ["report", 2],
    ]);
    expect(result.metadata.transitions.map((transition) => transition.id)).toEqual([
      "review",
      "publish",
    ]);

    const elementsById = new Map(
      result.scene.elements.map((element) => [String(element.id), element]),
    );
    for (const activity of result.metadata.activities) {
      const elements = activity.elementIds.map((id) => elementsById.get(id)!);
      expect(elements.some(
        (element) =>
          element.type === "text"
          && element.text === activity.type.toUpperCase(),
      )).toBe(true);
      const frame = elementsById.get(activity.frameElementId)!;
      expect(frame.type).toBe("rectangle");
      expect(elementBounds(frame)).toEqual(activity.bounds);
      expect(frame.strokeStyle).toBe(
        activity.type === "artifact" ? "dashed" : "solid",
      );
      if (activity.type === "artifact") {
        const nonFrameRectangles = elements.filter(
          (element) =>
            element.type === "rectangle"
            && element.id !== activity.frameElementId,
        );
        expect(nonFrameRectangles.every((element) => element.strokeStyle === "solid"))
          .toBe(true);
      }
    }

    expect(validateNativeBindings(result.scene.elements)).toEqual({
      valid: true,
      issues: [],
    });
    for (const transition of result.metadata.transitions) {
      const arrow = elementsById.get(transition.arrowElementId)!;
      expect(arrow.startBinding).toMatchObject({ mode: "inside" });
      expect(arrow.endBinding).toMatchObject({ mode: "inside" });
      for (const field of ["startBinding", "endBinding"] as const) {
        const targetId = (arrow[field] as { elementId: string }).elementId;
        const target = elementsById.get(targetId)!;
        expect(target.boundElements).toContainEqual({
          id: transition.arrowElementId,
          type: "arrow",
        });
      }
    }
  });

  it("stacks same-cell activities in input order and keeps them inside lanes", () => {
    const value = spec();
    value.activities.splice(
      1,
      0,
      { id: "request-two", lane: "product", type: "step", title: "Second request" },
    );
    value.transitions = [
      { id: "review-one", from: "request", to: "approve" },
      { id: "review-two", from: "request-two", to: "approve" },
      { id: "publish", from: "approve", to: "report" },
    ];

    const result = buildDiagramSpec(value, { seed: 81 });

    expect(result.ok).toBe(true);
    if (!result.ok || result.metadata.template !== "flow.swimlane") {
      return;
    }
    const first = result.metadata.activities.find(({ id }) => id === "request")!;
    const second = result.metadata.activities.find(({ id }) => id === "request-two")!;
    expect(first.depth).toBe(0);
    expect(second.depth).toBe(0);
    expect(first.bounds.top).toBeLessThan(second.bounds.top);
    expect(first.bounds.bottom).toBeLessThan(second.bounds.top);
    for (const activity of result.metadata.activities) {
      const lane = result.metadata.lanes.find(({ id }) => id === activity.lane)!;
      expect(activity.bounds.left).toBeGreaterThan(lane.bounds.left);
      expect(activity.bounds.right).toBeLessThan(lane.bounds.right);
      expect(activity.bounds.top).toBeGreaterThan(lane.bounds.top);
      expect(activity.bounds.bottom).toBeLessThan(lane.bounds.bottom);
    }
  });

  it("keeps the depth-six board and complete scene within the width cap", () => {
    const result = buildDiagramSpec(chainSpec(7), { seed: 91 });

    expect(result.ok).toBe(true);
    if (!result.ok || result.metadata.template !== "flow.swimlane") {
      return;
    }
    expect(result.metadata.lanes[0].bounds.width).toBe(2572);
    expect(result.scene.bounds().width).toBeLessThanOrEqual(2700);
    expect(result.metadata.activities.at(-1)?.depth).toBe(6);
  });

  it("measures the maximum transition label without losing its text", () => {
    const value = spec();
    const label = "x".repeat(48);
    value.transitions[0].label = label;

    const result = buildDiagramSpec(value, { seed: 97 });

    expect(result.ok).toBe(true);
    if (!result.ok || result.metadata.template !== "flow.swimlane") {
      return;
    }
    const transition = result.metadata.transitions[0];
    const labelElement = result.scene.elements.find(
      (element) => element.id === transition.labelElementId,
    );
    expect(labelElement?.text).toBe(label);
    expect(Number(labelElement?.width)).toBeGreaterThan(48 * 11 * 0.62);
    expect(result.geometry.errors).toEqual([]);
  });

  it("is deterministic for normalized values, metadata, geometry, and bindings", () => {
    const firstValidation = validateDiagramSpec(spec(), { seed: 101 });
    const secondValidation = validateDiagramSpec(structuredClone(spec()), { seed: 101 });
    expect(firstValidation).toEqual(secondValidation);

    const first = buildDiagramSpec(spec(), { seed: 101 });
    const second = buildDiagramSpec(structuredClone(spec()), { seed: 101 });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (
      !first.ok
      || !second.ok
      || first.metadata.template !== "flow.swimlane"
      || second.metadata.template !== "flow.swimlane"
    ) {
      return;
    }
    expect(first.metadata).toEqual(second.metadata);
    expect(first.geometry).toEqual(second.geometry);
    expect(first.scene.elements.map((element) => ({
      id: element.id,
      type: element.type,
      startBinding: element.startBinding,
      endBinding: element.endBinding,
      boundElements: element.boundElements,
    }))).toEqual(second.scene.elements.map((element) => ({
      id: element.id,
      type: element.type,
      startBinding: element.startBinding,
      endBinding: element.endBinding,
      boundElements: element.boundElements,
    })));
  });
});

function chainSpec(activityCount: number): SwimlaneFlowSpec {
  const activities = Array.from({ length: activityCount }, (_, index) => ({
    id: `activity-${index}`,
    lane: index % 2 === 0 ? "left" : "right",
    type: index % 3 === 2 ? "artifact" as const : "step" as const,
    title: `Activity ${index}`,
  }));
  return {
    template: "flow.swimlane",
    title: "Bounded chain",
    lanes: [
      { id: "left", label: "Left owner" },
      { id: "right", label: "Right owner" },
    ],
    activities,
    transitions: activities.slice(1).map((activity, index) => ({
      id: `transition-${index}`,
      from: activities[index].id,
      to: activity.id,
    })),
  };
}

function capacitySpec(): SwimlaneFlowSpec {
  const activities: SwimlaneFlowSpec["activities"] = [
    { id: "root-a", lane: "left", type: "step", title: "Root A" },
    { id: "root-b", lane: "left", type: "step", title: "Root B" },
    { id: "root-c", lane: "left", type: "step", title: "Root C" },
    { id: "root-d", lane: "left", type: "step", title: "Root D" },
    { id: "target", lane: "left", type: "artifact", title: "Target" },
    { id: "other", lane: "right", type: "step", title: "Other lane" },
  ];
  return {
    template: "flow.swimlane",
    title: "Cell capacity",
    lanes: [
      { id: "left", label: "Left" },
      { id: "right", label: "Right" },
    ],
    activities,
    transitions: [{ id: "advance", from: "root-a", to: "target" }],
  };
}

function maximumLaneSpec(laneCount: number): SwimlaneFlowSpec {
  const lanes = Array.from({ length: laneCount }, (_, index) => ({
    id: `lane-${index}`,
    label: `Lane ${index}`,
  }));
  const activities = lanes.map((lane, index) => ({
    id: `lane-activity-${index}`,
    lane: lane.id,
    type: "step" as const,
    title: `Activity ${index}`,
  }));
  return {
    template: "flow.swimlane",
    title: "Lane count boundary",
    lanes,
    activities,
    transitions: activities.slice(1).map((activity, index) => ({
      id: `lane-transition-${index}`,
      from: activities[index].id,
      to: activity.id,
    })),
  };
}

function maximumActivitySpec(activityCount: number): SwimlaneFlowSpec {
  const activities = Array.from({ length: activityCount }, (_, index) => ({
    id: `bounded-activity-${index}`,
    lane: index % 2 === 0 ? "left" : "right",
    type: index % 3 === 2 ? "artifact" as const : "step" as const,
    title: `Bounded activity ${index}`,
  }));
  return {
    template: "flow.swimlane",
    title: "Activity count boundary",
    lanes: [
      { id: "left", label: "Left" },
      { id: "right", label: "Right" },
    ],
    activities,
    transitions: activities.slice(4).map((activity, index) => ({
      id: `bounded-transition-${index}`,
      from: activities[index].id,
      to: activity.id,
    })),
  };
}

function maximumTransitionSpec(transitionCount: number): SwimlaneFlowSpec {
  const levels = [0, 0, 1, 2, 3, 4, 5, 6];
  const activities = levels.map((level, index) => ({
    id: `dense-activity-${index}`,
    lane: index % 2 === 0 ? "left" : "right",
    type: "step" as const,
    title: `Dense activity ${index}`,
    level,
  }));
  const requiredPairs: Array<[number, number]> = [
    [0, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
  ];
  const candidatePairs: Array<[number, number]> = [];
  for (let from = 0; from < activities.length; from += 1) {
    for (let to = 0; to < activities.length; to += 1) {
      if (levels[from] < levels[to]) {
        candidatePairs.push([from, to]);
      }
    }
  }
  const pairKey = ([from, to]: [number, number]) => `${from}:${to}`;
  const requiredKeys = new Set(requiredPairs.map(pairKey));
  const pairs = [
    ...requiredPairs,
    ...candidatePairs.filter((pair) => !requiredKeys.has(pairKey(pair))),
  ].slice(0, transitionCount);
  return {
    template: "flow.swimlane",
    title: "Transition count boundary",
    lanes: [
      { id: "left", label: "Left" },
      { id: "right", label: "Right" },
    ],
    activities: activities.map(({ level: _level, ...activity }) => activity),
    transitions: pairs.map(([from, to], index) => ({
      id: `dense-transition-${index}`,
      from: activities[from].id,
      to: activities[to].id,
    })),
  };
}

function fixedC4Spec(): DiagramSpec {
  return {
    template: "c4.container",
    title: "Legacy C4",
    system: {
      id: "sys",
      name: "System",
      description: "Desc",
      containers: [
        {
          id: "web",
          name: "Web",
          description: "UI",
          technology: "TS",
        },
        {
          id: "api",
          name: "API",
          description: "Logic",
          technology: "Node",
        },
      ],
    },
    relationships: [{
      id: "calls",
      from: "web",
      to: "api",
      description: "calls",
    }],
  };
}

function fixedSequenceSpec(): SequenceInteractionSpec {
  return {
    template: "sequence.interaction",
    title: "Legacy sequence",
    participants: [
      { id: "client", name: "Client" },
      { id: "server", name: "Server" },
    ],
    messages: [{
      id: "request",
      from: "client",
      to: "server",
      label: "request",
    }],
  };
}

function expectLegacyUnboundProjection(
  elements: Array<Record<string, unknown>>,
): void {
  expect(elements.filter((element) => element.type === "arrow").map((arrow) => ({
    startBinding: arrow.startBinding,
    endBinding: arrow.endBinding,
  }))).toEqual([{ startBinding: null, endBinding: null }]);
  expect(elements.filter((element) => element.type === "rectangle").map(
    (rectangle) => rectangle.boundElements,
  )).toEqual(
    elements
      .filter((element) => element.type === "rectangle")
      .map(() => []),
  );
}
