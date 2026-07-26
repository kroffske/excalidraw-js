// Public build entry for `flow.band`: validate -> place -> route -> legend -> gates ->
// geometry. Contract: docs/system-design/flow-band/flow-band-contract.md (revision 1.2)
// — R1-R5, E4, E8, E9, A3.
import { SCENE_EPOCH, Scene } from "./core.js";
import { Bounds, PointTuple } from "./geometry.js";
import { DiagramDiagnostic, DiagramSpecOptions, error } from "./semantic-schema.js";
import { ValidationIssue, ValidationResult, validateDiagram } from "./validate.js";
import { validateNativeBindings } from "./bindings.js";
import { NormalizedBandFlowSpec, validateBandFlowSpec } from "./semantic-band.js";
import { BandDiagramBuildMetadata, renderBandLayout } from "./semantic-band-render.js";
import { BandEdgeMetadata, renderBandEdges } from "./semantic-band-edges.js";
import { renderBandLegend } from "./semantic-band-legend.js";
import { BandGeometryCode, diagnosticCodeFor, diagnosticPolicy } from "./semantic-band-diagnostics.js";

/** E4(b): the full scene, legend and captions included, must stay inside this width. */
export const MAX_SCENE_WIDTH = 2700;
/** Readability band for the whole scene; outside it the reader has to zoom (warning only). */
const ASPECT_MIN = 0.4;
const ASPECT_MAX = 2.5;
const BLOCK_GAP = 16;
const DEFAULT_SEED = 42;

export interface BandDiagramBuildResultMetadata extends BandDiagramBuildMetadata {
  edges: BandEdgeMetadata[];
  legend?: { bounds: Bounds; elementIds: string[]; entries: string[] };
}

export type BandDiagramBuildResult =
  | {
      ok: true;
      scene: Scene;
      metadata: BandDiagramBuildResultMetadata;
      geometry: ValidationResult;
      diagnostics: DiagramDiagnostic[];
    }
  | { ok: false; diagnostics: DiagramDiagnostic[]; geometry?: ValidationResult };

export function buildBandFlowSpec(
  value: unknown,
  options: DiagramSpecOptions = {},
): BandDiagramBuildResult {
  const validation = validateBandFlowSpec(value, options);
  if (!validation.ok) {
    return validation;
  }
  const spec = validation.value;

  // E1/P4: the clock is not an input of this template, so two builds a millisecond apart
  // produce identical bytes.
  const scene = new Scene({
    seed: options.seed ?? DEFAULT_SEED,
    now: SCENE_EPOCH,
    assetRegistry: options.assetRegistry ?? null,
  });

  const layout = renderBandLayout(scene, spec);
  if (!layout.ok) {
    return { ok: false, diagnostics: [...validation.diagnostics, ...layout.diagnostics] };
  }
  const routing = renderBandEdges(scene, spec, layout.rendered);
  if (!routing.ok) {
    return { ok: false, diagnostics: [...validation.diagnostics, ...routing.diagnostics] };
  }
  const legend = renderBandLegend(scene, spec, layout.rendered.metadata.bands);

  const diagnostics: DiagramDiagnostic[] = [...validation.diagnostics];

  // E4(a): each band was planned to fit, but the planner works on stage columns while the
  // drawn band includes captions — so the drawn width is what gets checked.
  for (const band of layout.rendered.metadata.bands) {
    if (band.bounds.width > spec.layout.maxBandWidth) {
      diagnostics.push(error(
        "GEOMETRY_ERROR",
        "$.layout.maxBandWidth",
        `band ${band.index} is ${Math.ceil(band.bounds.width)}px wide, over the ${spec.layout.maxBandWidth}px ceiling`,
        "Raise layout.maxBandWidth or move a stage out of this diagram.",
      ));
    }
  }
  // E4(b): the second gate covers everything the first one does not — legend included.
  const sceneBounds = scene.bounds();
  if (sceneBounds.width > MAX_SCENE_WIDTH) {
    diagnostics.push(error(
      "GEOMETRY_ERROR",
      "$",
      `the scene is ${Math.ceil(sceneBounds.width)}px wide, over the ${MAX_SCENE_WIDTH}px maximum`,
      'Lower layout.maxBandWidth or set legend: "none".',
    ));
  }

  // E8: the compiler validates its own output; handing back a scene it considers invalid
  // is not an option the caller should have to remember.
  const geometry = validateDiagram({
    blocks: [...layout.rendered.nodeBounds.entries()].map(([id, bounds]) => ({ id, bounds })),
    edges: routing.edges.map((edge) => ({
      id: edge.id,
      points: edge.points,
      // Without the endpoints the validator treats an edge as unrelated to the very
      // blocks it connects and reports every arrow as passing through its own nodes.
      from: edge.from,
      to: edge.to,
      ...(edge.labelBounds ? { label: { id: `${edge.id}-label`, bounds: edge.labelBounds } } : {}),
    })),
    gap: BLOCK_GAP,
    tolerateEdgeLabelOverlap: true,
  });
  for (const issue of geometry.issues) {
    diagnostics.push(geometryDiagnostic(issue, layout.rendered.metadata, routing.edges));
  }

  // Findings the shared validator does not compute — the eyes a blind model is missing.
  for (const warning of routing.warnings) {
    diagnostics.push(bandWarning(warning.code, warning.path, warning.message, warning.hint));
  }
  for (const [index, node] of spec.nodes.entries()) {
    if (layout.rendered.shrunkNodes.has(node.id)) {
      diagnostics.push(bandWarning(
        "text-shrunk-to-min",
        `$.nodes[${index}]`,
        `node '${node.id}' only fits because its text was shrunk to the smallest allowed size`,
        "Shorten title or details so the card stays readable.",
      ));
    }
  }
  for (const crossing of edgeCrossings(routing.edges)) {
    diagnostics.push(bandWarning(
      "edge-crossings",
      crossing.path,
      `edges ${crossing.first} and ${crossing.second} cross each other`,
      "Move one endpoint to another stage or lane so the lines stop competing.",
    ));
  }
  const aspect = sceneBounds.height > 0 ? sceneBounds.width / sceneBounds.height : 0;
  if (aspect < ASPECT_MIN || aspect > ASPECT_MAX) {
    diagnostics.push(bandWarning(
      "aspect-ratio",
      "$",
      `the scene is ${aspect.toFixed(2)}:1, outside the readable ${ASPECT_MIN}-${ASPECT_MAX} range`,
      "Lower layout.maxBandWidth to wrap the ribbon, or split the flow into views.",
    ));
  }

  // E7: an unbound arrow means the diagram stops being editable, which is a guarantee.
  const bindings = validateNativeBindings(scene.elements);
  for (const issue of bindings.issues) {
    diagnostics.push(error("NATIVE_BINDING_ERROR", "$.edges", issue.message));
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics, geometry };
  }

  return {
    ok: true,
    scene,
    metadata: {
      ...layout.rendered.metadata,
      edges: routing.edges,
      ...(legend ? { legend } : {}),
    },
    geometry,
    diagnostics,
  };
}

/**
 * R5: `severity` has one spelling in a build result. The shared geometry validator says
 * `"warn"`, the spec diagnostics say `"warning"`; normalising happens here, at the
 * template's own boundary, so the low-level type keeps its public shape.
 */
function geometryDiagnostic(
  issue: ValidationIssue,
  metadata: BandDiagramBuildMetadata,
  edges: BandEdgeMetadata[],
): DiagramDiagnostic {
  const policy = diagnosticPolicy(issue.code);
  const path = issue.ids
    .map((id) =>
      metadata.nodes.find((node) => node.id === id)?.path
      ?? edges.find((edge) => edge.id === id || `${edge.id}-label` === id)?.path
    )
    .find((candidate): candidate is string => Boolean(candidate)) ?? "$";
  return {
    severity: policy.severity,
    code: diagnosticCodeFor(issue.code),
    path,
    message: issue.message,
    hint: actionHint(issue.code),
  };
}

function bandWarning(
  code: BandGeometryCode,
  path: string,
  message: string,
  hint: string,
): DiagramDiagnostic {
  return {
    severity: diagnosticPolicy(code).severity,
    code: diagnosticCodeFor(code),
    path,
    message,
    hint: `${hint} (${actionHint(code)})`,
  };
}

function actionHint(code: BandGeometryCode): string {
  return `registry action: ${diagnosticPolicy(code).action}`;
}

interface EdgeCrossing {
  path: string;
  first: string;
  second: string;
}

/** Edges crossing each other is the classic "valid but unreadable" case; nothing else checks it. */
function edgeCrossings(edges: BandEdgeMetadata[]): EdgeCrossing[] {
  const crossings: EdgeCrossing[] = [];
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      if (polylinesCross(edges[first].points, edges[second].points)) {
        crossings.push({
          path: edges[first].path,
          first: edges[first].id,
          second: edges[second].id,
        });
      }
    }
  }
  return crossings;
}

function polylinesCross(first: PointTuple[], second: PointTuple[]): boolean {
  for (let a = 0; a < first.length - 1; a += 1) {
    for (let b = 0; b < second.length - 1; b += 1) {
      if (segmentsCross(first[a], first[a + 1], second[b], second[b + 1])) {
        return true;
      }
    }
  }
  return false;
}

function segmentsCross(p1: PointTuple, p2: PointTuple, p3: PointTuple, p4: PointTuple): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  // Touching endpoints (shared source or target) are not a crossing.
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(a: PointTuple, b: PointTuple, point: PointTuple): number {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

export type { NormalizedBandFlowSpec };
