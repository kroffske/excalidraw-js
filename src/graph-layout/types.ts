import type { AvoidRuntime, LayoutRuntime } from './runtime-types.js';

export type Point = [number, number];
export interface Size { width: number; height: number }
export interface Position { x: number; y: number }
export interface Box extends Size, Position {}
export interface Bounds { left: number; top: number; right: number; bottom: number }
export type Side = 'top' | 'right' | 'bottom' | 'left';
export interface LayoutNode extends Size { id: string; shape: 'rectangle' | 'diamond' }
/** Explicit contour for every final routing box, including obstacle-only boxes. */
export type RoutingNode = Pick<LayoutNode, 'id' | 'shape'>;
export interface LayoutEdge { id: string; from: string; to: string; label: string }
export interface RowConstraint { type: 'row'; ids: string[]; index: number }
export interface PlaceConstraint { type: 'place'; node: string; place: Side; index: number }
export interface RelativeConstraint { type: 'below' | 'rightOf'; node: string; other: string; index: number }
export type Constraint = RowConstraint | PlaceConstraint | RelativeConstraint;
export interface ConstraintEdge { from: string; to: string; index: number }
export interface Diagnostic {
  code: string; path: string; message: string; severity?: 'warning' | 'error';
  nodeId?: string; edgeId?: string; constraintIndex?: number;
  counts?: Readonly<Record<string, number>>;
  actualFit?: number; baselineFit?: number; drop?: number; baselineDiagnostics?: Diagnostic[];
}
export interface CompiledConstraints {
  valid: boolean; forms: Constraint[]; ids: string[];
  rows: { find(id: string): string };
  groups: Map<string, string[]>; orderEdges: ConstraintEdge[]; belowEdges: ConstraintEdge[];
  placements: Map<string, PlaceConstraint>; sidePlacements: Map<string, PlaceConstraint>;
  topGroups: Set<string>; bottomGroups: Set<string>; orderedGroups: Map<string, string[]>;
  diagnostics: Diagnostic[];
}
export interface Typography { fontSize: number; lineHeight: number }
export interface LabelTypography extends Typography { paddingX: number; paddingY: number }
export interface LayoutArea {
  id: string; nodeIds: string[]; parentId?: string; title: string; typography: Typography;
}
export interface AreaBox extends Box { text: string; headerHeight: number }
export interface AuthoredRoute { sourceSide: Side; targetSide: Side; waypoints?: Position[] }
export interface LayoutProfile {
  /** null preserves the DOT-derived corridor, clamped to 96–180 pixels. */
  baseNodeGap: number | null;
  wideLabelCorridors: boolean; alignAdjacentRows: boolean; preferContentLabels: boolean; routeNudge: number;
}
export interface FitPolicy {
  viewport: Size; minZoom: number; maxZoom: number; paddingFraction: number; maxSideDrop: number;
}
export interface GraphLayoutRequest {
  nodes: LayoutNode[]; edges: LayoutEdge[]; direction?: 'TB' | 'LR';
  constraints?: Constraint[]; defaultTopIds?: string[];
  positions?: Record<string, Position>; routes?: Record<string, AuthoredRoute>; areas?: LayoutArea[];
  profile: LayoutProfile; labelTypography: LabelTypography; fit: FitPolicy;
  /** Admission has retained an older geometry preference that this solver does not implement. */
  hasIgnoredNodeHints?: boolean;
}
export interface EdgeRoute {
  edge: LayoutEdge; points: Point[]; sourceSide: Side; targetSide: Side; manual?: boolean;
  labelCenter?: Point; labelBox?: Bounds;
}
export type FitComparison =
  | { status: 'unverified'; reason: 'complete_positions'; actualFit: number }
  | { status: 'unavailable'; reason: 'reference_failed'; actualFit: number }
  | { status: 'measured'; baselineFit: number; actualFit: number; drop: number; passed: boolean };
export interface GraphLayoutResult {
  boxes: Map<string, Box>; direction: 'TB' | 'LR'; orderedEdges: LayoutEdge[];
  containers: Set<string>; edgeRoutes: Map<string, EdgeRoute>; constraints: CompiledConstraints;
  diagnostics: Diagnostic[]; fitComparison?: FitComparison; areas: Map<string, AreaBox>;
}
export interface LayoutOptions { runtime?: LayoutRuntime }

/** Presentation groups contain only direct children (or roots), exactly once. */
export type ComponentComposition = string | { row: readonly ComponentComposition[] } | { column: readonly ComponentComposition[] };

/** Measured content and caller-resolved child order, independent of domain semantics. */
export interface ComponentLayoutNode extends Size {
  id: string;
  children: readonly string[];
  composition?: ComponentComposition;
}

export interface ComponentLayoutRelation {
  id: string;
  from: string;
  to: string;
  label: string;
  /** The caller has selected the ownership-label rail below the source header. */
  headerRail: boolean;
  /** Compact title-only intent for an adjacent leaf interface. */
  inline?: boolean;
}

export interface ComponentLayoutRequest {
  nodes: readonly ComponentLayoutNode[];
  roots: readonly string[];
  relations: readonly ComponentLayoutRelation[];
  direction: 'LR' | 'TB';
  labelFontSize: number;
  rootComposition?: ComponentComposition;
}

/** Arrow origin and points relative to that origin, ready for native conversion. */
export interface ComponentEdgeGeometry {
  x: number;
  y: number;
  points: Point[];
}

export interface ComponentLayoutResult {
  boxes: Map<string, Box>;
  containers: Set<string>;
  direction: 'LR' | 'TB';
  edgeGeometry: Map<string, ComponentEdgeGeometry>;
}

export interface ComponentLayoutOptions {
  Avoid: AvoidRuntime;
  /** Called once per expanded node after its children's widths have been resolved. */
  measureHeader(nodeId: string, boundaryWidth: number): number;
}

export interface ComponentMessageLabel extends Size {
  /** Exact visible text, including the library's display-only line breaks. */
  text: string;
  center: Point;
}

export interface RoutedComponentLayoutResult extends ComponentLayoutResult {
  headerBoxes: Map<string, Box>;
  edgeRoutes: Map<string, EdgeRoute>;
  messageLabels: Map<string, ComponentMessageLabel>;
  diagnostics: Diagnostic[];
}

export class ComponentLayoutError extends Error {
  readonly code: string;
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = 'ComponentLayoutError';
    this.diagnostics = diagnostics;
    this.code = diagnostics[0]?.code ?? 'INVALID_LAYOUT_REQUEST';
  }
}

export interface RoundStrokePaint { width: number; cap: 'round' }
export interface NodePaintEnvelope { outset: number }
export interface PointError { x: number; y: number }
export interface CompactComponentPaint {
  routes: ReadonlyMap<string, RoundStrokePaint>;
  frames: ReadonlyMap<string, RoundStrokePaint>;
  nodes: ReadonlyMap<string, NodePaintEnvelope>;
  clearance: number;
  pointError: PointError;
}
export interface CompactComponentLayoutOptions {
  headerMode: 'title-only';
  Avoid: AvoidRuntime;
  measureHeader(nodeId: string): Size;
  measureLabel(edgeId: string, authoredText: string): Size & { text: string };
  paint: CompactComponentPaint;
}
