export type NativeBindingMode = "inside" | "orbit" | "skip";

export type NativeFixedPoint = [number, number];

export interface NativeFixedPointBinding {
  elementId: string;
  fixedPoint: NativeFixedPoint;
  mode: NativeBindingMode;
}

export interface NativeBoundElement {
  id: string;
  type: "arrow" | "text";
}

export type NativeBindingIssueCode =
  | "duplicate-element-id"
  | "malformed-binding"
  | "legacy-binding"
  | "invalid-binding-mode"
  | "invalid-fixed-point"
  | "dangling-binding-target"
  | "deleted-binding-target"
  | "unsupported-binding-target"
  | "malformed-bound-elements"
  | "missing-arrow-reciprocal"
  | "duplicate-arrow-reciprocal"
  | "dangling-arrow-reciprocal"
  | "non-arrow-reciprocal"
  | "stale-arrow-reciprocal";

export interface NativeBindingIssue {
  code: NativeBindingIssueCode;
  message: string;
  elementId?: string;
  field?: string;
  targetId?: string;
}

export interface NativeBindingValidationResult {
  valid: boolean;
  issues: NativeBindingIssue[];
}

export class NativeBindingValidationError extends Error {
  readonly result: NativeBindingValidationResult;

  constructor(result: NativeBindingValidationResult) {
    const count = result.issues.length;
    super(`Native Excalidraw binding validation failed with ${count} issue${count === 1 ? "" : "s"}.`);
    this.name = "NativeBindingValidationError";
    this.result = result;
  }
}

type RawElement = Record<string, unknown>;

const BINDING_FIELDS = ["startBinding", "endBinding"] as const;
const BINDING_MODES = new Set<NativeBindingMode>(["inside", "orbit", "skip"]);
const BINDABLE_TARGET_TYPES = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "text",
  "image",
  "iframe",
  "embeddable",
  "frame",
  "magicframe",
]);
const FIXED_POINT_BOUND = 10;
const FIXED_POINT_MIDPOINT = 0.5;
const NORMALIZED_MIDPOINT = 0.5001;
const MIDPOINT_EPSILON = 0.0001;

export function validateNativeBindings(elements: readonly unknown[]): NativeBindingValidationResult {
  try {
    return validateElements(elements);
  } catch {
    const issues: NativeBindingIssue[] = [{
      code: "malformed-binding",
      message: "Elements could not be inspected as a native Excalidraw binding graph.",
      field: "elements",
    }];
    return { valid: false, issues };
  }
}

export function assertNativeBindings(elements: readonly unknown[]): void {
  const result = validateNativeBindings(elements);
  if (!result.valid) {
    throw new NativeBindingValidationError(result);
  }
}

function validateElements(elements: readonly unknown[]): NativeBindingValidationResult {
  if (!Array.isArray(elements)) {
    const issues: NativeBindingIssue[] = [{
      code: "malformed-binding",
      message: "Native Excalidraw binding validation requires an array of elements.",
      field: "elements",
    }];
    return { valid: false, issues };
  }

  const issues: NativeBindingIssue[] = [];
  const rawElements = elements.map(asElement);
  const elementsById = new Map<string, RawElement>();
  const idCounts = new Map<string, number>();

  for (const element of rawElements) {
    const id = elementId(element);
    if (id === undefined) {
      continue;
    }
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    if (!elementsById.has(id)) {
      elementsById.set(id, element);
    }
  }

  for (const [id, count] of idCounts) {
    if (count > 1) {
      issues.push({
        code: "duplicate-element-id",
        message: `Element id '${id}' occurs ${count} times.`,
        elementId: id,
        field: "id",
      });
    }
  }

  const declaredRelations = new Map<string, Set<string>>();
  const expectedReciprocals = new Map<string, Set<string>>();

  for (const element of rawElements) {
    if (element.type !== "arrow" || isDeleted(element)) {
      continue;
    }

    const arrowId = elementId(element);
    for (const field of BINDING_FIELDS) {
      const binding = element[field];
      if (binding === null || binding === undefined) {
        continue;
      }

      validateBinding({
        binding,
        field,
        arrowId,
        issues,
        idCounts,
        elementsById,
        declaredRelations,
        expectedReciprocals,
      });
    }
  }

  for (const target of rawElements) {
    if (isDeleted(target)) {
      continue;
    }

    validateReciprocals({
      target,
      issues,
      idCounts,
      elementsById,
      declaredRelations,
      expectedReciprocals,
    });
  }

  return { valid: issues.length === 0, issues };
}

interface BindingValidationContext {
  binding: unknown;
  field: typeof BINDING_FIELDS[number];
  arrowId: string | undefined;
  issues: NativeBindingIssue[];
  idCounts: ReadonlyMap<string, number>;
  elementsById: ReadonlyMap<string, RawElement>;
  declaredRelations: Map<string, Set<string>>;
  expectedReciprocals: Map<string, Set<string>>;
}

function validateBinding(context: BindingValidationContext): void {
  const {
    binding,
    field,
    arrowId,
    issues,
    idCounts,
    elementsById,
    declaredRelations,
    expectedReciprocals,
  } = context;

  if (!isRecord(binding)) {
    issues.push({
      code: "malformed-binding",
      message: `Arrow binding '${field}' must be an object or null.`,
      elementId: arrowId,
      field,
    });
    return;
  }

  const targetId = nonEmptyString(binding.elementId);
  if (targetId === undefined) {
    issues.push({
      code: "malformed-binding",
      message: `Arrow binding '${field}' must contain a non-empty string elementId.`,
      elementId: arrowId,
      field,
    });
  } else if (arrowId !== undefined) {
    addRelation(declaredRelations, targetId, arrowId);
  }

  if (Object.prototype.hasOwnProperty.call(binding, "focus")
    || Object.prototype.hasOwnProperty.call(binding, "gap")) {
    issues.push({
      code: "legacy-binding",
      message: `Arrow binding '${field}' uses legacy focus/gap metadata.`,
      elementId: arrowId,
      field,
      targetId,
    });
  }

  if (typeof binding.mode !== "string" || !BINDING_MODES.has(binding.mode as NativeBindingMode)) {
    issues.push({
      code: "invalid-binding-mode",
      message: `Arrow binding '${field}' must use mode 'inside', 'orbit', or 'skip'.`,
      elementId: arrowId,
      field,
      targetId,
    });
  }

  if (!isNormalizedFixedPoint(binding.fixedPoint)) {
    issues.push({
      code: "invalid-fixed-point",
      message: `Arrow binding '${field}' must contain a normalized finite fixedPoint in [-10, 10].`,
      elementId: arrowId,
      field,
      targetId,
    });
  }

  if (targetId === undefined) {
    return;
  }

  if ((idCounts.get(targetId) ?? 0) === 0) {
    issues.push({
      code: "dangling-binding-target",
      message: `Arrow binding '${field}' references missing target '${targetId}'.`,
      elementId: arrowId,
      field,
      targetId,
    });
    return;
  }

  if (idCounts.get(targetId) !== 1) {
    return;
  }

  const target = elementsById.get(targetId);
  if (!target) {
    return;
  }

  if (isDeleted(target)) {
    issues.push({
      code: "deleted-binding-target",
      message: `Arrow binding '${field}' references deleted target '${targetId}'.`,
      elementId: arrowId,
      field,
      targetId,
    });
    return;
  }

  if (!isSupportedTarget(target)) {
    issues.push({
      code: "unsupported-binding-target",
      message: `Arrow binding '${field}' references target '${targetId}' that is not a current bindable element.`,
      elementId: arrowId,
      field,
      targetId,
    });
    return;
  }

  if (arrowId !== undefined) {
    addRelation(expectedReciprocals, targetId, arrowId);
  }
}

interface ReciprocalValidationContext {
  target: RawElement;
  issues: NativeBindingIssue[];
  idCounts: ReadonlyMap<string, number>;
  elementsById: ReadonlyMap<string, RawElement>;
  declaredRelations: ReadonlyMap<string, ReadonlySet<string>>;
  expectedReciprocals: ReadonlyMap<string, ReadonlySet<string>>;
}

function validateReciprocals(context: ReciprocalValidationContext): void {
  const {
    target,
    issues,
    idCounts,
    elementsById,
    declaredRelations,
    expectedReciprocals,
  } = context;
  const targetId = elementId(target);
  const boundElements = target.boundElements;

  if (boundElements === null || boundElements === undefined) {
    addMissingReciprocalIssues(targetId, new Map(), expectedReciprocals, issues);
    return;
  }

  if (!Array.isArray(boundElements)) {
    issues.push({
      code: "malformed-bound-elements",
      message: "Element boundElements must be an array or null.",
      elementId: targetId,
      field: "boundElements",
    });
    return;
  }

  const arrowEntryCounts = new Map<string, number>();
  for (const entry of boundElements) {
    if (!isRecord(entry)
      || nonEmptyString(entry.id) === undefined
      || (entry.type !== "arrow" && entry.type !== "text")) {
      issues.push({
        code: "malformed-bound-elements",
        message: "Each boundElements entry must contain a non-empty id and type 'arrow' or 'text'.",
        elementId: targetId,
        field: "boundElements",
      });
      continue;
    }

    if (entry.type === "arrow") {
      const arrowId = entry.id as string;
      arrowEntryCounts.set(arrowId, (arrowEntryCounts.get(arrowId) ?? 0) + 1);
    }
  }

  addMissingReciprocalIssues(targetId, arrowEntryCounts, expectedReciprocals, issues);

  for (const [arrowId, count] of arrowEntryCounts) {
    if (count > 1) {
      issues.push({
        code: "duplicate-arrow-reciprocal",
        message: `Element '${targetId ?? "<unknown>"}' lists arrow '${arrowId}' ${count} times.`,
        elementId: targetId,
        field: "boundElements",
        targetId: arrowId,
      });
    }

    if ((idCounts.get(arrowId) ?? 0) === 0) {
      issues.push({
        code: "dangling-arrow-reciprocal",
        message: `Element '${targetId ?? "<unknown>"}' lists missing arrow '${arrowId}'.`,
        elementId: targetId,
        field: "boundElements",
        targetId: arrowId,
      });
      continue;
    }

    if (idCounts.get(arrowId) !== 1) {
      continue;
    }

    const arrow = elementsById.get(arrowId);
    if (!arrow || arrow.type !== "arrow") {
      issues.push({
        code: "non-arrow-reciprocal",
        message: `Element '${targetId ?? "<unknown>"}' lists non-arrow element '${arrowId}' as an arrow.`,
        elementId: targetId,
        field: "boundElements",
        targetId: arrowId,
      });
      continue;
    }

    if (isDeleted(arrow)
      || targetId === undefined
      || !declaredRelations.get(targetId)?.has(arrowId)) {
      issues.push({
        code: "stale-arrow-reciprocal",
        message: `Element '${targetId ?? "<unknown>"}' lists arrow '${arrowId}' which does not bind to it.`,
        elementId: targetId,
        field: "boundElements",
        targetId: arrowId,
      });
    }
  }
}

function addMissingReciprocalIssues(
  targetId: string | undefined,
  arrowEntryCounts: ReadonlyMap<string, number>,
  expectedReciprocals: ReadonlyMap<string, ReadonlySet<string>>,
  issues: NativeBindingIssue[],
): void {
  if (targetId === undefined) {
    return;
  }

  for (const arrowId of expectedReciprocals.get(targetId) ?? []) {
    if (!arrowEntryCounts.has(arrowId)) {
      issues.push({
        code: "missing-arrow-reciprocal",
        message: `Binding target '${targetId}' does not list arrow '${arrowId}'.`,
        elementId: arrowId,
        field: "boundElements",
        targetId,
      });
    }
  }
}

function addRelation(relations: Map<string, Set<string>>, targetId: string, arrowId: string): void {
  const arrows = relations.get(targetId);
  if (arrows) {
    arrows.add(arrowId);
  } else {
    relations.set(targetId, new Set([arrowId]));
  }
}

function asElement(value: unknown): RawElement {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementId(element: RawElement): string | undefined {
  return nonEmptyString(element.id);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isDeleted(element: RawElement): boolean {
  return element.isDeleted === true;
}

function isSupportedTarget(element: RawElement): boolean {
  if (typeof element.type !== "string" || !BINDABLE_TARGET_TYPES.has(element.type)) {
    return false;
  }
  if (element.type === "text" && element.containerId !== null && element.containerId !== undefined) {
    return false;
  }
  return typeof element.angle === "number" && Number.isFinite(element.angle);
}

function isNormalizedFixedPoint(value: unknown): value is NativeFixedPoint {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }

  return value.every((coordinate) => (
    typeof coordinate === "number"
    && Number.isFinite(coordinate)
    && coordinate >= -FIXED_POINT_BOUND
    && coordinate <= FIXED_POINT_BOUND
    && (coordinate === NORMALIZED_MIDPOINT
      || Math.abs(coordinate - FIXED_POINT_MIDPOINT) >= MIDPOINT_EPSILON)
  ));
}
