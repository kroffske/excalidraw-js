import { AssetRegistry } from "./assets.js";
import { Scene, measureText } from "./core.js";
import { Bounds, PointTuple, elementBounds } from "./geometry.js";
import { connectRouted, section } from "./layout.js";
import { PlacedNodeCard, nodeCard } from "./node.js";
import {
  readSemanticPaletteName,
  readSemanticStatus,
  resolveSemanticPalette,
  semanticStatusColor,
  withSemanticStatus,
} from "./semantic-palette.js";
import type {
  SemanticPaletteName,
  SemanticStatus,
} from "./semantic-palette.js";
import {
  DiagramDiagnostic,
  DiagramSpecOptions,
  error,
  hasOwn,
  isPlainObject,
  optionalString,
  registerId,
  rejectUnknownFields,
  requiredId,
  requiredString,
  validateSeed,
} from "./semantic-schema.js";
import {
  DiagramEdge,
  ValidationIssue,
  ValidationResult,
  validateDiagram,
} from "./validate.js";

export interface DiagramContainerSpec {
  id: string;
  name: string;
  description: string;
  technology: string;
  iconId?: string;
  status?: SemanticStatus;
}

export interface DiagramSystemSpec {
  id: string;
  name: string;
  description: string;
  containers: DiagramContainerSpec[];
}

export interface DiagramRelationshipSpec {
  id: string;
  from: string;
  to: string;
  description: string;
  technology?: string;
  status?: SemanticStatus;
}

export interface DiagramSpec {
  template: "c4.container";
  title: string;
  palette?: SemanticPaletteName;
  system: DiagramSystemSpec;
  relationships?: DiagramRelationshipSpec[];
}

export interface NormalizedDiagramSpec {
  template: "c4.container";
  title: string;
  palette?: SemanticPaletteName;
  system: DiagramSystemSpec;
  relationships: DiagramRelationshipSpec[];
}

export type DiagramSpecValidationResult =
  | { ok: true; value: NormalizedDiagramSpec; diagnostics: DiagramDiagnostic[] }
  | { ok: false; diagnostics: DiagramDiagnostic[] };

export interface DiagramBuildMetadata {
  template: "c4.container";
  palette?: SemanticPaletteName;
  system: {
    id: string;
    name: string;
    description: string;
    path: "$.system";
    elementIds: string[];
  };
  containers: Array<{
    id: string;
    name: string;
    description: string;
    technology: string;
    iconId?: string;
    status?: SemanticStatus;
    path: string;
    elementIds: string[];
    bounds: Bounds;
  }>;
  relationships: Array<{
    id: string;
    from: string;
    to: string;
    description: string;
    technology?: string;
    status?: SemanticStatus;
    path: string;
    elementIds: string[];
    points: PointTuple[];
  }>;
}

export type DiagramSpecBuildResult =
  | {
      ok: true;
      scene: Scene;
      metadata: DiagramBuildMetadata;
      geometry: ValidationResult;
      diagnostics: DiagramDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: DiagramDiagnostic[];
      geometry?: ValidationResult;
    };

interface RenderedSystem {
  cards: PlacedNodeCard[];
  bounds: Bounds;
  elementIds: string[];
}

interface RenderedRelationships {
  edges: DiagramEdge[];
  metadata: DiagramBuildMetadata["relationships"];
}

interface RegistrySnapshot {
  registry: AssetRegistry | null;
  acquisitionFailed: boolean;
}

type SemanticPalette = ReturnType<typeof resolveSemanticPalette>;

const ROOT_FIELDS = ["template", "title", "palette", "system", "relationships"] as const;
const SYSTEM_FIELDS = ["id", "name", "description", "containers"] as const;
const CONTAINER_FIELDS = ["id", "name", "description", "technology", "iconId", "status"] as const;
const RELATIONSHIP_FIELDS = ["id", "from", "to", "description", "technology", "status"] as const;
const CARD_WIDTH = 320;
const COLUMN_GAP = 120;
const ROW_GAP = 120;
const SECTION_X = 64;
const SECTION_Y = 112;
const SECTION_PADDING = 32;
const SECTION_HEADER_HEIGHT = 48;
const SECTION_HEADER_GAP = 12;
const FIRST_CARD_Y = SECTION_Y + SECTION_PADDING + SECTION_HEADER_HEIGHT + SECTION_HEADER_GAP;

const STRING_LIMITS = {
  title: 80,
  systemName: 60,
  systemDescription: 160,
  containerName: 60,
  containerDescription: 160,
  technology: 60,
  relationshipDescription: 100,
} as const;

export function validateC4DiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): DiagramSpecValidationResult {
  const registrySnapshot = acquireRegistrySnapshot(value, options);
  return validateDiagramSpecWithRegistry(value, options, registrySnapshot);
}

function validateDiagramSpecWithRegistry(
  value: unknown,
  options: DiagramSpecOptions,
  registrySnapshot: RegistrySnapshot,
): DiagramSpecValidationResult {
  const diagnostics: DiagramDiagnostic[] = [];
  if (!isPlainObject(value)) {
    diagnostics.push(error("INVALID_DOCUMENT", "$", "diagram spec must be a plain object"));
    validateSeed(options.seed, diagnostics);
    return { ok: false, diagnostics };
  }

  const template = requiredTemplate(value, diagnostics);
  const title = requiredString(value, "title", "$.title", STRING_LIMITS.title, diagnostics);
  const palette = readSemanticPaletteName(value, "$.palette", diagnostics);
  const ids = new Map<string, string>();
  const system = validateSystem(value, ids, registrySnapshot, diagnostics);
  const relationships = validateRelationships(value, system?.containers ?? [], ids, diagnostics);
  rejectUnknownFields(value, ROOT_FIELDS, "$", diagnostics);
  validateSeed(options.seed, diagnostics);

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error") || !template || !title || !system || !relationships) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    value: {
      template,
      title,
      ...(palette ? { palette } : {}),
      system,
      relationships,
    },
    diagnostics,
  };
}

export function buildC4DiagramSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): DiagramSpecBuildResult {
  const registrySnapshot = acquireRegistrySnapshot(value, options);
  const validation = validateDiagramSpecWithRegistry(value, options, registrySnapshot);
  if (!validation.ok) {
    return validation;
  }

  const spec = validation.value;
  const scene = new Scene({
    seed: options.seed ?? 42,
    assetRegistry: registrySnapshot.registry,
  });
  const palette = resolveSemanticPalette(spec.palette);
  const renderedSystem = renderSystem(scene, spec, palette);
  const renderedRelationships = renderRelationships(
    scene,
    spec,
    renderedSystem,
    palette,
  );

  const geometry = validateDiagram({
    blocks: renderedSystem.cards.map((card) => ({
      id: card.id,
      bounds: card.block.bounds,
      kind: "node",
      overflowed: card.overflowed,
      texts: card.texts,
      padding: 0,
    })),
    edges: renderedRelationships.edges,
    gap: 24,
    tolerateEdgeLabelOverlap: true,
  });
  const geometryDiagnostics = geometry.issues.map((issue) =>
    geometryDiagnostic(issue, spec)
  );
  const diagnostics = [...validation.diagnostics, ...geometryDiagnostics];
  if (!geometry.ok) {
    return { ok: false, diagnostics, geometry };
  }

  return {
    ok: true,
    scene,
    geometry,
    diagnostics,
    metadata: {
      template: spec.template,
      ...(spec.palette ? { palette: spec.palette } : {}),
      system: {
        id: spec.system.id,
        name: spec.system.name,
        description: spec.system.description,
        path: "$.system",
        elementIds: renderedSystem.elementIds,
      },
      containers: spec.system.containers.map((container, index) => {
        const card = renderedSystem.cards[index];
        return {
          ...container,
          path: `$.system.containers[${index}]`,
          elementIds: elementIds(card.block.elements),
          bounds: card.block.bounds,
        };
      }),
      relationships: renderedRelationships.metadata,
    },
  };
}

function renderSystem(
  scene: Scene,
  spec: NormalizedDiagramSpec,
  palette: SemanticPalette,
): RenderedSystem {
  scene.text(SECTION_X, 40, spec.title, {
    size: 26,
    color: palette.c4.title,
    width: gridWidth(spec.system.containers.length),
  });
  const cards = spec.system.containers.map((container) =>
    nodeCard(scene, {
      id: container.id,
      title: container.name,
      bullets: [container.description],
      badge: withSemanticStatus(container.technology, container.status),
      iconId: container.iconId,
      width: CARD_WIDTH,
      bulletMaxLines: 5,
      strict: true,
      color: semanticStatusColor(
        palette,
        container.status,
        palette.c4.container,
      ),
    })
  );
  placeCards(cards, columnCount(cards.length));

  const cardElementIds = new Set(cards.flatMap((card) => elementIds(card.block.elements)));
  const systemBlock = section(scene, {
    x: SECTION_X,
    y: SECTION_Y,
    title: spec.system.name,
    titleSize: 18,
    color: palette.c4.boundary,
    padding: SECTION_PADDING,
    titleHeight: SECTION_HEADER_HEIGHT,
    headerGap: SECTION_HEADER_GAP,
    children: cards.map((card) => card.block),
  });
  return {
    cards,
    bounds: systemBlock.bounds,
    elementIds: elementIds(systemBlock.elements).filter((id) => !cardElementIds.has(id)),
  };
}

function renderRelationships(
  scene: Scene,
  spec: NormalizedDiagramSpec,
  system: RenderedSystem,
  palette: SemanticPalette,
): RenderedRelationships {
  const cardsById = new Map(system.cards.map((card) => [card.id, card]));
  const priorRoutes: PointTuple[][] = [];
  const priorLabels: NonNullable<ReturnType<typeof connectRouted>["label"]>[] = [];
  const edges: DiagramEdge[] = [];
  const metadata: DiagramBuildMetadata["relationships"] = [];

  for (const [index, relationship] of spec.relationships.entries()) {
    const source = cardsById.get(relationship.from)!;
    const target = cardsById.get(relationship.to)!;
    const baseLabel = relationship.technology
      ? `${relationship.description} · ${relationship.technology}`
      : relationship.description;
    const label = withSemanticStatus(baseLabel, relationship.status)!;
    const color = semanticStatusColor(
      palette,
      relationship.status,
      palette.c4.edge,
    );
    const connection = connectRouted(scene, source.block, target.block, {
      label,
      labelWidth: relationship.status
        ? Math.max(176, Math.ceil(measureText(label, { size: 11 }).width))
        : 176,
      labelSize: 11,
      labelColor: relationship.status ? color : palette.c4.label,
      color,
      strokeWidth: 2,
      path: "auto",
      routeBounds: system.bounds,
      outerGap: 44,
      clearance: 16,
      obstacles: system.cards
        .filter((card) => card !== source && card !== target)
        .map((card) => card.block),
      avoidRoutes: priorRoutes,
      avoidLabels: priorLabels,
    });
    const labelId = connection.label ? `${relationship.id}.label` : undefined;
    edges.push({
      id: relationship.id,
      from: relationship.from,
      to: relationship.to,
      points: connection.points,
      label: connection.label && labelId
        ? { id: labelId, bounds: elementBounds(connection.label) }
        : undefined,
    });
    priorRoutes.push(connection.points);
    if (connection.label) {
      priorLabels.push(connection.label);
    }
    metadata.push({
      ...relationship,
      path: `$.relationships[${index}]`,
      elementIds: elementIds([connection.arrow, ...(connection.label ? [connection.label] : [])]),
      points: connection.points.map(([x, y]) => [x, y]),
    });
  }
  return { edges, metadata };
}

function validateSystem(
  root: Record<string, unknown>,
  ids: Map<string, string>,
  registrySnapshot: RegistrySnapshot,
  diagnostics: DiagramDiagnostic[],
): DiagramSystemSpec | null {
  if (!hasOwn(root, "system")) {
    diagnostics.push(error("MISSING_FIELD", "$.system", "required field 'system' is missing"));
    return null;
  }
  const value = root.system;
  if (!isPlainObject(value)) {
    diagnostics.push(error("INVALID_DOCUMENT", "$.system", "system must be a plain object"));
    return null;
  }
  const id = requiredId(value, "id", "$.system.id", diagnostics);
  if (id) {
    registerId(id, "$.system.id", ids, diagnostics);
  }
  const name = requiredString(value, "name", "$.system.name", STRING_LIMITS.systemName, diagnostics);
  const description = requiredString(
    value,
    "description",
    "$.system.description",
    STRING_LIMITS.systemDescription,
    diagnostics,
  );
  const containers = validateContainers(value, ids, registrySnapshot, diagnostics);
  rejectUnknownFields(value, SYSTEM_FIELDS, "$.system", diagnostics);
  return id && name && description && containers
    ? { id, name, description, containers }
    : null;
}

function validateContainers(
  system: Record<string, unknown>,
  ids: Map<string, string>,
  registrySnapshot: RegistrySnapshot,
  diagnostics: DiagramDiagnostic[],
): DiagramContainerSpec[] | null {
  const path = "$.system.containers";
  if (!hasOwn(system, "containers")) {
    diagnostics.push(error("MISSING_FIELD", path, "required field 'containers' is missing"));
    return null;
  }
  if (!Array.isArray(system.containers)) {
    diagnostics.push(error("INVALID_DOCUMENT", path, "containers must be an array"));
    return null;
  }
  if (system.containers.length < 2 || system.containers.length > 6) {
    diagnostics.push(error(
      "INVALID_CONTAINER_COUNT",
      path,
      "containers must contain between 2 and 6 entries",
    ));
  }

  const containers: DiagramContainerSpec[] = [];
  let complete = true;
  for (const [index, rawContainer] of system.containers.entries()) {
    const containerPath = `${path}[${index}]`;
    if (!isPlainObject(rawContainer)) {
      diagnostics.push(error("INVALID_DOCUMENT", containerPath, "container must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawContainer, "id", `${containerPath}.id`, diagnostics);
    if (id) {
      registerId(id, `${containerPath}.id`, ids, diagnostics);
    }
    const name = requiredString(
      rawContainer,
      "name",
      `${containerPath}.name`,
      STRING_LIMITS.containerName,
      diagnostics,
    );
    const description = requiredString(
      rawContainer,
      "description",
      `${containerPath}.description`,
      STRING_LIMITS.containerDescription,
      diagnostics,
    );
    const technology = requiredString(
      rawContainer,
      "technology",
      `${containerPath}.technology`,
      STRING_LIMITS.technology,
      diagnostics,
    );
    const iconId = optionalString(rawContainer, "iconId", `${containerPath}.iconId`, undefined, diagnostics);
    const status = readSemanticStatus(
      rawContainer,
      `${containerPath}.status`,
      diagnostics,
    );
    if (
      hasOwn(rawContainer, "iconId")
      && (
        registrySnapshot.acquisitionFailed
        || (iconId && registrySnapshot.registry && !resolvesExactly(registrySnapshot.registry, iconId))
      )
    ) {
      diagnostics.push(error(
        "UNKNOWN_ICON_ID",
        `${containerPath}.iconId`,
        iconId
          ? `iconId '${iconId}' does not resolve to an exact asset id`
          : "requested icon could not be resolved",
      ));
    }
    rejectUnknownFields(rawContainer, CONTAINER_FIELDS, containerPath, diagnostics);
    if (
      !id
      || !name
      || !description
      || !technology
      || (hasOwn(rawContainer, "iconId") && !iconId)
      || (hasOwn(rawContainer, "status") && !status)
    ) {
      complete = false;
      continue;
    }
    containers.push({
      id,
      name,
      description,
      technology,
      ...(iconId ? { iconId } : {}),
      ...(status ? { status } : {}),
    });
  }
  return complete ? containers : null;
}

function validateRelationships(
  root: Record<string, unknown>,
  containers: DiagramContainerSpec[],
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): DiagramRelationshipSpec[] | null {
  if (!hasOwn(root, "relationships")) {
    return [];
  }
  const rawRelationships = root.relationships;
  if (!Array.isArray(rawRelationships)) {
    diagnostics.push(error("INVALID_DOCUMENT", "$.relationships", "relationships must be an array"));
    return null;
  }
  if (rawRelationships.length > 8) {
    diagnostics.push(error(
      "INVALID_RELATIONSHIP_COUNT",
      "$.relationships",
      "relationships must contain at most 8 entries",
    ));
  }

  const containerIds = new Set(containers.map((container) => container.id));
  const pairs = new Map<string, { from: string; to: string }>();
  const relationships: DiagramRelationshipSpec[] = [];
  let complete = true;
  for (const [index, rawRelationship] of rawRelationships.entries()) {
    const path = `$.relationships[${index}]`;
    if (!isPlainObject(rawRelationship)) {
      diagnostics.push(error("INVALID_DOCUMENT", path, "relationship must be a plain object"));
      complete = false;
      continue;
    }
    const id = requiredId(rawRelationship, "id", `${path}.id`, diagnostics);
    if (id) {
      registerId(id, `${path}.id`, ids, diagnostics);
    }
    const from = requiredId(rawRelationship, "from", `${path}.from`, diagnostics);
    const to = requiredId(rawRelationship, "to", `${path}.to`, diagnostics);
    const description = requiredString(
      rawRelationship,
      "description",
      `${path}.description`,
      STRING_LIMITS.relationshipDescription,
      diagnostics,
    );
    const technology = optionalString(
      rawRelationship,
      "technology",
      `${path}.technology`,
      STRING_LIMITS.technology,
      diagnostics,
    );
    const status = readSemanticStatus(
      rawRelationship,
      `${path}.status`,
      diagnostics,
    );

    if (from && !containerIds.has(from)) {
      diagnostics.push(error(
        "UNKNOWN_RELATIONSHIP_ENDPOINT",
        `${path}.from`,
        `relationship endpoint '${from}' is not a container id`,
      ));
    }
    if (to && !containerIds.has(to)) {
      diagnostics.push(error(
        "UNKNOWN_RELATIONSHIP_ENDPOINT",
        `${path}.to`,
        `relationship endpoint '${to}' is not a container id`,
      ));
    }
    if (from && to) {
      if (from === to) {
        diagnostics.push(error("SELF_RELATIONSHIP", `${path}.to`, "relationship cannot target itself"));
      } else {
        const pairKey = [from, to].sort().join("\u0000");
        const previous = pairs.get(pairKey);
        if (previous) {
          diagnostics.push(error(
            previous.from === from && previous.to === to
              ? "DUPLICATE_RELATIONSHIP_PAIR"
              : "BIDIRECTIONAL_RELATIONSHIP_PAIR",
            `${path}.to`,
            previous.from === from && previous.to === to
              ? "relationship endpoint pair is duplicated"
              : "reverse relationships for one container pair are not supported",
          ));
        } else {
          pairs.set(pairKey, { from, to });
        }
      }
    }
    rejectUnknownFields(rawRelationship, RELATIONSHIP_FIELDS, path, diagnostics);

    if (
      !id
      || !from
      || !to
      || !description
      || (hasOwn(rawRelationship, "technology") && !technology)
      || (hasOwn(rawRelationship, "status") && !status)
    ) {
      complete = false;
      continue;
    }
    relationships.push({
      id,
      from,
      to,
      description,
      ...(technology ? { technology } : {}),
      ...(status ? { status } : {}),
    });
  }
  return complete ? relationships : null;
}

function requiredTemplate(
  value: Record<string, unknown>,
  diagnostics: DiagramDiagnostic[],
): "c4.container" | null {
  if (!hasOwn(value, "template")) {
    diagnostics.push(error("MISSING_FIELD", "$.template", "required field 'template' is missing"));
    return null;
  }
  if (typeof value.template !== "string" || value.template.trim().length === 0) {
    diagnostics.push(error("INVALID_STRING", "$.template", "template must be a non-empty string"));
    return null;
  }
  const template = value.template.trim();
  if (template !== "c4.container") {
    diagnostics.push(error(
      "UNSUPPORTED_TEMPLATE",
      "$.template",
      `unsupported template '${template}'`,
      "Use 'c4.container'.",
    ));
    return null;
  }
  return template;
}

function resolvesExactly(registry: AssetRegistry, iconId: string): boolean {
  try {
    return registry.resolve(iconId).id === iconId;
  } catch {
    return false;
  }
}

function acquireRegistrySnapshot(
  value: unknown,
  options: DiagramSpecOptions,
): RegistrySnapshot {
  if (options.assetRegistry) {
    return { registry: options.assetRegistry, acquisitionFailed: false };
  }
  if (!containsRequestedIcon(value)) {
    return { registry: null, acquisitionFailed: false };
  }
  try {
    return { registry: AssetRegistry.bundled(), acquisitionFailed: false };
  } catch {
    return { registry: null, acquisitionFailed: true };
  }
}

function containsRequestedIcon(value: unknown): boolean {
  if (!isPlainObject(value) || !isPlainObject(value.system) || !Array.isArray(value.system.containers)) {
    return false;
  }
  return value.system.containers.some((container) =>
    isPlainObject(container) && hasOwn(container, "iconId")
  );
}

function placeCards(cards: PlacedNodeCard[], columns: number): void {
  let y = FIRST_CARD_Y;
  for (let start = 0; start < cards.length; start += columns) {
    const row = cards.slice(start, start + columns);
    for (const [column, card] of row.entries()) {
      const x = SECTION_X + SECTION_PADDING + column * (CARD_WIDTH + COLUMN_GAP);
      card.block.translated(x - card.block.bounds.left, y - card.block.bounds.top);
    }
    y += Math.max(...row.map((card) => card.block.bounds.height)) + ROW_GAP;
  }
}

function columnCount(containerCount: number): number {
  if (containerCount === 2) {
    return 2;
  }
  if (containerCount === 3) {
    return 3;
  }
  if (containerCount === 4) {
    return 2;
  }
  return 3;
}

function gridWidth(containerCount: number): number {
  const columns = columnCount(containerCount);
  return columns * CARD_WIDTH + (columns - 1) * COLUMN_GAP + SECTION_PADDING * 2;
}

function elementIds(elements: Array<Record<string, unknown>>): string[] {
  return elements.flatMap((element) =>
    typeof element.id === "string" ? [element.id] : []
  );
}

function geometryDiagnostic(
  issue: ValidationIssue,
  spec: NormalizedDiagramSpec,
): DiagramDiagnostic {
  return {
    severity: issue.severity === "error" ? "error" : "warning",
    code: "GEOMETRY_ERROR",
    path: geometryIssuePath(issue, spec),
    message: `[${issue.code}] ${issue.message}`,
  };
}

function geometryIssuePath(
  issue: ValidationIssue,
  spec: NormalizedDiagramSpec,
): string {
  for (const [index, relationship] of spec.relationships.entries()) {
    if (issue.ids.includes(relationship.id) || issue.ids.includes(`${relationship.id}.label`)) {
      return `$.relationships[${index}]`;
    }
  }
  for (const [index, container] of spec.system.containers.entries()) {
    if (issue.ids.includes(container.id)) {
      return `$.system.containers[${index}]`;
    }
  }
  return "$";
}
