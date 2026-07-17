import {
  Asset,
  AssetRegistry,
  DiagramDiagnosticCode,
  SequenceInteractionSpec,
  buildDiagramSpec,
  validateDiagramSpec,
} from "../src/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

function spec(
  participantCount = 3,
  messageCount = 2,
): SequenceInteractionSpec {
  const participants = Array.from({ length: participantCount }, (_, index) => ({
    id: `participant-${index + 1}`,
    name: `Participant ${index + 1}`,
  }));
  const messages = Array.from({ length: messageCount }, (_, index) => ({
    id: `message-${index + 1}`,
    from: participants[index % participantCount].id,
    to: participants[(index + 1) % participantCount].id,
    label: `interaction ${index + 1}`,
    kind: index % 2 === 0 ? "call" as const : "return" as const,
  }));
  return {
    template: "sequence.interaction",
    title: "Runtime interaction",
    participants,
    messages,
  };
}

function expectDiagnostic(
  value: unknown,
  code: DiagramDiagnosticCode,
  path: string,
): void {
  const validation = validateDiagramSpec(value);
  expect(validation.ok).toBe(false);
  expect(validation.diagnostics).toContainEqual(
    expect.objectContaining({ code, path, severity: "error" }),
  );

  const build = buildDiagramSpec(value);
  expect(build.ok).toBe(false);
  expect("scene" in build).toBe(false);
}

describe("sequence.interaction validation contract", () => {
  it("normalizes strings, call kinds, and omitted notes", () => {
    const value = spec(2, 1);
    value.title = "  Runtime interaction  ";
    value.participants[0].name = "  Browser  ";
    value.messages[0].label = "  request report  ";
    delete value.messages[0].kind;

    const result = validateDiagramSpec(value);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual({
      ...value,
      title: "Runtime interaction",
      participants: [
        { id: "participant-1", name: "Browser" },
        value.participants[1],
      ],
      messages: [{
        ...value.messages[0],
        label: "request report",
        kind: "call",
      }],
      notes: [],
    });
    expect(result.diagnostics).toEqual([]);
  });

  it.each([
    ["root", (value: SequenceInteractionSpec) => ({ ...value, invented: true }), "$.invented"],
    [
      "participant",
      (value: SequenceInteractionSpec) => ({
        ...value,
        participants: [{ ...value.participants[0], invented: true }, value.participants[1]],
      }),
      "$.participants[0].invented",
    ],
    [
      "message",
      (value: SequenceInteractionSpec) => ({
        ...value,
        messages: [{ ...value.messages[0], invented: true }],
      }),
      "$.messages[0].invented",
    ],
    [
      "note",
      (value: SequenceInteractionSpec) => ({
        ...value,
        notes: [{
          id: "note-1",
          message: value.messages[0].id,
          text: "Important",
          invented: true,
        }],
      }),
      "$.notes[0].invented",
    ],
  ])("rejects unknown fields at the %s level", (_level, mutate, path) => {
    expectDiagnostic(mutate(spec(2, 1)), "UNKNOWN_FIELD", path);
  });

  it("enforces counts, string lengths, and ids", () => {
    expectDiagnostic(null, "INVALID_DOCUMENT", "$");

    const missingParticipants = spec(2, 1);
    delete (missingParticipants as Partial<SequenceInteractionSpec>).participants;
    expectDiagnostic(missingParticipants, "MISSING_FIELD", "$.participants");

    const missingMessages = spec(2, 1);
    delete (missingMessages as Partial<SequenceInteractionSpec>).messages;
    expectDiagnostic(missingMessages, "MISSING_FIELD", "$.messages");

    expectDiagnostic(spec(1, 1), "INVALID_PARTICIPANT_COUNT", "$.participants");
    expectDiagnostic(spec(6, 0), "INVALID_MESSAGE_COUNT", "$.messages");
    expectDiagnostic(spec(6, 13), "INVALID_MESSAGE_COUNT", "$.messages");

    const tooManyNotes = spec(2, 9);
    tooManyNotes.notes = tooManyNotes.messages.slice(0, 9).map((message, index) => ({
      id: `note-${index}`,
      message: message.id,
      text: `note ${index}`,
    }));
    expectDiagnostic(tooManyNotes, "INVALID_NOTE_COUNT", "$.notes");

    const invalidId = spec(2, 1);
    invalidId.messages[0].id = "1-invalid";
    expectDiagnostic(invalidId, "INVALID_ID", "$.messages[0].id");

    const longTitle = spec(2, 1);
    longTitle.title = "x".repeat(81);
    expectDiagnostic(longTitle, "STRING_TOO_LONG", "$.title");

    const longParticipant = spec(2, 1);
    longParticipant.participants[0].name = "x".repeat(61);
    expectDiagnostic(longParticipant, "STRING_TOO_LONG", "$.participants[0].name");

    const longMessage = spec(2, 1);
    longMessage.messages[0].label = "x".repeat(101);
    expectDiagnostic(longMessage, "STRING_TOO_LONG", "$.messages[0].label");

    const longNote = spec(2, 1);
    longNote.notes = [{
      id: "note",
      message: longNote.messages[0].id,
      text: "x".repeat(161),
    }];
    expectDiagnostic(longNote, "STRING_TOO_LONG", "$.notes[0].text");

    const invalidSeed = validateDiagramSpec(spec(2, 1), { seed: 1.5 });
    expect(invalidSeed.diagnostics).toContainEqual(
      expect.objectContaining({ code: "INVALID_SEED", path: "$.seed" }),
    );
  });

  it.each([
    [
      "title",
      (value: SequenceInteractionSpec) => ({ ...value, title: "First\nSecond" }),
      "$.title",
    ],
    [
      "participant name",
      (value: SequenceInteractionSpec) => ({
        ...value,
        participants: [
          { ...value.participants[0], name: "First\nSecond\nThird" },
          value.participants[1],
        ],
      }),
      "$.participants[0].name",
    ],
    [
      "message label",
      (value: SequenceInteractionSpec) => ({
        ...value,
        messages: [{ ...value.messages[0], label: "First\r\nSecond" }],
      }),
      "$.messages[0].label",
    ],
    [
      "note text",
      (value: SequenceInteractionSpec) => ({
        ...value,
        notes: [{
          id: "note-1",
          message: value.messages[0].id,
          text: "First\u2028Second",
        }],
      }),
      "$.notes[0].text",
    ],
  ])("rejects line breaks in %s before rendering", (_field, mutate, path) => {
    expectDiagnostic(mutate(spec(2, 1)), "INVALID_STRING", path);
  });

  it("uses one id namespace across participants, messages, and notes", () => {
    const duplicateMessage = spec(2, 1);
    duplicateMessage.messages[0].id = duplicateMessage.participants[0].id;
    expectDiagnostic(duplicateMessage, "DUPLICATE_ID", "$.messages[0].id");

    const duplicateNote = spec(2, 1);
    duplicateNote.notes = [{
      id: duplicateNote.messages[0].id,
      message: duplicateNote.messages[0].id,
      text: "Important",
    }];
    expectDiagnostic(duplicateNote, "DUPLICATE_ID", "$.notes[0].id");
  });

  it("rejects dangling endpoints, self messages, and invalid kinds", () => {
    const unknownFrom = spec(2, 1);
    unknownFrom.messages[0].from = "missing";
    expectDiagnostic(
      unknownFrom,
      "UNKNOWN_PARTICIPANT_ENDPOINT",
      "$.messages[0].from",
    );

    const unknownTo = spec(2, 1);
    unknownTo.messages[0].to = "missing";
    expectDiagnostic(
      unknownTo,
      "UNKNOWN_PARTICIPANT_ENDPOINT",
      "$.messages[0].to",
    );

    const self = spec(2, 1);
    self.messages[0].to = self.messages[0].from;
    expectDiagnostic(self, "SELF_MESSAGE", "$.messages[0].to");

    const invalidKind = spec(2, 1);
    (invalidKind.messages[0] as { kind: string }).kind = "async";
    expectDiagnostic(
      invalidKind,
      "INVALID_MESSAGE_KIND",
      "$.messages[0].kind",
    );
  });

  it("rejects dangling and duplicate note targets", () => {
    const unknown = spec(2, 1);
    unknown.notes = [{ id: "note", message: "missing", text: "Important" }];
    expectDiagnostic(unknown, "UNKNOWN_NOTE_MESSAGE", "$.notes[0].message");

    const duplicate = spec(2, 1);
    duplicate.notes = [
      { id: "note-1", message: duplicate.messages[0].id, text: "First" },
      { id: "note-2", message: duplicate.messages[0].id, text: "Second" },
    ];
    expectDiagnostic(
      duplicate,
      "DUPLICATE_NOTE_MESSAGE",
      "$.notes[1].message",
    );
  });

  it("accepts repeated and reverse endpoint pairs in input order", () => {
    const value = spec(2, 1);
    value.messages = [
      {
        id: "request-1",
        from: "participant-1",
        to: "participant-2",
        label: "request",
      },
      {
        id: "request-2",
        from: "participant-1",
        to: "participant-2",
        label: "request again",
      },
      {
        id: "response",
        from: "participant-2",
        to: "participant-1",
        label: "response",
        kind: "return",
      },
    ];

    const result = validateDiagramSpec(value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.messages.map((message) => message.id)).toEqual([
        "request-1",
        "request-2",
        "response",
      ]);
    }
  });

  it("accepts the maximum participant, message, and note counts", () => {
    const value = spec(6, 12);
    const notedMessages = [...value.messages.slice(0, 7), value.messages.at(-1)!];
    value.notes = notedMessages.map((message, index) => ({
      id: `note-${index + 1}`,
      message: message.id,
      text: `Constraint ${index + 1}`,
    }));

    const result = buildDiagramSpec(value, { seed: 91 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata.participants).toHaveLength(6);
      expect(result.metadata.messages).toHaveLength(12);
      expect(result.metadata.notes).toHaveLength(8);
      expect(result.metadata.notes[0].message).toBe(value.messages[0].id);
      expect(result.metadata.notes.at(-1)?.message).toBe(value.messages.at(-1)?.id);
      expect(result.geometry.ok).toBe(true);
    }
  });

  it("emits nested diagnostics in schema and input order", () => {
    const value = spec(2, 1) as SequenceInteractionSpec & { invented?: boolean };
    value.participants[0] = {
      ...value.participants[0],
      invented: true,
    } as SequenceInteractionSpec["participants"][number];
    value.messages[0] = {
      ...value.messages[0],
      invented: true,
    } as SequenceInteractionSpec["messages"][number];
    value.notes = [{
      id: "note",
      message: value.messages[0].id,
      text: "Important",
      invented: true,
    } as NonNullable<SequenceInteractionSpec["notes"]>[number]];
    value.invented = true;

    const result = validateDiagramSpec(value, { seed: Number.NaN });

    expect(result.diagnostics.map(({ code, path }) => [code, path])).toEqual([
      ["UNKNOWN_FIELD", "$.participants[0].invented"],
      ["UNKNOWN_FIELD", "$.messages[0].invented"],
      ["UNKNOWN_FIELD", "$.notes[0].invented"],
      ["UNKNOWN_FIELD", "$.invented"],
      ["INVALID_SEED", "$.seed"],
    ]);
  });

  it("dispatches sequence validation and build before bundled registry acquisition", () => {
    const bundled = vi.spyOn(AssetRegistry, "bundled").mockImplementation(() => {
      throw new Error("sequence must not acquire bundled assets");
    });

    expect(validateDiagramSpec(spec(2, 1)).ok).toBe(true);
    expect(buildDiagramSpec(spec(2, 1)).ok).toBe(true);
    expect(bundled).not.toHaveBeenCalled();
  });

  it("ignores an injected registry and leaves sequence scenes asset-free", () => {
    const registry = new AssetRegistry({
      exact_icon: new Asset("exact_icon", "exact.svg", Buffer.from("<svg/>")),
    });
    const resolve = vi.spyOn(registry, "resolve").mockImplementation(() => {
      throw new Error("sequence must not inspect injected registry");
    });

    expect(validateDiagramSpec(spec(2, 1), { assetRegistry: registry }).ok).toBe(true);
    const result = buildDiagramSpec(spec(2, 1), { assetRegistry: registry });

    expect(result.ok).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.scene.assetRegistry).toBeNull();
    }
  });

  it("preserves legacy unsupported-template diagnostics byte-for-byte", () => {
    const value = {
      template: "sequence",
      title: "Unsupported",
      system: {
        id: "system",
        name: "System",
        description: "Description",
        containers: [],
      },
    };

    const result = validateDiagramSpec(value);

    expect(result.diagnostics[0]).toEqual({
      severity: "error",
      code: "UNSUPPORTED_TEMPLATE",
      path: "$.template",
      message: "unsupported template 'sequence'",
      hint: "Use 'c4.container'.",
    });
  });
});
