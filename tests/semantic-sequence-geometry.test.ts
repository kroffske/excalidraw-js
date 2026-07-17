import { readFileSync } from "node:fs";
import { vi } from "vitest";

const geometryMock = vi.hoisted(() => ({ force: false }));

vi.mock("../src/validate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/validate.js")>();
  return {
    ...original,
    validateDiagram: vi.fn((input: Parameters<typeof original.validateDiagram>[0]) => {
      if (!geometryMock.force) {
        return original.validateDiagram(input);
      }
      const issue = {
        code: "arrow-through-block" as const,
        severity: "error" as const,
        message: "forced sequence geometry failure",
        ids: ["query", "access-rule"],
      };
      return {
        ok: false,
        issues: [issue],
        errors: [issue],
        warnings: [],
      };
    }),
  };
});

import {
  SequenceInteractionSpec,
  buildDiagramSpec,
} from "../src/index.js";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  geometryMock.force = false;
  vi.clearAllMocks();
});

function canonicalSpec(): SequenceInteractionSpec {
  return JSON.parse(
    readFileSync(
      new URL("../examples/sequence_interaction_spec.json", import.meta.url),
      "utf8",
    ),
  ) as SequenceInteractionSpec;
}

describe("sequence.interaction geometry", () => {
  it("renders ordered participants, monotonic events, direction, and dashed returns", () => {
    const result = buildDiagramSpec(canonicalSpec(), { seed: 77 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.geometry).toEqual({
      ok: true,
      issues: [],
      errors: [],
      warnings: [],
    });
    const participantX = result.metadata.participants.map(
      (participant) => participant.bounds.centerX,
    );
    expect(participantX).toEqual([...participantX].sort((a, b) => a - b));

    const messageY = result.metadata.messages.map((message) => message.points[0][1]);
    expect(messageY.every((y, index) => index === 0 || y > messageY[index - 1]))
      .toBe(true);
    for (const message of result.metadata.messages) {
      const from = result.metadata.participants.find(
        (participant) => participant.id === message.from,
      )!;
      const to = result.metadata.participants.find(
        (participant) => participant.id === message.to,
      )!;
      expect(message.points[0][0]).toBe(from.bounds.centerX);
      expect(message.points.at(-1)?.[0]).toBe(to.bounds.centerX);
    }

    const returned = result.metadata.messages.find(
      (message) => message.kind === "return",
    )!;
    const returnArrow = result.scene.elements.find(
      (element) => element.id === returned.elementIds[0],
    );
    expect(returnArrow?.strokeStyle).toBe("dashed");
    expect(returned.points[0][0]).toBeGreaterThan(returned.points[1][0]);
  });

  it("fits a maximum-length adjacent label in at most two lines without loss", () => {
    const label = "x".repeat(100);
    const value: SequenceInteractionSpec = {
      template: "sequence.interaction",
      title: "Long label",
      participants: [
        { id: "left", name: "Left participant" },
        { id: "right", name: "Right participant" },
      ],
      messages: [{ id: "long", from: "left", to: "right", label }],
    };

    const result = buildDiagramSpec(value, { seed: 13 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const message = result.metadata.messages[0];
    const labelElement = result.scene.elements.find(
      (element) => element.id === message.elementIds[1],
    );
    const text = String(labelElement?.text);
    expect(text.split("\n")).toHaveLength(2);
    expect(text.replaceAll(/\s/g, "")).toBe(`1.${label}`);
    expect(Number(labelElement?.fontSize)).toBeGreaterThanOrEqual(11);
    expect(result.geometry.warnings).toEqual([]);
    expect(message.labelBounds.width).toBeLessThanOrEqual(
      Math.abs(message.points[1][0] - message.points[0][0]),
    );
  });

  it("measures participant headers so every accepted name renders without overflow", () => {
    const name = `A ${"x".repeat(58)}`;
    const value: SequenceInteractionSpec = {
      template: "sequence.interaction",
      title: "Measured headers",
      participants: [
        { id: "left", name },
        { id: "right", name: "Right participant" },
      ],
      messages: [{ id: "request", from: "left", to: "right", label: "request" }],
    };

    const result = buildDiagramSpec(value, { seed: 17 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const participant = result.metadata.participants[0];
    const title = result.scene.elements.find(
      (element) =>
        participant.elementIds.includes(String(element.id))
        && element.type === "text",
    );
    expect(participant.bounds.width).toBeGreaterThan(280);
    expect(String(title?.text).replaceAll(/\s/g, "")).toBe(
      name.replaceAll(/\s/g, ""),
    );
    expect(String(title?.text).split("\n")).toHaveLength(2);
    expect(Number(title?.fontSize)).toBeGreaterThanOrEqual(13);
    expect(result.geometry.warnings).toEqual([]);
  });

  it("measures the title band so a maximum accepted title is fully visible", () => {
    const title = `A ${"W".repeat(78)}`;
    const value: SequenceInteractionSpec = {
      template: "sequence.interaction",
      title,
      participants: [
        { id: "left", name: "Left participant" },
        { id: "right", name: "Right participant" },
      ],
      messages: [{ id: "request", from: "left", to: "right", label: "request" }],
    };

    const result = buildDiagramSpec(value, { seed: 18 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const titleElement = result.scene.elements.find(
      (element) =>
        element.type === "text"
        && String(element.text).replaceAll(/\s/g, "")
          === title.replaceAll(/\s/g, ""),
    );
    expect(String(titleElement?.text).split("\n").length).toBeLessThanOrEqual(2);
    expect(Number(titleElement?.fontSize)).toBeGreaterThanOrEqual(18);
    expect(Number(titleElement?.y) + Number(titleElement?.height)).toBeLessThan(
      result.metadata.participants[0].bounds.top,
    );
    expect(result.geometry.warnings).toEqual([]);
  });

  it("keeps measured notes in a right rail and reserves their row height", () => {
    const result = buildDiagramSpec(canonicalSpec(), { seed: 19 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const note = result.metadata.notes[0];
    const lastLifelineX = result.metadata.participants.at(-1)!.bounds.centerX;
    const attached = result.metadata.messages.find(
      (message) => message.id === note.message,
    )!;
    const next = result.metadata.messages[
      result.metadata.messages.findIndex((message) => message.id === note.message) + 1
    ];
    expect(note.bounds.left).toBeGreaterThan(lastLifelineX);
    expect(note.bounds.top).toBeLessThanOrEqual(attached.points[0][1]);
    expect(note.bounds.bottom).toBeGreaterThan(attached.points[0][1]);
    expect(next.points[0][1]).toBeGreaterThan(note.bounds.bottom);
    expect(note.leaderPoints[0][1]).toBe(attached.points[0][1]);
    expect(note.leaderPoints.at(-1)?.[0]).toBe(note.bounds.left);
  });

  it("extends every lifeline below the final event and preserves editable inventory", () => {
    const result = buildDiagramSpec(canonicalSpec(), { seed: 29 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const finalMessageY = result.metadata.messages.at(-1)!.points[0][1];
    for (const participant of result.metadata.participants) {
      expect(participant.lifeline.points[0][1]).toBeGreaterThan(
        participant.bounds.bottom,
      );
      expect(participant.lifeline.points[1][1]).toBeGreaterThan(finalMessageY);
    }
    expect(result.scene.elements.every((element) => element.type !== "image"))
      .toBe(true);
    expect(result.scene.elements.some((element) => element.type === "rectangle"))
      .toBe(true);
    expect(result.scene.elements.some((element) => element.type === "text"))
      .toBe(true);
    expect(result.scene.elements.some((element) => element.type === "line"))
      .toBe(true);
    expect(result.scene.elements.some((element) => element.type === "arrow"))
      .toBe(true);
  });

  it("is deterministic for metadata and element id/type inventory", () => {
    const first = buildDiagramSpec(canonicalSpec(), { seed: 42 });
    const second = buildDiagramSpec(canonicalSpec(), { seed: 42 });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(second.metadata).toEqual(first.metadata);
    expect(
      second.scene.elements.map(({ id, type }) => ({ id, type })),
    ).toEqual(
      first.scene.elements.map(({ id, type }) => ({ id, type })),
    );
  });

  it("maps hard geometry failure to message before note and exposes no scene", () => {
    geometryMock.force = true;

    const result = buildDiagramSpec(canonicalSpec(), { seed: 31 });

    expect(result.ok).toBe(false);
    expect("scene" in result).toBe(false);
    expect(result.geometry?.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "GEOMETRY_ERROR",
        path: "$.messages[1]",
        severity: "error",
      }),
    ]);
  });
});
