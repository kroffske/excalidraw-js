import type { DiagramDiagnostic } from "./semantic-schema.js";
import { error, hasOwn } from "./semantic-schema.js";

const SEMANTIC_PALETTE_NAMES = [
  "semantic-neutral",
  "change-diff",
  "high-contrast",
  "c4-blue",
] as const;

const SEMANTIC_STATUS_NAMES = [
  "added",
  "changed",
  "removed",
  "risk",
] as const;

export type SemanticPaletteName = typeof SEMANTIC_PALETTE_NAMES[number];

export type SemanticStatus = typeof SEMANTIC_STATUS_NAMES[number];

interface SequencePalette {
  readonly primary: string;
  readonly neutral: string;
  readonly text: string;
}

interface SwimlanePalette extends SequencePalette {
  readonly accent: string;
}

interface C4Palette {
  readonly title: string;
  readonly container: string;
  readonly boundary: string;
  readonly edge: string;
  readonly label: string;
}

interface RedrawPalette {
  readonly actor: string;
  readonly activity: string;
  readonly evidence: string;
  readonly context: string;
  readonly structural: string;
  readonly text: string;
}

interface ResolvedSemanticPalette {
  readonly c4: C4Palette;
  readonly sequence: SequencePalette;
  readonly swimlane: SwimlanePalette;
  readonly redraw: RedrawPalette;
  readonly status: Readonly<Record<SemanticStatus, string>>;
}

const PALETTE_NAMES = new Set<SemanticPaletteName>(SEMANTIC_PALETTE_NAMES);
const STATUS_NAMES = new Set<SemanticStatus>(SEMANTIC_STATUS_NAMES);
const STATUS_LABELS: Readonly<Record<SemanticStatus, string>> = Object.freeze({
  added: "Added",
  changed: "Changed",
  removed: "Removed",
  risk: "Risk",
});

const LEGACY_PALETTE = palette({
  c4: {
    title: "#172554",
    container: "#1e3a8a",
    boundary: "#1e40af",
    edge: "#475569",
    label: "#334155",
  },
  sequence: {
    primary: "#1e3a8a",
    neutral: "#64748b",
    text: "#334155",
  },
  swimlane: {
    primary: "#1e3a8a",
    accent: "#7c3aed",
    neutral: "#64748b",
    text: "#334155",
  },
  redraw: {
    actor: "#0b1fb3",
    activity: "#0b1fb3",
    evidence: "#0b1fb3",
    context: "#0b1fb3",
    structural: "#0b1fb3",
    text: "#0b1fb3",
  },
  status: {
    added: "#15803d",
    changed: "#b45309",
    removed: "#b91c1c",
    risk: "#7e22ce",
  },
});

const PALETTES: Readonly<Record<SemanticPaletteName, ResolvedSemanticPalette>> =
  Object.freeze({
    "semantic-neutral": palette({
      c4: {
        title: "#1f2937",
        container: "#374151",
        boundary: "#4b5563",
        edge: "#6b7280",
        label: "#374151",
      },
      sequence: {
        primary: "#374151",
        neutral: "#6b7280",
        text: "#1f2937",
      },
      swimlane: {
        primary: "#374151",
        accent: "#4b5563",
        neutral: "#6b7280",
        text: "#1f2937",
      },
      redraw: {
        actor: "#1f2937",
        activity: "#374151",
        evidence: "#4b5563",
        context: "#6b7280",
        structural: "#6b7280",
        text: "#1f2937",
      },
      status: {
        added: "#475569",
        changed: "#334155",
        removed: "#1f2937",
        risk: "#111827",
      },
    }),
    "change-diff": palette({
      c4: {
        title: "#312e81",
        container: "#4338ca",
        boundary: "#4f46e5",
        edge: "#475569",
        label: "#334155",
      },
      sequence: {
        primary: "#4338ca",
        neutral: "#64748b",
        text: "#334155",
      },
      swimlane: {
        primary: "#4338ca",
        accent: "#7e22ce",
        neutral: "#64748b",
        text: "#334155",
      },
      redraw: {
        actor: "#312e81",
        activity: "#4338ca",
        evidence: "#7e22ce",
        context: "#64748b",
        structural: "#475569",
        text: "#334155",
      },
      status: {
        added: "#15803d",
        changed: "#b45309",
        removed: "#b91c1c",
        risk: "#7e22ce",
      },
    }),
    "high-contrast": palette({
      c4: {
        title: "#000000",
        container: "#111827",
        boundary: "#000000",
        edge: "#111827",
        label: "#000000",
      },
      sequence: {
        primary: "#000000",
        neutral: "#374151",
        text: "#000000",
      },
      swimlane: {
        primary: "#000000",
        accent: "#a21caf",
        neutral: "#374151",
        text: "#000000",
      },
      redraw: {
        actor: "#000000",
        activity: "#a21caf",
        evidence: "#047857",
        context: "#374151",
        structural: "#111827",
        text: "#000000",
      },
      status: {
        added: "#047857",
        changed: "#92400e",
        removed: "#be123c",
        risk: "#6d28d9",
      },
    }),
    "c4-blue": palette({
      c4: {
        title: "#082f49",
        container: "#075985",
        boundary: "#0369a1",
        edge: "#0c4a6e",
        label: "#082f49",
      },
      sequence: {
        primary: "#075985",
        neutral: "#475569",
        text: "#082f49",
      },
      swimlane: {
        primary: "#075985",
        accent: "#0369a1",
        neutral: "#475569",
        text: "#082f49",
      },
      redraw: {
        actor: "#082f49",
        activity: "#075985",
        evidence: "#0369a1",
        context: "#475569",
        structural: "#0c4a6e",
        text: "#082f49",
      },
      status: {
        added: "#15803d",
        changed: "#b45309",
        removed: "#be123c",
        risk: "#7e22ce",
      },
    }),
  });

export function readSemanticPaletteName(
  value: Record<string, unknown>,
  path: string,
  diagnostics: DiagramDiagnostic[],
): SemanticPaletteName | undefined {
  return readFiniteString(
    value,
    "palette",
    path,
    PALETTE_NAMES,
    "palette must be 'semantic-neutral', 'change-diff', 'high-contrast', or 'c4-blue'",
    diagnostics,
  );
}

export function readSemanticStatus(
  value: Record<string, unknown>,
  path: string,
  diagnostics: DiagramDiagnostic[],
): SemanticStatus | undefined {
  return readFiniteString(
    value,
    "status",
    path,
    STATUS_NAMES,
    "status must be 'added', 'changed', 'removed', or 'risk'",
    diagnostics,
  );
}

export function resolveSemanticPalette(
  name: SemanticPaletteName | undefined,
): ResolvedSemanticPalette {
  return name === undefined ? LEGACY_PALETTE : PALETTES[name];
}

export function semanticStatusColor(
  palette: ResolvedSemanticPalette,
  status: SemanticStatus | undefined,
  fallback: string,
): string {
  return status === undefined ? fallback : palette.status[status];
}

export function withSemanticStatus(
  text: string | undefined,
  status: SemanticStatus | undefined,
): string | undefined {
  if (status === undefined) {
    return text;
  }
  const cue = `Status: ${STATUS_LABELS[status]}`;
  return text ? `${text} · ${cue}` : cue;
}

function readFiniteString<T extends string>(
  value: Record<string, unknown>,
  field: string,
  path: string,
  accepted: ReadonlySet<T>,
  message: string,
  diagnostics: DiagramDiagnostic[],
): T | undefined {
  if (!hasOwn(value, field)) {
    return undefined;
  }
  const candidate = value[field];
  if (typeof candidate !== "string" || !accepted.has(candidate.trim() as T)) {
    diagnostics.push(error("INVALID_STRING", path, message));
    return undefined;
  }
  return candidate.trim() as T;
}

function palette(value: ResolvedSemanticPalette): ResolvedSemanticPalette {
  return Object.freeze({
    c4: Object.freeze({ ...value.c4 }),
    sequence: Object.freeze({ ...value.sequence }),
    swimlane: Object.freeze({ ...value.swimlane }),
    redraw: Object.freeze({ ...value.redraw }),
    status: Object.freeze({ ...value.status }),
  });
}
