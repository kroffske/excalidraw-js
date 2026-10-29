// Declaration types are shared with diagram.flow. Type-only dependencies are
// erased: this entrypoint has no Scene, Node, layout engine, or asset runtime.
import type { ColorRole } from "./colors.js";
import type { NodeCardSpec } from "./node.js";
import type { TextBoxOptions } from "./text.js";

export type GraphLayoutPreset = "lr-flow" | "two-row-flow";
export type GraphEdgeKind = "primary" | "secondary" | "feedback" | "provenance" | "risk";
export type GraphNoteSide = "top" | "right" | "bottom" | "left";
export type GraphEdgeDirection = "left-to-right" | "right-to-left" | "top-down" | "bottom-up";

export interface ThemeSpec {
  base?: "mono-blue";
  accents?: Partial<Record<ColorRole | GraphEdgeKind, string>>;
}

export interface GraphTextDefaults {
  maxLines?: number;
  minSize?: number;
  overflow?: TextBoxOptions["overflow"];
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface GraphNodeSpec {
  /** Domain payload; snapshot() accepts only lossless JSON values. */
  data?: JsonValue;
  title: string;
  iconId?: string;
  icon_id?: string;
  bullets?: string[];
  body?: string;
  role?: ColorRole;
  color?: ColorRole | string;
  width?: number;
  strict?: boolean;
  ports?: NodeCardSpec["ports"];
  text?: GraphTextDefaults;
}

export interface GraphEdgeSpec {
  /** Domain payload; ignored by layout and preserved by snapshot(). */
  data?: JsonValue;
  id?: string;
  from: string;
  to: string;
  label?: string;
  kind?: GraphEdgeKind;
  fromPort?: string;
  from_port?: string;
  toPort?: string;
  to_port?: string;
  direction?: GraphEdgeDirection;
  lane?: "direct" | "outer" | string;
  dashed?: boolean;
  labelOffset?: { dx?: number; dy?: number };
  label_offset?: { dx?: number; dy?: number };
}

export interface GraphNoteSpec {
  title?: string;
  bullets?: string[];
  items?: GraphAnnotationItem[];
  attachTo?: string;
  attach_to?: string;
  side?: GraphNoteSide;
  placement?: "auto" | "bottom-right";
  width?: number;
  preferredWidth?: number;
  preferred_width?: number;
  minWidth?: number;
  min_width?: number;
  maxWidth?: number;
  max_width?: number;
  minHeight?: number;
  min_height?: number;
  maxHeight?: number;
  max_height?: number;
  padding?: number;
  titleSize?: number;
  title_size?: number;
  itemSize?: number;
  item_size?: number;
  rowSize?: number;
  row_size?: number;
  titleGap?: number;
  title_gap?: number;
  itemGap?: number;
  item_gap?: number;
  rowGap?: number;
  row_gap?: number;
  strict?: boolean;
  iconId?: string;
  icon_id?: string;
  dx?: number;
  dy?: number;
  color?: ColorRole | string;
}

export type GraphAnnotationItem = string | GraphAnnotationLineSpec;

export interface GraphAnnotationLineSpec {
  text: string;
  role?: ColorRole;
  color?: ColorRole | string;
  size?: number;
  fontSize?: number;
  font_size?: number;
}

export interface DiagramOverrides {
  nodes?: Record<string, GraphNodeOverride>;
  edges?: Record<string, GraphEdgeOverride>;
  lanes?: Record<string, { rowGap?: number; row_gap?: number; columnGap?: number; column_gap?: number }>;
}

export interface GraphNodeOverride {
  width?: number;
  dx?: number;
  dy?: number;
  x?: number;
  y?: number;
  attachTo?: string;
  attach_to?: string;
  side?: GraphNoteSide;
}

export interface GraphEdgeOverride {
  labelOffset?: { dx?: number; dy?: number };
  label_offset?: { dx?: number; dy?: number };
  lane?: "direct" | "outer" | string;
  direction?: GraphEdgeDirection;
}

export interface GraphDefaults {
  node?: Partial<GraphNodeSpec> & { minHeight?: number; min_height?: number };
  note?: Partial<GraphNoteSpec> & { text?: GraphTextDefaults };
  edge?: Partial<GraphEdgeSpec> & { label?: GraphTextDefaults & { width?: number } };
  layout?: GraphLayoutOptions;
}

export interface GraphLayoutOptions {
  preset?: GraphLayoutPreset;
  x?: number;
  y?: number;
  nodeWidth?: number;
  node_width?: number;
  noteWidth?: number;
  note_width?: number;
  columnGap?: number;
  column_gap?: number;
  rowGap?: number;
  row_gap?: number;
  noteGap?: number;
  note_gap?: number;
  strictNoOverlap?: boolean;
  strict_no_overlap?: boolean;
  reservedTopBand?: number;
  reserved_top_band?: number;
}

export interface GraphSpec {
  title?: string;
  subtitle?: string;
  theme?: ThemeSpec;
  defaults?: GraphDefaults;
  nodes?: Record<string, GraphNodeSpec>;
  edges?: GraphEdgeSpec[];
  rows?: Record<string, string[]>;
  notes?: Record<string, GraphNoteSpec>;
  annotations?: Record<string, GraphNoteSpec>;
  overrides?: DiagramOverrides;
  layout?: GraphLayoutOptions;
}

export interface GraphDefinitionSnapshot {
  format: "excalidraw-flow";
  version: 1;
  nodes: Array<{ id: string; spec: GraphNodeSpec }>;
  edges: GraphEdgeSpec[];
  rows: Array<{ id: string; nodes: string[] }>;
  notes: Array<{ id: string; spec: GraphNoteSpec }>;
  options: Omit<GraphSpec, "nodes" | "edges" | "rows" | "notes" | "annotations">;
}

export type GraphDefinitionErrorCode =
  | "DUPLICATE_NODE_ID" | "DUPLICATE_NOTE_ID" | "DUPLICATE_EDGE_ID"
  | "PARALLEL_EDGE_ID_REQUIRED" | "UNKNOWN_ENDPOINT"
  | "INVALID_JSON" | "INVALID_DECLARATION";

export class GraphDefinitionError extends Error {
  readonly name = "GraphDefinitionError";
  constructor(readonly code: GraphDefinitionErrorCode, readonly path: string, message: string) {
    super(`${path}: ${message}`);
  }
}

interface GraphDeclarations {
  nodes: ReadonlyMap<string, GraphNodeSpec>;
  notes: ReadonlyMap<string, GraphNoteSpec>;
  edges: readonly GraphEdgeSpec[];
  rows: ReadonlyArray<{ id: string; nodes: string[] }>;
  options: GraphSpec;
  overrides: DiagramOverrides;
}

type NoteHandle = {
  attachTo: (targetId: string, options?: Pick<GraphNoteSpec, "side" | "dx" | "dy">) => GraphDefinition;
};

const COLLECTION_KEYS = ["nodes", "edges", "rows", "notes", "annotations", "overrides"] as const;
const COLLECTIONS = new Set<string>(COLLECTION_KEYS);
const OVERRIDE_MAPS = ["nodes", "edges", "lanes"] as const;

/** Generic author declarations. No Scene, layout, filesystem, or engine effects. */
export class GraphDefinition {
  private readonly nodes = new Map<string, GraphNodeSpec>();
  private readonly notes = new Map<string, GraphNoteSpec>();
  private readonly edges: GraphEdgeSpec[] = [];
  private readonly rows: Array<{ id: string; nodes: string[] }> = [];
  private overrides: DiagramOverrides = {};
  private hasOverrides = false;
  private readonly inputIssues: GraphDefinitionError[] = [];

  constructor(private options: GraphSpec = {}) {
    this.entries(this.input("nodes"), "$/nodes", (id, value) => this.node(id, value));
    this.entries(this.input("rows"), "$/rows", (id, value) => this.row(id, value));
    const edges = this.input("edges");
    if (edges) {
      // Keep raw array shape (including holes/accessors) until strict snapshot admission.
      const copied = copyProperties(edges);
      for (const key of Reflect.ownKeys(copied)) {
        const descriptor = Object.getOwnPropertyDescriptor(copied, key)!;
        if (key !== "length" && "value" in descriptor && descriptor.value && typeof descriptor.value === "object") {
          descriptor.value = copyProperties(descriptor.value);
        }
        Object.defineProperty(this.edges, key, descriptor);
      }
    }
    this.entries(this.input("notes"), "$/notes", (id, value) => this.note(id, value));
    this.entries(this.input("annotations"), "$/annotations", (id, value) => this.annotation(id, value));
    const overrides = this.input("overrides");
    if (overrides) this.applyOverrides(overrides);
  }

  /** @internal Eager ingestion for the existing FlowDiagram constructor, into this same store. */
  static fromFlowSpec(spec: GraphSpec = {}): GraphDefinition {
    const graph = new GraphDefinition();
    graph.options = spec;
    // Deliberately retain the original read order and accessor timing. The strict
    // snapshot boundary inspects raw descriptors separately and never replays these reads.
    for (const [id, node] of Object.entries(spec.nodes ?? {})) graph.node(id, node);
    for (const [id, nodes] of Object.entries(spec.rows ?? {})) graph.row(id, [...nodes]);
    for (const edge of spec.edges ?? []) graph.edge(edge.from, edge.to, { ...edge });
    for (const [id, note] of Object.entries(spec.notes ?? {})) graph.note(id, note);
    for (const [id, annotation] of Object.entries(spec.annotations ?? {})) graph.annotation(id, { ...annotation });
    if (spec.overrides) {
      const overrides = spec.overrides;
      const materialized = copyProperties(overrides);
      for (const key of OVERRIDE_MAPS) {
        const value = overrides[key];
        if (key in overrides) {
          if (value == null) graph.inputIssues.push(new GraphDefinitionError("INVALID_JSON", `$/options/overrides/${key}`,
            "Nullish override maps are not lossless declarations; omit the field instead"));
          Object.defineProperty(materialized, key, {
            value: { ...(value ?? {}) }, enumerable: true, writable: true, configurable: true,
          });
        }
      }
      graph.applyOverrides(materialized);
    }
    return graph;
  }

  /** Live declarations for the existing layout consumer; use snapshot() to export. */
  get declarations(): GraphDeclarations {
    return { nodes: this.nodes, notes: this.notes, edges: this.edges, rows: this.rows,
      options: this.options, overrides: this.overrides };
  }

  node(id: string, spec: GraphNodeSpec): this {
    if (this.nodes.has(id)) throw new GraphDefinitionError("DUPLICATE_NODE_ID", "$/nodes", `Duplicate graph node id: ${id}`);
    this.nodes.set(id, spec);
    return this;
  }

  row(id: string, nodes: string[]): this {
    this.rows.push({ id, nodes: copyProperties(nodes) });
    return this;
  }

  edge(from: string, to: string, spec: Omit<GraphEdgeSpec, "from" | "to"> = {}): this {
    this.edges.push(Object.defineProperties(copyProperties(spec), {
      from: { value: from, enumerable: true, writable: true, configurable: true },
      to: { value: to, enumerable: true, writable: true, configurable: true },
    }) as GraphEdgeSpec);
    return this;
  }

  note(id: string, spec: GraphNoteSpec): NoteHandle {
    if (this.notes.has(id)) throw new GraphDefinitionError("DUPLICATE_NOTE_ID", "$/notes", `Duplicate graph note id: ${id}`);
    this.notes.set(id, spec);
    return { attachTo: (targetId, options = {}) => {
      const current = this.notes.get(id)!;
      this.notes.set(id, Object.defineProperties(Object.defineProperty(copyProperties(current), "attachTo", {
        value: targetId, enumerable: true, writable: true, configurable: true,
      }), Object.getOwnPropertyDescriptors(copyProperties(options))));
      return this;
    } };
  }

  annotation(id: string, spec: GraphNoteSpec): NoteHandle {
    return this.note(id, Object.defineProperties({ placement: "bottom-right", color: "note" } as GraphNoteSpec,
      Object.getOwnPropertyDescriptors(copyProperties(spec))));
  }

  applyOverrides(overrides: DiagramOverrides): this {
    const merged = copyProperties(this.overrides);
    Object.defineProperties(merged, Object.getOwnPropertyDescriptors(copyProperties(overrides)));
    for (const key of OVERRIDE_MAPS) {
      const next = Object.getOwnPropertyDescriptor(overrides, key);
      const previous = Object.getOwnPropertyDescriptor(this.overrides, key);
      if (next && "value" in next) {
        if (next.value == null) {
          // Legacy merging ignores nullish optional maps; snapshot must not silently lose them.
          this.inputIssues.push(new GraphDefinitionError("INVALID_JSON", `$/options/overrides/${key}`,
            "Nullish override maps are not lossless declarations; omit the field instead"));
        }
        Object.defineProperty(merged, key, { value: Object.defineProperties(copyProperties(previous?.value ?? {}),
          Object.getOwnPropertyDescriptors(copyProperties(next.value ?? {}))), enumerable: true, writable: true, configurable: true });
      }
    }
    this.overrides = merged;
    this.hasOverrides = true;
    return this;
  }

  snapshot(): GraphDefinitionSnapshot {
    if (this.inputIssues.length) throw this.inputIssues[0];
    // Collections disappear from options in the output, so validate their raw
    // descriptors/shape first. Present nullish input must not become absence.
    for (const key of COLLECTION_KEYS) {
      const value = this.input(key);
      if (this.inputIssues.length) throw this.inputIssues[0];
      if (value !== undefined) cloneJson(value, `$/options/${key}`);
    }
    const options = copyProperties(this.options, COLLECTIONS);
    if (this.hasOverrides) Object.defineProperty(options, "overrides", {
      value: this.overrides, enumerable: true, writable: true, configurable: true,
    });
    const snapshot = cloneJson({ format: "excalidraw-flow", version: 1,
      nodes: [...this.nodes].map(([id, spec]) => ({ id, spec })),
      edges: this.edges, rows: this.rows,
      notes: [...this.notes].map(([id, spec]) => ({ id, spec })), options }, "$") as unknown as GraphDefinitionSnapshot;
    const endpoints = new Set([...snapshot.nodes, ...snapshot.notes].map(({ id }) => id));
    for (const [index, node] of snapshot.nodes.entries()) {
      requireId(node.id, `$/nodes/${index}/id`);
      if (!node.spec || typeof node.spec.title !== "string") {
        throw new GraphDefinitionError("INVALID_DECLARATION", `$/nodes/${index}/spec/title`, "Expected a title string");
      }
    }
    const edgeIds = new Set<string>();
    const pairs = new Map<string, { count: number; implicit: boolean }>();
    for (const [index, edge] of snapshot.edges.entries()) {
      const path = `$/edges/${index}`;
      if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
        throw new GraphDefinitionError("INVALID_DECLARATION", path, "Expected an edge declaration object");
      }
      for (const endpoint of ["from", "to"] as const) {
        requireId(edge[endpoint], `${path}/${endpoint}`);
        if (!endpoints.has(edge[endpoint])) throw new GraphDefinitionError("UNKNOWN_ENDPOINT", `${path}/${endpoint}`, `Unknown graph endpoint '${edge[endpoint]}'`);
      }
      if (Object.hasOwn(edge, "id")) {
        requireId(edge.id, `${path}/id`);
        if (edgeIds.has(edge.id!)) throw new GraphDefinitionError("DUPLICATE_EDGE_ID", `${path}/id`, `Duplicate graph edge id: ${edge.id}`);
        edgeIds.add(edge.id!);
      }
      const pair = JSON.stringify([edge.from, edge.to]);
      const parallel = pairs.get(pair) ?? { count: 0, implicit: false };
      parallel.count++;
      parallel.implicit ||= !Object.hasOwn(edge, "id");
      pairs.set(pair, parallel);
      if (parallel.count > 1 && parallel.implicit) {
        throw new GraphDefinitionError("PARALLEL_EDGE_ID_REQUIRED", path, "Parallel edges require distinct explicit IDs");
      }
    }
    return snapshot;
  }

  private input<K extends typeof COLLECTION_KEYS[number]>(key: K): GraphSpec[K] {
    const descriptor = Object.getOwnPropertyDescriptor(this.options, key);
    if (!descriptor) return undefined;
    const path = `$/options/${key}`;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      this.inputIssues.push(new GraphDefinitionError("INVALID_JSON", path, "Expected an enumerable data property; accessors are not JSON"));
      return undefined;
    }
    const value = descriptor.value;
    const validContainer = value !== null && typeof value === "object" && (key === "edges"
      ? Array.isArray(value)
      : !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
    if (!validContainer) {
      this.inputIssues.push(new GraphDefinitionError("INVALID_JSON", path,
        key === "edges" ? "Expected an edges array; omit an absent collection" : "Expected a declaration record; omit an absent collection"));
      return undefined;
    }
    return value;
  }

  private entries<T>(value: Record<string, T> | T[] | undefined, path: string, add: (id: string, value: T) => unknown): void {
    if (value == null) return;
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) {
        this.inputIssues.push(new GraphDefinitionError("INVALID_JSON", path, "Declarations must have enumerable data properties"));
      } else add(key, descriptor.value);
    }
  }
}

function requireId(id: unknown, path: string): asserts id is string {
  if (typeof id !== "string" || !id) throw new GraphDefinitionError("INVALID_DECLARATION", path, "Expected a nonempty string ID");
}

/** Shallow legacy copy, retaining accessor descriptors for refusal without invocation. */
function copyProperties<T extends object>(value: T, omit: ReadonlySet<string> = new Set()): T {
  const result = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && omit.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    Object.defineProperty(result, key, key === "length" && Array.isArray(value) ? { ...descriptor, writable: true } : {
      ...descriptor, configurable: true, ...("value" in descriptor ? { writable: true } : {}),
    });
  }
  return result;
}

/** Descriptor traversal rejects lossy JSON input without calling getters or toJSON. */
function cloneJson(value: unknown, path: string, active = new Set<object>()): JsonValue {
  const fail = (reason: string): never => { throw new GraphDefinitionError("INVALID_JSON", path, reason); };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : fail("Expected a finite JSON number");
  if (typeof value !== "object") return fail(`Unsupported JSON value: ${typeof value}`);
  if (active.has(value)) return fail("Cyclic JSON value");
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return fail("Expected a plain JSON object");
  }
  active.add(value);
  const result: JsonValue[] | { [key: string]: JsonValue } = array ? [] : {};
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === "length") continue;
      if (typeof key !== "string") return fail("Symbol keys are not JSON");
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (value as unknown[]).length)) {
        return fail("Non-index array properties are not JSON");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      const childPath = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (!("value" in descriptor) || !descriptor.enumerable) {
        throw new GraphDefinitionError("INVALID_JSON", childPath, "Expected an enumerable data property; accessors are not JSON");
      }
      Object.defineProperty(result, key, { value: cloneJson(descriptor.value, childPath, active),
        enumerable: true, writable: true, configurable: true });
    }
    if (array) {
      const items = result as JsonValue[];
      if (items.length !== (value as unknown[]).length) return fail("Sparse arrays are not JSON");
      for (let index = 0; index < items.length; index++) {
        if (!Object.hasOwn(items, index)) return fail("Sparse arrays are not JSON");
      }
    }
    return result;
  } finally { active.delete(value); }
}
