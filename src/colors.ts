import { BLUE, GRAY, GREEN, LIGHT_GRAY, RED } from "./core.js";

/**
 * Semantic color glossary. Diagrams are monotone blue by default; accent roles
 * are opt-in so PR/change diagrams stay consistent instead of scattering ad-hoc
 * hex literals. See the MVP contract:
 *   blue=normal/unchanged, gray=notes/external, green=added,
 *   purple=changed, red=removed/breaking, amber=risk/warning.
 */

export type ColorRole =
  | "default"
  | "added"
  | "changed"
  | "removed"
  | "risk"
  | "note"
  | "external";

export const PURPLE = "#7c3aed";
export const AMBER = "#d97706";

export const Colors: Record<ColorRole, string> = {
  default: BLUE,
  added: GREEN,
  changed: PURPLE,
  removed: RED,
  risk: AMBER,
  note: GRAY,
  external: LIGHT_GRAY,
};

/** Roles that are neutral (no legend required when used alone or together). */
const NEUTRAL_ROLES = new Set<ColorRole>(["default", "note", "external"]);

const ROLE_LABELS: Record<ColorRole, string> = {
  default: "unchanged",
  added: "added",
  changed: "changed",
  removed: "removed / breaking",
  risk: "risk / warning",
  note: "note",
  external: "external",
};

export function isColorRole(value: string): value is ColorRole {
  return Object.prototype.hasOwnProperty.call(Colors, value);
}

/** Resolve a role name to a hex value; pass-through for explicit colors. */
export function resolveColor(role: ColorRole | string | undefined, fallback: string = BLUE): string {
  if (!role) {
    return fallback;
  }
  return isColorRole(role) ? Colors[role] : role;
}

export function colorLabel(role: ColorRole): string {
  return ROLE_LABELS[role];
}

/** Accent (non-neutral) roles present in a set of roles, de-duplicated. */
export function accentRoles(roles: Iterable<ColorRole>): ColorRole[] {
  const seen: ColorRole[] = [];
  for (const role of roles) {
    if (!NEUTRAL_ROLES.has(role) && !seen.includes(role)) {
      seen.push(role);
    }
  }
  return seen;
}

/** A legend is recommended once more than one accent role is in play. */
export function legendNeeded(roles: Iterable<ColorRole>): boolean {
  return accentRoles(roles).length > 1;
}

export const resolve_color = resolveColor;
export const accent_roles = accentRoles;
export const legend_needed = legendNeeded;
