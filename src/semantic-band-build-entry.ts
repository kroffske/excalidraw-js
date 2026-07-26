// Single import surface for the `flow.band` template, so the dispatcher does not need to
// know which module owns the schema, the layout, the edges or the legend.
export {
  BAND_EDGE_KINDS,
  BAND_NODE_TYPES,
  DEFAULT_MAX_BAND_WIDTH,
  MAX_BANDS,
  MAX_CELL_NODES,
  validateBandFlowSpec,
} from "./semantic-band.js";
export type {
  BandDiagramValidationResult,
  BandEdgeKind,
  BandEdgeSpec,
  BandFlowSpec,
  BandLaneSpec,
  BandLayoutSpec,
  BandLegendMode,
  BandNodeSpec,
  BandNodeType,
  BandStageSpec,
  NormalizedBandEdgeSpec,
  NormalizedBandFlowSpec,
} from "./semantic-band.js";
export { MAX_SCENE_WIDTH, buildBandFlowSpec } from "./semantic-band-build.js";
export type {
  BandDiagramBuildResult,
  BandDiagramBuildResultMetadata,
} from "./semantic-band-build.js";
export type { BandDiagramBuildMetadata, BandInfo, BandLaneInstance } from "./semantic-band-render.js";
export type { BandEdgeMetadata, BandEdgeWarning } from "./semantic-band-edges.js";
export { legendEntries } from "./semantic-band-legend.js";
export {
  BAND_DIAGNOSTIC_REGISTRY,
  diagnosticCodeFor,
  diagnosticPolicy,
} from "./semantic-band-diagnostics.js";
export type {
  BandGeometryCode,
  BandOnlyCode,
  DiagnosticAction,
  DiagnosticPolicy,
} from "./semantic-band-diagnostics.js";
