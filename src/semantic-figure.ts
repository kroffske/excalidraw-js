import { AssetRegistry } from "./assets.js";
import { Scene } from "./core.js";
import { ElementLike, PlacedBlock, elementBounds } from "./geometry.js";
import { PlacedNodeCard, nodeCard } from "./node.js";

export const SEMANTIC_FIGURE_NAMES = [
  "card",
  "bullets",
  "badge",
  "actor",
  "store",
  "queue",
  "decision",
  "note",
] as const;

export type SemanticFigureName = typeof SEMANTIC_FIGURE_NAMES[number];

export interface SemanticFigureSpec {
  id: string;
  figure: SemanticFigureName;
  title: string;
  description?: string;
  bullets?: string[];
  badge?: string;
  x?: number;
  y?: number;
  width?: number;
  strict?: boolean;
}

export interface RenderedSemanticFigure {
  id: string;
  figure: SemanticFigureName;
  connectable: boolean;
  block: PlacedBlock;
  frame: ElementLike;
  overflowed: boolean;
  warnings: string[];
}

interface SemanticFigureTheme {
  readonly actor: string;
  readonly activity: string;
  readonly evidence: string;
  readonly context: string;
  readonly text: string;
}

type SemanticFigureRole = "actor" | "activity" | "evidence" | "context";

const CONNECTABLE_FIGURES = new Set<SemanticFigureName>([
  "card",
  "actor",
  "store",
  "queue",
  "decision",
]);
const ACTOR_ASSET_ID = "agents_robot_agent_01-01";
const STORE_ASSET_ID = "data_memory_database_02-25";
const FIGURE_CUES: Partial<Record<SemanticFigureName, string>> = {
  actor: "Actor",
  store: "Store",
  queue: "Queue",
  decision: "Decision",
  note: "Note",
};
const DECORATION_FOOTER_HEIGHT = 34;
let bundledCoreRegistry: AssetRegistry | null = null;

export function renderSemanticFigure(
  scene: Scene,
  spec: SemanticFigureSpec,
  theme?: SemanticFigureTheme,
): RenderedSemanticFigure {
  assertSemanticFigureSpec(spec);

  const accent = theme?.[semanticFigureRole(spec.figure)];
  const card = nodeCard(scene, {
    id: spec.id,
    title: spec.title,
    badge: spec.figure === "badge"
      ? spec.badge
      : FIGURE_CUES[spec.figure],
    ...(spec.figure === "bullets" ? { bullets: spec.bullets } : {}),
    ...(
      spec.description === undefined
        ? {}
        : {
          rows: [{
            id: `${spec.id}.description`,
            text: spec.description,
            size: 13,
            minSize: 11,
            maxLines: 3,
          }],
        }
    ),
    ...iconOptions(spec.figure),
    x: spec.x,
    y: spec.y,
    width: spec.width,
    strict: spec.strict,
    ...(theme ? { color: theme.text } : {}),
  });

  normalizeFrameBounds(card);
  if (accent) {
    applySemanticFigureAccent(card, accent);
  }
  const decorations = decorateFigure(scene, card, spec.figure, accent);
  const block = decorations.length === 0
    ? card.block
    : scene.group([...card.block.elements, ...decorations]);
  block.bounds = elementBounds(card.frame);

  const connectable = isSemanticFigureConnectable(spec.figure);
  if (connectable) {
    block.withBindingTarget(card.frame);
  } else {
    block.bindingTarget = undefined;
  }

  return {
    id: spec.id,
    figure: spec.figure,
    connectable,
    block,
    frame: card.frame,
    overflowed: card.overflowed,
    warnings: card.warnings,
  };
}

export function isSemanticFigureConnectable(
  figure: SemanticFigureName,
): boolean {
  return CONNECTABLE_FIGURES.has(figure);
}

function iconOptions(
  figure: SemanticFigureName,
): Pick<Parameters<typeof nodeCard>[1], "iconId" | "iconRegistry"> {
  if (figure === "actor") {
    return { iconId: ACTOR_ASSET_ID, iconRegistry: coreRegistry() };
  }
  if (figure === "store") {
    return { iconId: STORE_ASSET_ID, iconRegistry: coreRegistry() };
  }
  return {};
}

function coreRegistry(): AssetRegistry {
  bundledCoreRegistry ??= AssetRegistry.bundled("core");
  return bundledCoreRegistry;
}

function normalizeFrameBounds(card: PlacedNodeCard): void {
  card.frame.width = Math.ceil(Number(card.frame.width));
  card.frame.height = Math.ceil(Number(card.frame.height));
  card.bounds = elementBounds(card.frame);
}

function semanticFigureRole(figure: SemanticFigureName): SemanticFigureRole {
  switch (figure) {
    case "actor":
      return "actor";
    case "card":
    case "queue":
    case "decision":
      return "activity";
    case "store":
    case "bullets":
      return "evidence";
    case "badge":
    case "note":
      return "context";
  }
}

function applySemanticFigureAccent(
  card: PlacedNodeCard,
  accent: string,
): void {
  card.frame.strokeColor = accent;
  if (card.badge) {
    card.badge.frame.strokeColor = accent;
    card.badge.text.strokeColor = accent;
  }
}

function decorateFigure(
  scene: Scene,
  card: PlacedNodeCard,
  figure: SemanticFigureName,
  accent?: string,
): ElementLike[] {
  if (figure === "queue") {
    const footerTop = addDecorationFooter(card);
    return [0, 1, 2].map((index) =>
      scene.rect(
        card.bounds.left + 16 + index * 20,
        footerTop + 8,
        14,
        18,
        accent ? { color: accent, strokeWidth: 1 } : { strokeWidth: 1 },
      ));
  }
  if (figure === "decision") {
    const footerTop = addDecorationFooter(card);
    const diamond = accent
      ? scene.base(accent, 1)
      : scene.base(undefined, 1);
    Object.assign(diamond, {
      type: "diamond",
      x: card.bounds.left + 16,
      y: footerTop + 7,
      width: 20,
      height: 20,
    });
    return [scene.add(diamond)];
  }
  if (figure === "note") {
    const fold = Math.min(24, Math.max(16, card.bounds.width * 0.08));
    const top = card.bounds.top;
    const right = card.bounds.right;
    return [
      scene.line(
        [[right - fold, top], [right, top + fold]],
        accent ? { color: accent, strokeWidth: 1 } : { strokeWidth: 1 },
      ),
      scene.line(
        [[right - fold, top], [right - fold, top + fold]],
        accent ? { color: accent, strokeWidth: 1 } : { strokeWidth: 1 },
      ),
      scene.line(
        [[right - fold, top + fold], [right, top + fold]],
        accent ? { color: accent, strokeWidth: 1 } : { strokeWidth: 1 },
      ),
    ];
  }
  return [];
}

function addDecorationFooter(card: PlacedNodeCard): number {
  const frameHeight = Number(card.frame.height);
  card.frame.height = frameHeight + DECORATION_FOOTER_HEIGHT;
  return card.bounds.top + frameHeight;
}

function assertSemanticFigureSpec(spec: SemanticFigureSpec): void {
  if (!(SEMANTIC_FIGURE_NAMES as readonly unknown[]).includes(spec.figure)) {
    throw new Error(
      `semantic figure [${spec.id}] unknown figure '${String(spec.figure)}'`,
    );
  }
  if (!spec.title.trim()) {
    throw new Error(`semantic figure [${spec.id}] requires a non-empty title`);
  }

  if (spec.figure === "bullets") {
    if (
      !Array.isArray(spec.bullets)
      || spec.bullets.length < 1
      || spec.bullets.length > 5
      || spec.bullets.some((bullet) => !bullet.trim())
    ) {
      throw new Error(
        `semantic figure [${spec.id}] bullets requires 1-5 non-empty items`,
      );
    }
  } else if (spec.bullets !== undefined) {
    throw new Error(
      `semantic figure [${spec.id}] '${spec.figure}' does not accept bullets`,
    );
  }

  if (spec.figure === "badge") {
    if (!spec.badge?.trim()) {
      throw new Error(
        `semantic figure [${spec.id}] badge requires a written classification`,
      );
    }
  } else if (spec.badge !== undefined) {
    throw new Error(
      `semantic figure [${spec.id}] '${spec.figure}' does not accept badge`,
    );
  }

  if (
    spec.description !== undefined
    && (!spec.description.trim() || spec.figure === "bullets" || spec.figure === "badge")
  ) {
    throw new Error(
      `semantic figure [${spec.id}] '${spec.figure}' does not accept this description`,
    );
  }
}
