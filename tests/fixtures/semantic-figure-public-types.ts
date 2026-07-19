import {
  SEMANTIC_FIGURE_NAMES,
  type SemanticFigureName,
  type SemanticRedrawCardSpec,
  type SemanticRedrawExplicitCardSpec,
  type SemanticRedrawLegacyCardSpec,
} from "../../src/index.js";

const legacy: SemanticRedrawLegacyCardSpec = {
  id: "legacy",
  title: "Legacy",
  iconId: "server_stack",
  bullets: ["existing compile contract"],
};

const legacyAlias: SemanticRedrawCardSpec = {
  id: "legacy-alias",
  title: "Legacy alias",
  icon_id: "server_stack",
  bullets: ["existing snake-case contract"],
};

const explicit: SemanticRedrawExplicitCardSpec[] = [
  { id: "card", title: "Card", figure: "card", description: "Generic responsibility." },
  { id: "bullets", title: "Facts", figure: "bullets", bullets: ["first", "second"] },
  { id: "badge", title: "Class", figure: "badge", badge: "Accepted" },
  { id: "actor", title: "Actor", figure: "actor", description: "Starts the session." },
  { id: "store", title: "Store", figure: "store", description: "Persists evidence." },
  { id: "queue", title: "Queue", figure: "queue", description: "Buffers work." },
  { id: "decision", title: "Decision", figure: "decision", description: "Branches on truth." },
  { id: "note", title: "Note", figure: "note", description: "Explains context." },
];

const figures: readonly SemanticFigureName[] = SEMANTIC_FIGURE_NAMES;
void [legacy, legacyAlias, explicit, figures];

// @ts-expect-error legacy cards still require bullets
const missingLegacyBullets: SemanticRedrawCardSpec = {
  id: "missing",
  title: "Missing bullets",
  iconId: "server_stack",
};

// @ts-expect-error explicit actor cannot choose an icon
const explicitIcon: SemanticRedrawCardSpec = {
  id: "actor-icon",
  title: "Actor",
  figure: "actor",
  iconId: "robot_agent",
};

// @ts-expect-error bullets are recipe-specific
const actorBullets: SemanticRedrawCardSpec = {
  id: "actor-bullets",
  title: "Actor",
  figure: "actor",
  bullets: ["not allowed"],
};

// @ts-expect-error badge recipe requires written badge content
const missingBadge: SemanticRedrawCardSpec = {
  id: "missing-badge",
  title: "Badge",
  figure: "badge",
};

void [missingLegacyBullets, explicitIcon, actorBullets, missingBadge];
