import { readFileSync } from "node:fs";
import {
  Asset,
  AssetRegistry,
  DiagramDiagnosticCode,
  DiagramSpec,
  buildDiagramSpec,
  polylineIntersectsBounds,
  validateDiagramSpec,
} from "../src/index.js";
import { elementBounds } from "../src/geometry.js";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

function spec(containerCount = 3): DiagramSpec {
  return {
    template: "c4.container",
    title: "Customer insights",
    system: {
      id: "customer-insights",
      name: "Customer insights",
      description: "Builds cohort reports for revenue analysts.",
      containers: Array.from({ length: containerCount }, (_, index) => ({
        id: `container-${index + 1}`,
        name: `Container ${index + 1}`,
        description: `Owns responsibility ${index + 1}.`,
        technology: index % 2 === 0 ? "TypeScript" : "PostgreSQL",
      })),
    },
    relationships: [],
  };
}

function withRelationship(
  value: DiagramSpec,
  relationship: DiagramSpec["relationships"][number],
): DiagramSpec {
  return { ...value, relationships: [...(value.relationships ?? []), relationship] };
}

function expectDiagnostic(
  value: unknown,
  code: DiagramDiagnosticCode,
  path: string,
  options: Parameters<typeof validateDiagramSpec>[1] = {},
): void {
  const validation = validateDiagramSpec(value, options);
  expect(validation.ok).toBe(false);
  expect(validation.diagnostics).toContainEqual(expect.objectContaining({ code, path, severity: "error" }));

  const build = buildDiagramSpec(value, options);
  expect(build.ok).toBe(false);
  expect("scene" in build).toBe(false);
}

describe("c4.container validation contract", () => {
  it("normalizes trimmed strings and defaults relationships to an empty array", () => {
    const value = spec(2);
    value.title = "  Customer insights  ";
    value.system.name = "  Customer insights  ";
    value.system.containers[0].technology = "  TypeScript  ";
    delete value.relationships;

    const result = validateDiagramSpec(value);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.title).toBe("Customer insights");
    expect(result.value.system.name).toBe("Customer insights");
    expect(result.value.system.containers[0].technology).toBe("TypeScript");
    expect(result.value.relationships).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it.each([
    ["root", (value: DiagramSpec) => ({ ...value, invented: true }), "$.invented"],
    ["system", (value: DiagramSpec) => ({ ...value, system: { ...value.system, invented: true } }), "$.system.invented"],
    [
      "container",
      (value: DiagramSpec) => {
        value.system.containers[0] = { ...value.system.containers[0], invented: true } as typeof value.system.containers[number];
        return value;
      },
      "$.system.containers[0].invented",
    ],
    [
      "relationship",
      (value: DiagramSpec) => ({
        ...withRelationship(value, {
          id: "calls",
          from: "container-1",
          to: "container-2",
          description: "calls",
        }),
        relationships: [{
          id: "calls",
          from: "container-1",
          to: "container-2",
          description: "calls",
          invented: true,
        }],
      }),
      "$.relationships[0].invented",
    ],
  ])("rejects unknown fields at the %s level", (_level, mutate, path) => {
    expectDiagnostic(mutate(spec(2)), "UNKNOWN_FIELD", path);
  });

  it("covers every structural diagnostic code with an exact JSON path", () => {
    const invalidDocument = null;
    expectDiagnostic(invalidDocument, "INVALID_DOCUMENT", "$");

    const unsupported = spec(2);
    (unsupported as { template: string }).template = "sequence";
    expectDiagnostic(unsupported, "UNSUPPORTED_TEMPLATE", "$.template");

    const missing = spec(2);
    delete (missing.system.containers[0] as Partial<typeof missing.system.containers[number]>).technology;
    expectDiagnostic(missing, "MISSING_FIELD", "$.system.containers[0].technology");

    const invalidString = spec(2);
    invalidString.system.containers[0].description = "  ";
    expectDiagnostic(invalidString, "INVALID_STRING", "$.system.containers[0].description");

    const invalidId = spec(2);
    invalidId.system.containers[0].id = "1-invalid";
    expectDiagnostic(invalidId, "INVALID_ID", "$.system.containers[0].id");

    const tooLong = spec(2);
    tooLong.system.description = "x".repeat(161);
    expectDiagnostic(tooLong, "STRING_TOO_LONG", "$.system.description");

    expectDiagnostic(spec(1), "INVALID_CONTAINER_COUNT", "$.system.containers");

    const tooManyRelationships = spec(6);
    tooManyRelationships.relationships = [
      [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5],
    ].map(([from, to], index) => ({
      id: `r-${index}`,
      from: `container-${from + 1}`,
      to: `container-${to + 1}`,
      description: `relationship ${index}`,
    }));
    expectDiagnostic(tooManyRelationships, "INVALID_RELATIONSHIP_COUNT", "$.relationships");

    const duplicateId = spec(2);
    duplicateId.system.containers[1].id = duplicateId.system.id;
    expectDiagnostic(duplicateId, "DUPLICATE_ID", "$.system.containers[1].id");

    const registry = new AssetRegistry({
      exact_icon: new Asset("exact_icon", "exact.svg", Buffer.from("<svg/>")),
    });
    const unknownIcon = spec(2);
    unknownIcon.system.containers[0].iconId = "missing_icon";
    expectDiagnostic(unknownIcon, "UNKNOWN_ICON_ID", "$.system.containers[0].iconId", {
      assetRegistry: registry,
    });

    const unknownEndpoint = withRelationship(spec(2), {
      id: "unknown-endpoint",
      from: "missing",
      to: "container-2",
      description: "calls",
    });
    expectDiagnostic(unknownEndpoint, "UNKNOWN_RELATIONSHIP_ENDPOINT", "$.relationships[0].from");

    const self = withRelationship(spec(2), {
      id: "self",
      from: "container-1",
      to: "container-1",
      description: "calls",
    });
    expectDiagnostic(self, "SELF_RELATIONSHIP", "$.relationships[0].to");

    const duplicatePair = spec(3);
    duplicatePair.relationships = [
      { id: "first", from: "container-1", to: "container-2", description: "calls" },
      { id: "second", from: "container-1", to: "container-2", description: "calls again" },
    ];
    expectDiagnostic(duplicatePair, "DUPLICATE_RELATIONSHIP_PAIR", "$.relationships[1].to");

    const reversePair = spec(3);
    reversePair.relationships = [
      { id: "first", from: "container-1", to: "container-2", description: "calls" },
      { id: "second", from: "container-2", to: "container-1", description: "returns" },
    ];
    expectDiagnostic(reversePair, "BIDIRECTIONAL_RELATIONSHIP_PAIR", "$.relationships[1].to");

    expectDiagnostic(spec(2), "INVALID_SEED", "$.seed", { seed: Number.NaN });
  });

  it("rejects duplicate relationship ids and missing relationship descriptions", () => {
    const duplicate = spec(3);
    duplicate.relationships = [
      { id: "calls", from: "container-1", to: "container-2", description: "calls" },
      { id: "calls", from: "container-2", to: "container-3", description: "calls" },
    ];
    expectDiagnostic(duplicate, "DUPLICATE_ID", "$.relationships[1].id");

    const missingDescription = withRelationship(spec(2), {
      id: "calls",
      from: "container-1",
      to: "container-2",
      description: "calls",
    });
    delete (missingDescription.relationships![0] as Partial<typeof missingDescription.relationships![number]>).description;
    expectDiagnostic(missingDescription, "MISSING_FIELD", "$.relationships[0].description");
  });

  it("requires exact icon ids and does not accept registry aliases", () => {
    const bundled = vi.spyOn(AssetRegistry, "bundled");
    const registry = new AssetRegistry(
      { exact_icon: new Asset("exact_icon", "exact.svg", Buffer.from("<svg/>")) },
      { aliases: { icon_alias: "exact_icon" } },
    );
    const exact = spec(2);
    exact.system.containers[0].iconId = "exact_icon";
    expect(validateDiagramSpec(exact, { assetRegistry: registry }).ok).toBe(true);

    const alias = spec(2);
    alias.system.containers[0].iconId = "icon_alias";
    expectDiagnostic(alias, "UNKNOWN_ICON_ID", "$.system.containers[0].iconId", {
      assetRegistry: registry,
    });
    expect(bundled).not.toHaveBeenCalled();
  });

  it("acquires one bundled registry snapshot per default-icon public call", () => {
    const registry = new AssetRegistry({
      exact_icon: new Asset("exact_icon", "exact.svg", Buffer.from("<svg/>")),
    });
    const bundled = vi.spyOn(AssetRegistry, "bundled").mockReturnValue(registry);
    const value = spec(2);
    value.system.containers[0].iconId = "exact_icon";

    const build = buildDiagramSpec(value);

    expect(build.ok).toBe(true);
    expect(bundled).toHaveBeenCalledTimes(1);
    if (build.ok) {
      expect(build.scene.assetRegistry).toBe(registry);
    }

    bundled.mockClear();
    expect(validateDiagramSpec(value).ok).toBe(true);
    expect(bundled).toHaveBeenCalledTimes(1);
  });

  it("contains bundled registry acquisition failure as exact icon diagnostics", () => {
    const bundled = vi.spyOn(AssetRegistry, "bundled").mockImplementation(() => {
      throw new Error("private package path /assets/core/manifest.json");
    });
    const value = spec(3);
    value.system.containers[0].iconId = "first_icon";
    value.system.containers[2].iconId = "second_icon";

    const result = buildDiagramSpec(value);

    expect(bundled).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect("scene" in result).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "UNKNOWN_ICON_ID",
        path: "$.system.containers[0].iconId",
        severity: "error",
      }),
      expect.objectContaining({
        code: "UNKNOWN_ICON_ID",
        path: "$.system.containers[2].iconId",
        severity: "error",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain("manifest.json");
    expect(JSON.stringify(result.diagnostics)).not.toContain("private package path");
  });

  it("emits diagnostics in schema order and then container input order", () => {
    const value = spec(2) as DiagramSpec & { invented?: boolean };
    (value as { template: string }).template = "sequence";
    value.title = "x".repeat(81);
    value.system.name = "";
    value.system.containers[0].technology = "";
    value.system.containers[1].technology = "";
    value.invented = true;

    const result = validateDiagramSpec(value, { seed: 1.5 });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code, path }) => [code, path])).toEqual([
      ["UNSUPPORTED_TEMPLATE", "$.template"],
      ["STRING_TOO_LONG", "$.title"],
      ["INVALID_STRING", "$.system.name"],
      ["INVALID_STRING", "$.system.containers[0].technology"],
      ["INVALID_STRING", "$.system.containers[1].technology"],
      ["UNKNOWN_FIELD", "$.invented"],
      ["INVALID_SEED", "$.seed"],
    ]);
  });
});

describe("c4.container renderer", () => {
  it("builds the tracked fixture through the root API with editable semantic inventory", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../examples/c4_container_spec.json", import.meta.url), "utf8"),
    ) as unknown;
    const result = buildDiagramSpec(fixture, { seed: 77 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.geometry.ok).toBe(true);
    expect(result.geometry.errors).toEqual([]);
    expect(result.metadata.template).toBe("c4.container");
    expect(result.metadata.system.path).toBe("$.system");
    expect(result.metadata.system.elementIds).toHaveLength(2);
    expect(result.metadata.containers).toHaveLength(3);
    expect(result.metadata.relationships).toHaveLength(2);

    const elementsById = new Map(result.scene.elements.map((element) => [String(element.id), element]));
    for (const container of result.metadata.containers) {
      const elements = container.elementIds.map((id) => elementsById.get(id)!);
      expect(elements.some((element) => element.type === "rectangle")).toBe(true);
      expect(elements.some((element) => element.type === "text" && element.text === container.name)).toBe(true);
      const technology = elements.find((element) => element.type === "text" && element.text === container.technology);
      expect(technology).toBeTruthy();
      const technologyBounds = elementBounds(technology!);
      expect(technologyBounds.left).toBeGreaterThan(container.bounds.left);
      expect(technologyBounds.right).toBeLessThan(container.bounds.right);
      expect(technologyBounds.bottom).toBeLessThan(container.bounds.bottom);
      if (container.iconId) {
        expect(elements.some((element) => element.type === "image")).toBe(true);
      }
    }
    for (const relationship of result.metadata.relationships) {
      const elements = relationship.elementIds.map((id) => elementsById.get(id)!);
      expect(elements.some((element) => element.type === "arrow")).toBe(true);
      const expectedLabel = relationship.technology
        ? `${relationship.description} · ${relationship.technology}`
        : relationship.description;
      expect(elements.some((element) => element.type === "text" && element.text === expectedLabel)).toBe(true);
    }
    expect(result.scene.elements.every((element) =>
      ["rectangle", "text", "image", "arrow"].includes(String(element.type))
    )).toBe(true);
  });

  it.each([
    [2, 2],
    [3, 3],
    [4, 2],
    [6, 3],
  ])("uses the deterministic grid for %i containers", (containerCount, expectedColumns) => {
    const result = buildDiagramSpec(spec(containerCount), { seed: 42 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.geometry.ok).toBe(true);
    const distinctX = new Set(result.metadata.containers.map((container) => container.bounds.x));
    expect(distinctX.size).toBe(expectedColumns);
    const rowCount = Math.ceil(containerCount / expectedColumns);
    const distinctY = new Set(result.metadata.containers.map((container) => container.bounds.y));
    expect(distinctY.size).toBe(rowCount);
    expect(result.metadata.relationships).toEqual([]);
  });

  it("routes a six-container nonlocal edge around every unrelated card", () => {
    const value = spec(6);
    value.relationships = [{
      id: "skip-middle",
      from: "container-1",
      to: "container-3",
      description: "calls across the row",
    }];

    const result = buildDiagramSpec(value);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const route = result.metadata.relationships[0].points;
    expect(route.length).toBeGreaterThan(2);
    for (const container of result.metadata.containers.slice(1, 2).concat(result.metadata.containers.slice(3))) {
      expect(polylineIntersectsBounds(route, container.bounds), container.id).toBe(false);
    }
  });

  it("accepts the maximum eight relationships or fails only through the documented geometry result", () => {
    const value = spec(6);
    const pairs = [
      [0, 5], [0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5],
    ];
    value.relationships = pairs.map(([from, to], index) => ({
      id: `relationship-${index + 1}`,
      from: `container-${from + 1}`,
      to: `container-${to + 1}`,
      description: `relationship ${index + 1}`,
    }));

    const result = buildDiagramSpec(value);

    if (result.ok) {
      expect(result.geometry.ok).toBe(true);
      expect(result.metadata.relationships).toHaveLength(8);
    } else {
      expect("scene" in result).toBe(false);
      expect(result.geometry?.ok).toBe(false);
      expect(result.diagnostics.every((diagnostic) => diagnostic.code === "GEOMETRY_ERROR")).toBe(true);
    }
  });

  it("produces deterministic normalized metadata geometry and semantic element ids", () => {
    const value = withRelationship(spec(3), {
      id: "calls",
      from: "container-1",
      to: "container-2",
      description: "calls",
      technology: "HTTPS",
    });
    const firstValidation = validateDiagramSpec(value, { seed: 123 });
    const secondValidation = validateDiagramSpec(structuredClone(value), { seed: 123 });
    expect(firstValidation).toEqual(secondValidation);

    const first = buildDiagramSpec(value, { seed: 123 });
    const second = buildDiagramSpec(structuredClone(value), { seed: 123 });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.metadata).toEqual(second.metadata);
    expect(first.geometry).toEqual(second.geometry);
    expect(first.scene.elements.map((element) => [element.id, element.type])).toEqual(
      second.scene.elements.map((element) => [element.id, element.type]),
    );
  });
});
