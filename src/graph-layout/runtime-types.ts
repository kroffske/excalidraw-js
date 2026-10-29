/** The exact optional peer versions supported by the installed runtime boundary. */
export const LAYOUT_ENGINE_VERSIONS = Object.freeze({
  '@hpcc-js/wasm-graphviz': '1.29.2',
  'libavoid-js': '0.5.0-beta.5',
} as const);

export interface GraphvizRuntime {
  layout(source: string, format: 'json', engine: 'dot'): string;
  version(): string;
}

/** An owned embind value. Router-owned shapes, pins and connectors are not deleted separately. */
export interface AvoidOwned {
  delete(): void;
}

export interface AvoidPoint extends AvoidOwned {
  x: number;
  y: number;
}

export interface AvoidPolygon extends AvoidOwned {
  setPoint(index: number, point: AvoidPoint): void;
}

export interface AvoidRouter extends AvoidOwned {
  setRoutingParameter(parameter: AvoidEnum, value: number): void;
  setRoutingOption(option: AvoidEnum, value: boolean): void;
  processTransaction(): void;
}

export interface AvoidShape extends AvoidOwned {}

export interface AvoidPin extends AvoidOwned {
  setExclusive(exclusive: boolean): void;
}

export interface AvoidPolyline {
  size(): number;
  at(index: number): Pick<AvoidPoint, 'x' | 'y'>;
}

export interface AvoidConnector extends AvoidOwned {
  setRoutingType(type: number): void;
  setHateCrossings(value: boolean): void;
  displayRoute(): AvoidPolyline;
}

export interface AvoidEnum { readonly value: number }

/** The embind surface used by the geometry solver, independent of the peer's incomplete declarations. */
export interface AvoidRuntime {
  Router: new (flags: number) => AvoidRouter;
  Point: new (x: number, y: number) => AvoidPoint;
  Rectangle: new (topLeft: AvoidPoint, bottomRight: AvoidPoint) => AvoidPolygon;
  Polygon: new (size: number) => AvoidPolygon;
  ShapeRef: new (router: AvoidRouter, polygon: AvoidPolygon) => AvoidShape;
  ShapeConnectionPin: new (shape: AvoidShape, classId: number, x: number, y: number,
    proportional: boolean, insideOffset: number, direction: number) => AvoidPin;
  ConnEnd: {
    new (point: AvoidPoint): AvoidOwned;
    new (shape: AvoidShape, classId: number): AvoidOwned;
  };
  ConnRef: new (router: AvoidRouter, source: AvoidOwned, target: AvoidOwned) => AvoidConnector;
  RouterFlag: { readonly OrthogonalRouting: AvoidEnum };
  ConnType: { readonly ConnType_Orthogonal: AvoidEnum };
  RoutingParameter: Readonly<Record<'shapeBufferDistance' | 'idealNudgingDistance' | 'segmentPenalty'
    | 'crossingPenalty' | 'reverseDirectionPenalty', AvoidEnum>>;
  RoutingOption: Readonly<Record<'nudgeOrthogonalSegmentsConnectedToShapes' | 'nudgeSharedPathsWithCommonEndPoint'
    | 'penaliseOrthogonalSharedPathsAtConnEnds' | 'performUnifyingNudgingPreprocessingStep', AvoidEnum>>;
}

/** Ready engines; the geometry solver owns each per-operation Router's lifetime. */
export interface LayoutRuntime {
  readonly graphviz: GraphvizRuntime;
  readonly Avoid: AvoidRuntime;
}
