export { Asset, AssetRegistry } from "./assets.js";
export { BLUE, EXCALIFONT, GRAY, GREEN, LIGHT_GRAY, RED, Scene, TextStyle, measureText } from "./core.js";
export { writeArchitectureSemanticRedraw, writeExcalidrawJsArchitecture } from "./examples.js";
export { readSemanticRedrawSpec, validateSemanticRedrawSpec, writeSemanticRedrawDiagram } from "./semantic-redraw-spec.js";
export type {
  SemanticRedrawCardSpec,
  SemanticRedrawDensity,
  SemanticRedrawDirection,
  SemanticRedrawEdgeKind,
  SemanticRedrawEdgeSpec,
  SemanticRedrawIssueSeverity,
  SemanticRedrawResult,
  SemanticRedrawSectionSpec,
  SemanticRedrawSpecDocument,
  SemanticRedrawValidationIssue,
  SemanticRedrawValidationResult,
  SemanticRedrawWriteOptions,
} from "./semantic-redraw-spec.js";
export { readTreeSpec, writeTreeSpecDiagram } from "./tree-spec.js";
export type { TreeSpecDocument, TreeSpecResult } from "./tree-spec.js";
export {
  Bounds,
  PlacedBlock,
  Point,
  Size,
  boundsFor,
  inflateBounds,
  polylineIntersectsBounds,
  translate,
} from "./geometry.js";
export type { ElementLike, PointTuple } from "./geometry.js";
export * as layout from "./layout.js";

// MVP measured-text + NodeCard + validation surface (T-114).
export { CHAR_WIDTH_RATIO, fitText, fit_text, textBox, text_box } from "./text.js";
export type { FitTextOptions, FittedText, PlacedTextBox, TextBoxOptions, TextOverflow } from "./text.js";
export { fitCard, fit_card } from "./card.js";
export type { ContentCardRow, FitCardOptions, FittedCard, FittedCardLine } from "./card.js";
export {
  AMBER,
  Colors,
  PURPLE,
  accentRoles,
  colorLabel,
  isColorRole,
  legendNeeded,
  resolveColor,
} from "./colors.js";
export type { ColorRole } from "./colors.js";
export { nodeCard, node_card } from "./node.js";
export type { NodeCardSpec, NodePortSpec, NodeSide, PlacedNodeCard } from "./node.js";
export * as diagram from "./diagram.js";
export { FlowDiagram, flow, graphFlow, graph_flow, theme } from "./diagram.js";
export type {
  DiagramOverrides,
  FlowDiagramResult,
  GraphAnnotationItem,
  GraphAnnotationLineSpec,
  GraphDefaults,
  GraphEdgeDirection,
  GraphEdgeKind,
  GraphEdgeOverride,
  GraphEdgeSpec,
  GraphLayoutOptions,
  GraphLayoutPreset,
  GraphNodeOverride,
  GraphNodeSpec,
  GraphNoteSide,
  GraphNoteSpec,
  GraphSpec,
  GraphTextDefaults,
  ThemeSpec,
} from "./diagram.js";
export {
  assertDiagramHealthy,
  assert_diagram_healthy,
  avoidOverlap,
  avoid_overlap,
  validateDiagram,
  validate_diagram,
} from "./validate.js";
export type {
  AvoidOverlapOptions,
  AvoidOverlapResult,
  DiagramBlock,
  DiagramEdge,
  OverlapItem,
  OverlapKind,
  Severity,
  ValidateDiagramInput,
  ValidationCode,
  ValidationIssue,
  ValidationResult,
} from "./validate.js";
