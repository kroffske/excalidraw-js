import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SemanticRedrawSpecDocument,
  validateSemanticRedrawSpec,
  writeSemanticRedrawDiagram,
} from "../src/semantic-redraw-spec.js";

function validSpec(): SemanticRedrawSpecDocument {
  return {
    title: "Repository semantic redraw",
    subtitle: "Weak model source spec rendered by the trusted runner.",
    seed: 42,
    layout: { type: "sections", density: "compact" },
    sections: [
      {
        id: "projects",
        title: "1. Projects",
        order: 1,
        cards: [
          { id: "default_project", title: "default_project", iconId: "server_stack", bullets: ["standard project structure"] },
          { id: "sms_send", title: "sms_send", iconId: "api_connector", bullets: ["specialized SMS project"] },
        ],
      },
      {
        id: "shared",
        title: "2. Shared resources",
        order: 2,
        cards: [
          { id: "packages", title: "packages", iconId: "data_catalog", bullets: ["shared libraries"] },
          { id: "examples", title: "examples", iconId: "news_document", bullets: ["sample implementations"] },
        ],
      },
      {
        id: "runtime",
        title: "3. Runtime",
        order: 3,
        cards: [
          { id: "scripts", title: "scripts", iconId: "tool_call", bullets: ["automation scripts"] },
          { id: "triton_ci", title: "triton_ci", iconId: "model_deployment", bullets: ["deployment checks"] },
        ],
      },
    ],
    edges: [
      { from: "default_project", to: "sms_send", direction: "top-down", kind: "primary", label: "variants" },
      { from: "default_project", to: "packages", direction: "left-to-right", kind: "support", label: "imports" },
      { from: "packages", to: "examples", direction: "top-down", kind: "provenance", label: "used by" },
      { from: "scripts", to: "default_project", kind: "support", label: "automates" },
    ],
  };
}

describe("semantic-redraw-spec", () => {
  it("renders a valid semantic redraw spec and embeds resolved assets", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-semantic-redraw-"));
    const outPath = join(root, "repository.excalidraw");
    const result = writeSemanticRedrawDiagram(validSpec(), outPath);

    expect(result.sections).toBe(3);
    expect(result.cards).toBe(6);
    expect(result.edges).toBe(4);
    expect(result.files).toBeGreaterThan(0);
    expect(existsSync(outPath)).toBe(true);

    const data = JSON.parse(readFileSync(outPath, "utf8"));
    expect(data.type).toBe("excalidraw");
    expect(JSON.stringify(data.elements)).toContain("Repository semantic redraw");
    expect(JSON.stringify(data.elements)).toContain("standard project structure");
    expect(JSON.stringify(data.elements)).not.toMatch(/"-\s\S"/);
  });

  it("rejects weak-model mistakes before writing a diagram", () => {
    const spec = validSpec() as unknown as Record<string, unknown>;
    const sections = spec.sections as Array<Record<string, unknown>>;
    const firstCards = sections[0].cards as Array<Record<string, unknown>>;
    firstCards[0].bullets = "standard project structure";
    firstCards[1].iconId = "folder";

    const result = validateSemanticRedrawSpec(spec);
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining(["INVALID_BULLETS", "UNKNOWN_ICON_ID"]));
  });

  it("rejects ambiguous section ordering and one-icon output", () => {
    const spec = validSpec();
    spec.sections[1].order = 1;
    for (const section of spec.sections) {
      for (const card of section.cards) {
        card.iconId = "server_stack";
      }
    }

    const result = validateSemanticRedrawSpec(spec);
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining(["DUPLICATE_SECTION_ORDER", "SINGLE_ICON_FOR_ALL_CARDS"]));
  });

  it("warns and infers declared edge directions that contradict placed geometry by default", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-semantic-direction-"));
    const spec = validSpec();
    spec.edges = [{ from: "packages", to: "default_project", direction: "left-to-right", kind: "feedback", label: "bad direction" }];

    const result = writeSemanticRedrawDiagram(spec, join(root, "advisory.excalidraw"));
    expect(result.warnings.map((issue) => issue.code)).toContain("EDGE_DIRECTION_OVERRIDDEN");
  });

  it("rejects declared edge directions that contradict placed geometry in strict mode", () => {
    const root = mkdtempSync(join(tmpdir(), "excalidraw-semantic-direction-"));
    const spec = validSpec();
    spec.edges = [{ from: "packages", to: "default_project", direction: "left-to-right", kind: "feedback", label: "bad direction" }];

    expect(() => writeSemanticRedrawDiagram(spec, join(root, "bad.excalidraw"), {
      failOnDirectionMismatch: true,
    })).toThrow(/EDGE_DIRECTION_MISMATCH/);
  });
});
