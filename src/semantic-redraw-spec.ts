import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { AssetRegistry } from "./assets.js";
import type { BundledPack } from "./assets.js";
import { Scene } from "./core.js";
import type { PlacedBlock } from "./geometry.js";
import * as layout from "./layout.js";

export type SemanticRedrawDensity = "iconic" | "compact" | "default" | "expanded";
export type SemanticRedrawDirection = "left-to-right" | "right-to-left" | "top-down" | "bottom-up";
export type SemanticRedrawEdgeKind = "primary" | "support" | "feedback" | "provenance";

export interface SemanticRedrawSpecDocument {
  title: string;
  subtitle?: string;
  seed?: number;
  assetPack?: BundledPack;
  asset_pack?: BundledPack;
  layout?: {
    type?: "sections";
    density?: SemanticRedrawDensity;
  };
  sections: SemanticRedrawSectionSpec[];
  edges?: SemanticRedrawEdgeSpec[];
}

export interface SemanticRedrawSectionSpec {
  id: string;
  title: string;
  order: number;
  cards: SemanticRedrawCardSpec[];
}

export interface SemanticRedrawCardSpec {
  id: string;
  title: string;
  iconId?: string;
  icon_id?: string;
  bullets: string[];
}

export interface SemanticRedrawEdgeSpec {
  from: string;
  to: string;
  direction?: SemanticRedrawDirection;
  kind?: SemanticRedrawEdgeKind;
  label?: string;
}

export type SemanticRedrawIssueSeverity = "error" | "warning";

export interface SemanticRedrawValidationIssue {
  severity: SemanticRedrawIssueSeverity;
  code: string;
  path: string;
  message: string;
}

export interface SemanticRedrawValidationResult {
  errors: SemanticRedrawValidationIssue[];
  warnings: SemanticRedrawValidationIssue[];
}

export interface SemanticRedrawResult {
  excalidrawPath: string;
  elements: number;
  files: number;
  sections: number;
  cards: number;
  edges: number;
  warnings: SemanticRedrawValidationIssue[];
}

export interface SemanticRedrawWriteOptions {
  failOnDirectionMismatch?: boolean;
}

interface SectionWithIndex {
  section: SemanticRedrawSectionSpec;
  index: number;
}

interface RenderedCard {
  spec: SemanticRedrawCardSpec;
  block: PlacedBlock;
}

const VALID_DENSITIES = new Set<SemanticRedrawDensity>(["iconic", "compact", "default", "expanded"]);
const VALID_DIRECTIONS = new Set<SemanticRedrawDirection>(["left-to-right", "right-to-left", "top-down", "bottom-up"]);
const VALID_EDGE_KINDS = new Set<SemanticRedrawEdgeKind>(["primary", "support", "feedback", "provenance"]);

export function readSemanticRedrawSpec(path: string): SemanticRedrawSpecDocument {
  return JSON.parse(readFileSync(path, "utf8")) as SemanticRedrawSpecDocument;
}

export function validateSemanticRedrawSpec(spec: unknown): SemanticRedrawValidationResult {
  const issues: SemanticRedrawValidationIssue[] = [];
  const registry = AssetRegistry.bundled(resolveAssetPack(spec));

  if (isErrorSpec(spec)) {
    issues.push(error("MODEL_RETURNED_ERROR", "$.error", `${spec.error.code}: ${spec.error.message}`));
    return splitIssues(issues);
  }

  if (!isRecord(spec)) {
    issues.push(error("INVALID_ROOT", "$", "Semantic redraw spec must be a JSON object."));
    return splitIssues(issues);
  }

  if (!isNonEmptyString(spec.title)) {
    issues.push(error("MISSING_TITLE", "$.title", "Spec requires a non-empty title."));
  }
  if (spec.subtitle !== undefined && !isNonEmptyString(spec.subtitle)) {
    issues.push(error("INVALID_SUBTITLE", "$.subtitle", "subtitle must be a non-empty string when provided."));
  }

  const density = isRecord(spec.layout) ? spec.layout.density : undefined;
  if (density !== undefined && (!isString(density) || !VALID_DENSITIES.has(density as SemanticRedrawDensity))) {
    issues.push(error("INVALID_DENSITY", "$.layout.density", "density must be iconic, compact, default, or expanded."));
  }

  if (!Array.isArray(spec.sections)) {
    issues.push(error("INVALID_SECTIONS", "$.sections", "sections must be an array."));
    return splitIssues(issues);
  }
  if (spec.sections.length < 2) {
    issues.push(error("TOO_FEW_SECTIONS", "$.sections", "Semantic redraw specs need at least 2 sections."));
  }

  const sectionIds = new Set<string>();
  const sectionOrders = new Map<number, string>();
  const cardIds = new Set<string>();
  const iconCounts = new Map<string, number>();
  let cardCount = 0;

  spec.sections.forEach((section, sectionIndex) => {
    const sectionPath = `$.sections[${sectionIndex}]`;
    if (!isRecord(section)) {
      issues.push(error("INVALID_SECTION", sectionPath, "section must be an object."));
      return;
    }

    const sectionId = section.id;
    if (!isNonEmptyString(sectionId)) {
      issues.push(error("MISSING_SECTION_ID", `${sectionPath}.id`, "section requires a non-empty id."));
    } else if (sectionIds.has(sectionId)) {
      issues.push(error("DUPLICATE_SECTION_ID", `${sectionPath}.id`, `Duplicate section id '${sectionId}'.`));
    } else {
      sectionIds.add(sectionId);
    }

    if (!isNonEmptyString(section.title)) {
      issues.push(error("MISSING_SECTION_TITLE", `${sectionPath}.title`, "section requires a non-empty title."));
    }

    if (!isFiniteNumber(section.order)) {
      issues.push(error("INVALID_SECTION_ORDER", `${sectionPath}.order`, "section order must be a finite number."));
    } else {
      const previous = sectionOrders.get(section.order);
      if (previous) {
        issues.push(error("DUPLICATE_SECTION_ORDER", `${sectionPath}.order`, `Section order ${section.order} is already used by '${previous}'.`));
      } else if (isNonEmptyString(sectionId)) {
        sectionOrders.set(section.order, sectionId);
      }
    }

    if (!Array.isArray(section.cards)) {
      issues.push(error("INVALID_SECTION_CARDS", `${sectionPath}.cards`, "section.cards must be an array."));
      return;
    }
    if (section.cards.length === 0) {
      issues.push(error("EMPTY_SECTION", `${sectionPath}.cards`, "each section must contain at least one card."));
    }

    section.cards.forEach((card, cardIndex) => {
      const cardPath = `${sectionPath}.cards[${cardIndex}]`;
      if (!isRecord(card)) {
        issues.push(error("INVALID_CARD", cardPath, "card must be an object."));
        return;
      }

      const cardId = card.id;
      if (!isNonEmptyString(cardId)) {
        issues.push(error("MISSING_CARD_ID", `${cardPath}.id`, "card requires a non-empty id."));
      } else if (cardIds.has(cardId)) {
        issues.push(error("DUPLICATE_CARD_ID", `${cardPath}.id`, `Duplicate card id '${cardId}'.`));
      } else {
        cardIds.add(cardId);
      }

      if (!isNonEmptyString(card.title)) {
        issues.push(error("MISSING_CARD_TITLE", `${cardPath}.title`, "card requires a non-empty title."));
      }

      const iconId = card.iconId ?? card.icon_id;
      if (!isNonEmptyString(iconId)) {
        issues.push(error("MISSING_ICON_ID", `${cardPath}.iconId`, "card requires iconId."));
      } else {
        try {
          const resolved = registry.resolve(iconId);
          iconCounts.set(resolved.id, (iconCounts.get(resolved.id) ?? 0) + 1);
        } catch (cause) {
          issues.push(error("UNKNOWN_ICON_ID", `${cardPath}.iconId`, cause instanceof Error ? cause.message : `Unknown icon id '${iconId}'.`));
        }
      }

      const bullets = card.bullets;
      if (!Array.isArray(bullets)) {
        issues.push(error("INVALID_BULLETS", `${cardPath}.bullets`, "bullets must be an array of 1-3 strings, never a single string."));
        return;
      }
      if (bullets.length < 1 || bullets.length > 3) {
        issues.push(error("INVALID_BULLET_COUNT", `${cardPath}.bullets`, "cards must have 1-3 bullets."));
      }
      bullets.forEach((bullet, bulletIndex) => {
        const bulletPath = `${cardPath}.bullets[${bulletIndex}]`;
        if (!isNonEmptyString(bullet)) {
          issues.push(error("INVALID_BULLET", bulletPath, "each bullet must be a non-empty string."));
        } else if (bullet.length > 80) {
          issues.push(warning("LONG_BULLET", bulletPath, "bullet is long enough to risk cramped card text."));
        } else if (/^[-*]\s*/.test(bullet)) {
          issues.push(warning("BULLET_PREFIX", bulletPath, "bullet text should not include its own '-' or '*' prefix."));
        }
      });

      cardCount += 1;
    });
  });

  if (cardCount < 3) {
    issues.push(error("TOO_FEW_CARDS", "$.sections", "Semantic redraw specs need at least 3 cards."));
  }

  const repeatedIcon = [...iconCounts.entries()].find(([, count]) => cardCount >= 3 && count === cardCount);
  if (repeatedIcon) {
    issues.push(error("SINGLE_ICON_FOR_ALL_CARDS", "$.sections", `All ${cardCount} cards use '${repeatedIcon[0]}'; choose specific icons instead of one generic icon.`));
  }

  validateEdges(spec.edges, cardIds, issues);
  return splitIssues(issues);
}

export function writeSemanticRedrawDiagram(
  spec: SemanticRedrawSpecDocument,
  excalidrawPath: string,
  options: SemanticRedrawWriteOptions = {},
): SemanticRedrawResult {
  const validation = validateSemanticRedrawSpec(spec);
  if (validation.errors.length > 0) {
    throw new Error(formatValidationFailure(validation.errors));
  }

  mkdirSync(dirname(excalidrawPath), { recursive: true });
  const assetPack = spec.assetPack ?? spec.asset_pack ?? "core";
  const registry = AssetRegistry.bundled(assetPack);
  const scene = new Scene({
    seed: spec.seed ?? 20260629,
    assetRegistry: registry,
    background: "#ffffff",
  });
  const density = spec.layout?.density ?? "compact";
  const metrics = metricsForDensity(density);
  const orderedSections = orderedSectionSpecs(spec.sections);
  const titleWidth = Math.max(1160, orderedSections.length * (metrics.sectionWidth + metrics.sectionGap) - metrics.sectionGap);

  if (spec.title) {
    scene.text(40, 24, spec.title, { size: 30, width: titleWidth, align: "center" });
  }
  if (spec.subtitle) {
    scene.text(40, 64, spec.subtitle, { size: 16, color: "#475569", width: titleWidth, align: "center" });
  }

  const cardById = new Map<string, RenderedCard>();
  orderedSections.forEach(({ section }, sectionIndex) => {
    const cards = layout.distributeVertical(
      section.cards.map((card) => {
        const resolvedIcon = registry.resolve(card.iconId ?? card.icon_id ?? "").id;
        const block = layout.iconPanel(scene, 0, 0, metrics.cardWidth, metrics.cardHeight, {
          title: card.title,
          iconId: resolvedIcon,
          bullets: card.bullets,
          iconSize: metrics.iconSize,
          titleSize: metrics.titleSize,
          bulletSize: metrics.bulletSize,
          bulletGap: metrics.bulletGap,
        });
        cardById.set(card.id, { spec: card, block });
        return block;
      }),
      0,
      0,
      { gap: metrics.cardGap },
    );

    layout.section(scene, {
      title: section.title,
      x: 40 + sectionIndex * (metrics.sectionWidth + metrics.sectionGap),
      y: metrics.bodyY,
      padding: 24,
      titleHeight: 40,
      headerGap: 8,
      minWidth: metrics.sectionWidth,
      minHeight: Math.max(metrics.sectionMinHeight, cards.length * (metrics.cardHeight + metrics.cardGap) + 96),
      children: cards,
    });
  });

  const directionValidation = splitIssues(connectSpecEdges(scene, spec.edges ?? [], cardById, options));
  if (directionValidation.errors.length > 0) {
    throw new Error(formatValidationFailure(directionValidation.errors));
  }

  scene.write(excalidrawPath);
  const data = JSON.parse(readFileSync(excalidrawPath, "utf8")) as {
    type?: string;
    elements?: Array<Record<string, unknown>>;
    files?: Record<string, unknown>;
  };
  if (data.type !== "excalidraw" || !data.elements?.length) {
    throw new Error(`Invalid semantic redraw diagram: ${excalidrawPath}`);
  }
  const oneCharacterBullets = data.elements.filter((element) => element.type === "text" && /^-\s\S$/.test(String(element.text ?? "")));
  if (oneCharacterBullets.length > 0) {
    throw new Error(`Invalid semantic redraw diagram: found ${oneCharacterBullets.length} one-character bullet text elements.`);
  }

  return {
    excalidrawPath,
    elements: data.elements.length,
    files: Object.keys(data.files ?? {}).length,
    sections: spec.sections.length,
    cards: cardById.size,
    edges: spec.edges?.length ?? 0,
    warnings: [...validation.warnings, ...directionValidation.warnings],
  };
}

function validateEdges(edges: unknown, cardIds: Set<string>, issues: SemanticRedrawValidationIssue[]): void {
  if (edges === undefined) {
    return;
  }
  if (!Array.isArray(edges)) {
    issues.push(error("INVALID_EDGES", "$.edges", "edges must be an array when provided."));
    return;
  }
  edges.forEach((edge, edgeIndex) => {
    const edgePath = `$.edges[${edgeIndex}]`;
    if (!isRecord(edge)) {
      issues.push(error("INVALID_EDGE", edgePath, "edge must be an object."));
      return;
    }
    if (!isNonEmptyString(edge.from)) {
      issues.push(error("MISSING_EDGE_FROM", `${edgePath}.from`, "edge requires from card id."));
    } else if (!cardIds.has(edge.from)) {
      issues.push(error("UNKNOWN_EDGE_FROM", `${edgePath}.from`, `Unknown edge source '${edge.from}'.`));
    }
    if (!isNonEmptyString(edge.to)) {
      issues.push(error("MISSING_EDGE_TO", `${edgePath}.to`, "edge requires to card id."));
    } else if (!cardIds.has(edge.to)) {
      issues.push(error("UNKNOWN_EDGE_TO", `${edgePath}.to`, `Unknown edge target '${edge.to}'.`));
    }
    if (edge.direction !== undefined && (!isString(edge.direction) || !VALID_DIRECTIONS.has(edge.direction as SemanticRedrawDirection))) {
      issues.push(error("INVALID_EDGE_DIRECTION", `${edgePath}.direction`, "direction must be left-to-right, right-to-left, top-down, or bottom-up."));
    }
    if (edge.kind !== undefined && (!isString(edge.kind) || !VALID_EDGE_KINDS.has(edge.kind as SemanticRedrawEdgeKind))) {
      issues.push(error("INVALID_EDGE_KIND", `${edgePath}.kind`, "kind must be primary, support, feedback, or provenance."));
    }
    if (edge.label !== undefined && !isNonEmptyString(edge.label)) {
      issues.push(error("INVALID_EDGE_LABEL", `${edgePath}.label`, "edge label must be a non-empty string when provided."));
    }
  });
}

function connectSpecEdges(
  scene: Scene,
  edges: SemanticRedrawEdgeSpec[],
  cardById: Map<string, RenderedCard>,
  options: SemanticRedrawWriteOptions,
): SemanticRedrawValidationIssue[] {
  const issues: SemanticRedrawValidationIssue[] = [];
  edges.forEach((edge, edgeIndex) => {
    const source = cardById.get(edge.from);
    const target = cardById.get(edge.to);
    if (!source || !target) {
      return;
    }
    const inferred = inferDirection(source.block, target.block);
    if (edge.direction && edge.direction !== inferred) {
      const message = `Declared direction '${edge.direction}' does not match placed geometry '${inferred}' for '${edge.from}' -> '${edge.to}'. Omit direction or fix the relationship.`;
      if (options.failOnDirectionMismatch ?? false) {
        issues.push(error(
          "EDGE_DIRECTION_MISMATCH",
          `$.edges[${edgeIndex}].direction`,
          message,
        ));
        return;
      }
      issues.push(warning(
        "EDGE_DIRECTION_OVERRIDDEN",
        `$.edges[${edgeIndex}].direction`,
        `${message} The renderer used '${inferred}' for this diagram.`,
      ));
    }
    const kind = edge.kind ?? "primary";
    layout.connectRouted(scene, source.block, target.block, {
      direction: inferred,
      path: "orthogonal",
      label: edge.label,
      labelWidth: 150,
      labelSize: 12,
      dashed: kind === "feedback" || kind === "provenance",
      kind: kind === "feedback" || kind === "provenance" ? kind : undefined,
    });
  });
  return issues;
}

function inferDirection(source: PlacedBlock, target: PlacedBlock): SemanticRedrawDirection {
  const dx = target.bounds.centerX - source.bounds.centerX;
  const dy = target.bounds.centerY - source.bounds.centerY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "left-to-right" : "right-to-left";
  }
  return dy >= 0 ? "top-down" : "bottom-up";
}

function orderedSectionSpecs(sections: SemanticRedrawSectionSpec[]): SectionWithIndex[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => a.section.order - b.section.order || a.index - b.index);
}

function metricsForDensity(density: SemanticRedrawDensity): {
  bodyY: number;
  sectionWidth: number;
  sectionGap: number;
  sectionMinHeight: number;
  cardWidth: number;
  cardHeight: number;
  cardGap: number;
  iconSize: number;
  titleSize: number;
  bulletSize: number;
  bulletGap: number;
} {
  if (density === "iconic") {
    return { bodyY: 112, sectionWidth: 318, sectionGap: 36, sectionMinHeight: 340, cardWidth: 258, cardHeight: 94, cardGap: 20, iconSize: 42, titleSize: 16, bulletSize: 12, bulletGap: 19 };
  }
  if (density === "default" || density === "expanded") {
    return { bodyY: 118, sectionWidth: 390, sectionGap: 44, sectionMinHeight: 430, cardWidth: 330, cardHeight: 126, cardGap: 24, iconSize: 46, titleSize: 17, bulletSize: 13, bulletGap: 22 };
  }
  return { bodyY: 112, sectionWidth: 360, sectionGap: 40, sectionMinHeight: 390, cardWidth: 300, cardHeight: 112, cardGap: 22, iconSize: 44, titleSize: 17, bulletSize: 12, bulletGap: 20 };
}

function formatValidationFailure(errors: SemanticRedrawValidationIssue[]): string {
  const details = errors.map((issue) => `${issue.path} ${issue.code}: ${issue.message}`).join("; ");
  return `Semantic redraw spec validation failed: ${details}`;
}

function splitIssues(issues: SemanticRedrawValidationIssue[]): SemanticRedrawValidationResult {
  return {
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}

function error(code: string, path: string, message: string): SemanticRedrawValidationIssue {
  return { severity: "error", code, path, message };
}

function warning(code: string, path: string, message: string): SemanticRedrawValidationIssue {
  return { severity: "warning", code, path, message };
}

function resolveAssetPack(spec: unknown): BundledPack {
  if (!isRecord(spec)) {
    return "core";
  }
  const pack = spec.assetPack ?? spec.asset_pack;
  return pack === "trading" ? "trading" : "core";
}

function isErrorSpec(value: unknown): value is { error: { code: string; message: string } } {
  return isRecord(value)
    && isRecord(value.error)
    && isNonEmptyString(value.error.code)
    && isNonEmptyString(value.error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
