import type { AssetRegistry } from "./assets.js";

export type DiagramDiagnosticCode =
  | "INVALID_DOCUMENT"
  | "UNSUPPORTED_TEMPLATE"
  | "UNKNOWN_FIELD"
  | "MISSING_FIELD"
  | "INVALID_STRING"
  | "INVALID_ID"
  | "STRING_TOO_LONG"
  | "INVALID_CONTAINER_COUNT"
  | "INVALID_RELATIONSHIP_COUNT"
  | "INVALID_PARTICIPANT_COUNT"
  | "INVALID_MESSAGE_COUNT"
  | "INVALID_NOTE_COUNT"
  | "DUPLICATE_ID"
  | "UNKNOWN_ICON_ID"
  | "UNKNOWN_RELATIONSHIP_ENDPOINT"
  | "SELF_RELATIONSHIP"
  | "DUPLICATE_RELATIONSHIP_PAIR"
  | "BIDIRECTIONAL_RELATIONSHIP_PAIR"
  | "UNKNOWN_PARTICIPANT_ENDPOINT"
  | "SELF_MESSAGE"
  | "INVALID_MESSAGE_KIND"
  | "UNKNOWN_NOTE_MESSAGE"
  | "DUPLICATE_NOTE_MESSAGE"
  | "INVALID_SEED"
  | "GEOMETRY_ERROR";

export interface DiagramDiagnostic {
  severity: "error" | "warning";
  code: DiagramDiagnosticCode;
  path: string;
  message: string;
  hint?: string;
}

export interface DiagramSpecOptions {
  seed?: number;
  assetRegistry?: AssetRegistry;
}

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function error(
  code: DiagramDiagnosticCode,
  path: string,
  message: string,
  hint?: string,
): DiagramDiagnostic {
  return {
    severity: "error",
    code,
    path,
    message,
    ...(hint ? { hint } : {}),
  };
}

export function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function optionalString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  maxLength: number | undefined,
  diagnostics: DiagramDiagnostic[],
): string | undefined {
  if (!hasOwn(value, field)) {
    return undefined;
  }
  if (typeof value[field] !== "string" || value[field].trim().length === 0) {
    diagnostics.push(error("INVALID_STRING", path, `'${field}' must be a non-empty string when provided`));
    return undefined;
  }
  const normalized = value[field].trim();
  if (maxLength !== undefined && normalized.length > maxLength) {
    diagnostics.push(error(
      "STRING_TOO_LONG",
      path,
      `'${field}' must contain at most ${maxLength} characters`,
    ));
    return undefined;
  }
  return normalized;
}

export function registerId(
  id: string,
  path: string,
  ids: Map<string, string>,
  diagnostics: DiagramDiagnostic[],
): void {
  const previousPath = ids.get(id);
  if (previousPath) {
    diagnostics.push(error(
      "DUPLICATE_ID",
      path,
      `id '${id}' duplicates ${previousPath}`,
    ));
    return;
  }
  ids.set(id, path);
}

export function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  diagnostics: DiagramDiagnostic[],
): void {
  const allowedFields = new Set(allowed);
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      diagnostics.push(error(
        "UNKNOWN_FIELD",
        `${path}.${field}`,
        `unknown field '${field}'`,
      ));
    }
  }
}

export function requiredId(
  value: Record<string, unknown>,
  field: string,
  path: string,
  diagnostics: DiagramDiagnostic[],
): string | null {
  const id = requiredString(value, field, path, undefined, diagnostics);
  if (id && !ID_PATTERN.test(id)) {
    diagnostics.push(error(
      "INVALID_ID",
      path,
      "id must match ^[A-Za-z][A-Za-z0-9_-]{0,63}$",
    ));
    return null;
  }
  return id;
}

export function requiredString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  maxLength: number | undefined,
  diagnostics: DiagramDiagnostic[],
): string | null {
  if (!hasOwn(value, field)) {
    diagnostics.push(error("MISSING_FIELD", path, `required field '${field}' is missing`));
    return null;
  }
  if (typeof value[field] !== "string" || value[field].trim().length === 0) {
    diagnostics.push(error("INVALID_STRING", path, `'${field}' must be a non-empty string`));
    return null;
  }
  const normalized = value[field].trim();
  if (maxLength !== undefined && normalized.length > maxLength) {
    diagnostics.push(error(
      "STRING_TOO_LONG",
      path,
      `'${field}' must contain at most ${maxLength} characters`,
    ));
    return null;
  }
  return normalized;
}

export function validateSeed(
  seed: number | undefined,
  diagnostics: DiagramDiagnostic[],
): void {
  if (seed !== undefined && (!Number.isFinite(seed) || !Number.isInteger(seed))) {
    diagnostics.push(error("INVALID_SEED", "$.seed", "seed must be a finite integer"));
  }
}
