import * as assets from "./assets.js";
import { Scene } from "./core.js";
import { ColorRole, Colors, resolveColor } from "./colors.js";
import { Bounds, ElementLike, PlacedBlock, PointTuple, boundsFor, translate } from "./geometry.js";
import { NodeCardSpec, NodeSide, PlacedNodeCard, nodeCard } from "./node.js";
import { TextBoxOptions, textBox } from "./text.js";
import { ContentCardRow, FitCardOptions, fitCard } from "./card.js";
import {
  DiagramEdge,
  ValidationResult,
  assertDiagramHealthy,
  avoidOverlap,
  validateDiagram,
} from "./validate.js";

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

export interface GraphNodeSpec {
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

export interface FlowDiagramResult {
  nodes: Record<string, PlacedNodeCard>;
  notes: Record<string, PlacedNodeCard>;
  noteConnectors: ElementLike[];
  edges: DiagramEdge[];
  edgeArrows: ElementLike[];
  edgeLabels: ElementLike[];
  titles: ElementLike[];
  bounds: Bounds;
  validation: ValidationResult;
}

type NoteHandle = { attachTo: (targetId: string, options?: Pick<GraphNoteSpec, "side" | "dx" | "dy">) => FlowDiagram };

interface InternalNode {
  id: string;
  spec: GraphNodeSpec;
}

interface InternalNote {
  id: string;
  spec: GraphNoteSpec;
}

type GraphNoteDefaults = Partial<GraphNoteSpec> & { text?: GraphTextDefaults };

export class FlowDiagram {
  private readonly nodes = new Map<string, GraphNodeSpec>();
  private readonly notes = new Map<string, GraphNoteSpec>();
  private readonly edges: GraphEdgeSpec[] = [];
  private readonly rowOrder: Array<{ id: string; nodes: string[] }> = [];
  private overrides: DiagramOverrides = {};
  private result: FlowDiagramResult | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly spec: GraphSpec = {},
  ) {
    for (const [id, nodeSpec] of Object.entries(spec.nodes ?? {})) {
      this.node(id, nodeSpec);
    }
    for (const [id, nodes] of Object.entries(spec.rows ?? {})) {
      this.row(id, nodes);
    }
    for (const edgeSpec of spec.edges ?? []) {
      this.edge(edgeSpec.from, edgeSpec.to, edgeSpec);
    }
    for (const [id, noteSpec] of Object.entries(spec.notes ?? {})) {
      this.note(id, noteSpec);
    }
    for (const [id, annotationSpec] of Object.entries(spec.annotations ?? {})) {
      this.annotation(id, annotationSpec);
    }
    if (spec.overrides) {
      this.applyOverrides(spec.overrides);
    }
  }

  node(id: string, spec: GraphNodeSpec): this {
    this.ensureNotLaidOut();
    if (this.nodes.has(id)) {
      throw new Error(`Duplicate graph node id: ${id}`);
    }
    this.nodes.set(id, spec);
    return this;
  }

  row(id: string, nodes: string[]): this {
    this.ensureNotLaidOut();
    this.rowOrder.push({ id, nodes: [...nodes] });
    return this;
  }

  edge(from: string, to: string, spec: Omit<GraphEdgeSpec, "from" | "to"> = {}): this {
    this.ensureNotLaidOut();
    this.edges.push({ ...spec, from, to });
    return this;
  }

  note(id: string, spec: GraphNoteSpec): NoteHandle {
    this.ensureNotLaidOut();
    if (this.notes.has(id)) {
      throw new Error(`Duplicate graph note id: ${id}`);
    }
    this.notes.set(id, spec);
    return {
      attachTo: (targetId, options = {}) => {
        const current = this.notes.get(id);
        if (!current) {
          throw new Error(`Graph note '${id}' is missing`);
        }
        this.notes.set(id, { ...current, attachTo: targetId, ...options });
        return this;
      },
    };
  }

  annotation(id: string, spec: GraphNoteSpec): NoteHandle {
    return this.note(id, { placement: "bottom-right", color: "note", ...spec });
  }

  applyOverrides(overrides: DiagramOverrides): this {
    this.ensureNotLaidOut();
    this.overrides = mergeOverrides(this.overrides, overrides);
    return this;
  }

  layout(): FlowDiagramResult {
    if (this.result) {
      return this.result;
    }

    const titleElements = this.placeTitle();
    const placedNodes = this.placeNodes(titleElements);
    const placedNotes = this.placeNotes(placedNodes);
    const noteConnectors = this.placeNoteConnectors(placedNodes, placedNotes);
    const placedEdges = this.placeEdges(placedNodes, placedNotes);
    const validation = this.validate(placedNodes, placedNotes, placedEdges.edges);
    const elements = [
      ...titleElements,
      ...Object.values(placedNodes).flatMap((card) => card.block.elements),
      ...Object.values(placedNotes).flatMap((card) => card.block.elements),
      ...noteConnectors,
      ...placedEdges.edgeArrows,
      ...placedEdges.edgeLabels,
    ];
    this.result = {
      nodes: placedNodes,
      notes: placedNotes,
      noteConnectors,
      edges: placedEdges.edges,
      edgeArrows: placedEdges.edgeArrows,
      edgeLabels: placedEdges.edgeLabels,
      titles: titleElements,
      bounds: boundsFor(elements),
      validation,
    };
    return this.result;
  }

  assertHealthy(): ValidationResult {
    const result = this.layout();
    const blocks = [
      ...Object.values(result.nodes),
      ...Object.values(result.notes),
    ].map((card) => ({
      id: card.id,
      bounds: card.bounds,
      overflowed: card.overflowed,
      texts: card.texts,
      padding: 0,
    }));
    return assertDiagramHealthy({ blocks, edges: result.edges, gap: this.layoutOptions().strictNoOverlap === false ? 0 : 16 });
  }

  private placeTitle(): ElementLike[] {
    const elements: ElementLike[] = [];
    const options = this.layoutOptions();
    const x = options.x ?? 0;
    const y = options.y ?? 0;
    const title = this.spec.title;
    const subtitle = this.spec.subtitle;
    if (title) {
      elements.push(this.scene.text(x, y, title, { size: 22, width: 760 }));
    }
    if (subtitle) {
      elements.push(this.scene.text(x, y + (title ? 34 : 0), subtitle, {
        size: 14,
        color: Colors.external,
        width: 840,
      }));
    }
    return elements;
  }

  private placeNodes(titleElements: ElementLike[]): Record<string, PlacedNodeCard> {
    const options = this.layoutOptions();
    const defaults = this.spec.defaults?.node ?? {};
    const nodeWidth = options.nodeWidth ?? options.node_width ?? defaults.width ?? 320;
    const columnGap = options.columnGap ?? options.column_gap ?? 72;
    const rowGap = options.rowGap ?? options.row_gap ?? 108;
    const x = options.x ?? 0;
    const reservedTopBand = options.reservedTopBand ?? options.reserved_top_band ?? defaultReservedTopBand(titleElements);
    const startY = (options.y ?? 0) + reservedTopBand;
    const rows = this.resolvedRows();
    const placed: Record<string, PlacedNodeCard> = {};
    let currentY = startY;

    for (const row of rows) {
      const rowCards = row.nodes.map((id) => {
        const spec = this.nodes.get(id);
        if (!spec) {
          throw new Error(`Graph row '${row.id}' references missing node '${id}'`);
        }
        const override = this.overrides.nodes?.[id] ?? {};
        const width = override.width ?? spec.width ?? nodeWidth;
        const color = spec.color ?? spec.role ?? defaults.color ?? defaults.role ?? "default";
        return nodeCard(this.scene, {
          ...(defaults as Partial<NodeCardSpec>),
          id,
          title: spec.title,
          iconId: spec.iconId ?? spec.icon_id ?? defaults.iconId ?? defaults.icon_id,
          bullets: spec.bullets ?? defaults.bullets ?? [],
          width,
          color,
          strict: spec.strict ?? defaults.strict,
          ports: spec.ports ?? defaults.ports,
          x: 0,
          y: 0,
        });
      });
      const rowHeight = Math.max(...rowCards.map((card) => card.bounds.height), 0);
      let currentX = x;
      for (const card of rowCards) {
        const override = this.overrides.nodes?.[card.id] ?? {};
        const targetX = override.x ?? currentX + (override.dx ?? 0);
        const targetY = override.y ?? currentY + (rowHeight - card.bounds.height) / 2 + (override.dy ?? 0);
        translateCard(card, targetX - card.bounds.left, targetY - card.bounds.top);
        placed[card.id] = card;
        currentX += card.bounds.width + columnGap;
      }
      currentY += rowHeight + rowGap;
    }

    return placed;
  }

  private placeNotes(nodes: Record<string, PlacedNodeCard>): Record<string, PlacedNodeCard> {
    const options = this.layoutOptions();
    const defaults = this.spec.defaults?.note ?? {};
    const noteWidth = options.noteWidth ?? options.note_width ?? defaults.width ?? 280;
    const noteGap = options.noteGap ?? options.note_gap ?? 40;
    const diagramBounds = boundsFor(Object.values(nodes).flatMap((node) => node.block.elements));
    const placed: Record<string, PlacedNodeCard> = {};
    let looseNoteIndex = 0;

    for (const note of this.internalNotes()) {
      const override = this.overrides.nodes?.[note.id] ?? {};
      const attachTo = override.attachTo ?? override.attach_to ?? note.spec.attachTo ?? note.spec.attach_to;
      const side = override.side ?? note.spec.side ?? "bottom";
      const isAnnotation = hasAnnotationItems(note.spec);
      const width = noteWidthFor(note.id, note.spec, defaults, override.width, noteWidth, isAnnotation);
      const attached = attachTo ? nodes[attachTo] : undefined;
      if (attachTo && !attached) {
        throw new Error(`Graph note '${note.id}' attachTo '${attachTo}' was not found`);
      }
      const base = attached
        ? notePosition(attached.bounds, diagramBounds, side, width, noteGap)
        : note.spec.placement === "bottom-right"
          ? [diagramBounds.right - width, diagramBounds.bottom + noteGap] as const
        : [diagramBounds.left + looseNoteIndex++ * (width + noteGap), diagramBounds.bottom + noteGap] as const;
      const x = base[0] + (note.spec.dx ?? 0) + (override.dx ?? 0);
      const y = base[1] + (note.spec.dy ?? 0) + (override.dy ?? 0);
      const card = isAnnotation
        ? annotationCard(this.scene, {
          id: note.id,
          title: note.spec.title ?? defaults.title ?? note.id,
          items: note.spec.items,
          width,
          x,
          y,
          color: note.spec.color ?? defaults.color ?? "note",
          defaults,
          spec: note.spec,
        })
        : noteCard(this.scene, {
          id: note.id,
          title: note.spec.title ?? defaults.title ?? note.id,
          bullets: note.spec.bullets ?? defaults.bullets ?? [],
          width,
          color: note.spec.color ?? defaults.color ?? "note",
          iconId: note.spec.iconId ?? note.spec.icon_id ?? defaults.iconId ?? defaults.icon_id,
          defaults,
          spec: note.spec,
          x,
          y,
        });
      placed[note.id] = card;
    }

    const noteItems = Object.values(placed).map((card) => ({ id: card.id, block: card.block, kind: "note" as const }));
    avoidOverlap(noteItems, { gap: 20 });
    for (const card of Object.values(placed)) {
      card.bounds = card.block.bounds;
      card.anchors = anchorsFor(card.bounds);
    }
    return placed;
  }

  private placeNoteConnectors(
    nodes: Record<string, PlacedNodeCard>,
    notes: Record<string, PlacedNodeCard>,
  ): ElementLike[] {
    const connectors: ElementLike[] = [];
    for (const note of this.internalNotes()) {
      const override = this.overrides.nodes?.[note.id] ?? {};
      const attachTo = override.attachTo ?? override.attach_to ?? note.spec.attachTo ?? note.spec.attach_to;
      if (!attachTo) {
        continue;
      }
      const target = nodes[attachTo];
      const placedNote = notes[note.id];
      if (!target || !placedNote) {
        continue;
      }
      const side = override.side ?? note.spec.side ?? "bottom";
      connectors.push(this.scene.line(noteConnectorPoints(placedNote.bounds, target.bounds, side), {
        color: Colors.note,
        strokeWidth: 1,
        dashed: true,
      }));
    }
    return connectors;
  }

  private placeEdges(
    nodes: Record<string, PlacedNodeCard>,
    notes: Record<string, PlacedNodeCard>,
  ): { edges: DiagramEdge[]; edgeArrows: ElementLike[]; edgeLabels: ElementLike[] } {
    const cards = { ...nodes, ...notes };
    const allBounds = boundsFor(Object.values(cards).flatMap((card) => card.block.elements));
    const edgeArrows: ElementLike[] = [];
    const edgeLabels: ElementLike[] = [];
    const edges: DiagramEdge[] = [];

    for (const edge of this.edges) {
      const source = cards[edge.from];
      const target = cards[edge.to];
      if (!source) {
        throw new Error(`Graph edge source '${edge.from}' was not found`);
      }
      if (!target) {
        throw new Error(`Graph edge target '${edge.to}' was not found`);
      }
      const id = edge.id ?? `${edge.from}->${edge.to}`;
      const override = this.overrides.edges?.[id] ?? {};
      const lane = override.lane ?? edge.lane;
      const direction = override.direction ?? edge.direction ?? inferDirection(source.bounds, target.bounds);
      const points = lane === "outer" ? outerRoute(source, target, allBounds, direction) : directRoute(source, target, edge, direction);
      const arrow = this.scene.arrow(points, {
        color: edgeColor(edge, this.spec.theme),
        strokeWidth: 2,
        dashed: edge.dashed ?? (edge.kind === "feedback" || edge.kind === "provenance"),
      });
      edgeArrows.push(arrow);

      let label: { id: string; bounds: Bounds } | undefined;
      if (edge.label) {
        const offset = override.labelOffset ?? override.label_offset ?? edge.labelOffset ?? edge.label_offset ?? {};
        const labelElement = this.placeEdgeLabel(id, edge.label, points, source.bounds, target.bounds, offset);
        edgeLabels.push(labelElement);
        label = { id: `${id}:label`, bounds: boundsFor([labelElement]) };
      }
      edges.push({ id, points, from: edge.from, to: edge.to, label });
    }

    return { edges, edgeArrows, edgeLabels };
  }

  private placeEdgeLabel(
    id: string,
    label: string,
    points: PointTuple[],
    source: Bounds,
    target: Bounds,
    offset: { dx?: number; dy?: number },
  ): ElementLike {
    const defaults = this.spec.defaults?.edge?.label;
    const width = defaults?.width ?? 180;
    const base = labelPositionFor(points, source, target, width);
    const placed = textBox(this.scene, base[0] + (offset.dx ?? 0), base[1] + (offset.dy ?? 0), label, {
      id: `${id}:label`,
      width,
      size: 12,
      minSize: defaults?.minSize ?? 10,
      maxLines: defaults?.maxLines ?? 2,
      overflow: defaults?.overflow ?? "ellipsis",
      color: Colors.external,
      align: "center",
    });
    return placed.element;
  }

  private validate(
    nodes: Record<string, PlacedNodeCard>,
    notes: Record<string, PlacedNodeCard>,
    edges: DiagramEdge[],
  ): ValidationResult {
    const blocks = [
      ...Object.values(nodes),
      ...Object.values(notes),
    ].map((card) => ({
      id: card.id,
      bounds: card.bounds,
      overflowed: card.overflowed,
      texts: card.texts,
      padding: 0,
    }));
    return validateDiagram({ blocks, edges, gap: this.layoutOptions().strictNoOverlap === false ? 0 : 16 });
  }

  private resolvedRows(): Array<{ id: string; nodes: string[] }> {
    const rows = this.rowOrder.length > 0 ? this.rowOrder : autoRows(this.internalNodes(), this.layoutOptions().preset ?? "lr-flow");
    const seen = new Set(rows.flatMap((row) => row.nodes));
    const missing = this.internalNodes().filter((node) => !seen.has(node.id)).map((node) => node.id);
    return missing.length === 0 ? rows : [...rows, { id: "unplaced", nodes: missing }];
  }

  private internalNodes(): InternalNode[] {
    return [...this.nodes.entries()].map(([id, spec]) => ({ id, spec }));
  }

  private internalNotes(): InternalNote[] {
    return [...this.notes.entries()].map(([id, spec]) => ({ id, spec }));
  }

  private layoutOptions(): GraphLayoutOptions {
    return { ...(this.spec.defaults?.layout ?? {}), ...(this.spec.layout ?? {}) };
  }

  private ensureNotLaidOut(): void {
    if (this.result) {
      throw new Error("FlowDiagram has already been laid out; create a new diagram to mutate the source spec");
    }
  }
}

export function flow(scene: Scene, spec: GraphSpec = {}): FlowDiagram {
  return new FlowDiagram(scene, spec);
}

export function theme(spec: ThemeSpec): ThemeSpec {
  return spec;
}

export const graphFlow = flow;
export const graph_flow = flow;

function mergeOverrides(a: DiagramOverrides, b: DiagramOverrides): DiagramOverrides {
  return {
    nodes: { ...(a.nodes ?? {}), ...(b.nodes ?? {}) },
    edges: { ...(a.edges ?? {}), ...(b.edges ?? {}) },
    lanes: { ...(a.lanes ?? {}), ...(b.lanes ?? {}) },
  };
}

function autoRows(nodes: InternalNode[], preset: GraphLayoutPreset): Array<{ id: string; nodes: string[] }> {
  const ids = nodes.map((node) => node.id);
  if (preset === "two-row-flow" && ids.length > 2) {
    const split = Math.ceil(ids.length / 2);
    return [
      { id: "primary", nodes: ids.slice(0, split) },
      { id: "secondary", nodes: ids.slice(split) },
    ];
  }
  return [{ id: "main", nodes: ids }];
}

function defaultReservedTopBand(titleElements: ElementLike[]): number {
  if (titleElements.length === 0) {
    return 0;
  }
  return boundsFor(titleElements).height + 36;
}

function translateCard(card: PlacedNodeCard, dx: number, dy: number): void {
  translate(card.block, dx, dy);
  card.bounds = card.block.bounds;
  card.anchors = anchorsFor(card.bounds);
}

function anchorsFor(bounds: Bounds): Record<string, [number, number]> {
  return {
    top: [bounds.centerX, bounds.top],
    right: [bounds.right, bounds.centerY],
    bottom: [bounds.centerX, bounds.bottom],
    left: [bounds.left, bounds.centerY],
    center: [bounds.centerX, bounds.centerY],
  };
}

function notePosition(
  target: Bounds,
  diagram: Bounds,
  side: GraphNoteSide,
  width: number,
  gap: number,
): readonly [number, number] {
  if (side === "left") {
    return [diagram.left - width - gap, target.top];
  }
  if (side === "right") {
    return [diagram.right + gap, target.top];
  }
  if (side === "top") {
    return [target.centerX - width / 2, diagram.top - gap - 92];
  }
  return [target.centerX - width / 2, diagram.bottom + gap];
}

function noteConnectorPoints(note: Bounds, target: Bounds, side: GraphNoteSide): PointTuple[] {
  if (side === "left") {
    return [[note.right, note.centerY], [target.left, target.centerY]];
  }
  if (side === "right") {
    return [[note.left, note.centerY], [target.right, target.centerY]];
  }
  if (side === "top") {
    return [[note.centerX, note.bottom], [target.centerX, target.top]];
  }
  return [[note.centerX, note.top], [target.centerX, target.bottom]];
}

function noteCard(
  scene: Scene,
  spec: NodeCardSpec & { defaults?: GraphNoteDefaults; spec?: GraphNoteSpec },
): PlacedNodeCard {
  const style = noteStyle(spec.spec ?? {}, spec.defaults);
  const color = resolveColor(spec.color, Colors.note);
  const card = nodeCard(scene, {
    ...spec,
    color,
    titleSize: spec.titleSize ?? style.titleSize,
    bulletSize: spec.bulletSize ?? style.itemSize,
    bulletGap: spec.bulletGap ?? style.itemGap,
    padding: spec.padding ?? style.padding,
  });
  const fold = Math.min(24, Math.max(16, card.bounds.width * 0.08));
  const top = card.bounds.top;
  const right = card.bounds.right;
  const foldElements = [
    scene.line([[right - fold, top], [right, top + fold]], { color, strokeWidth: 1 }),
    scene.line([[right - fold, top], [right - fold, top + fold]], { color, strokeWidth: 1 }),
    scene.line([[right - fold, top + fold], [right, top + fold]], { color, strokeWidth: 1 }),
  ];
  const block = scene.group([...card.block.elements, ...foldElements]);
  const bounds = boundsFor(block.elements);
  block.bounds = bounds;
  const groupIds = Array.isArray(card.frame.groupIds) ? (card.frame.groupIds as string[]) : [];
  return {
    ...card,
    block,
    bounds,
    groupId: groupIds[groupIds.length - 1] ?? card.groupId,
    anchors: anchorsFor(bounds),
  };
}

function annotationCard(
  scene: Scene,
  spec: {
    id: string;
    title: string;
    items?: GraphAnnotationItem[];
    width: number;
    x: number;
    y: number;
    color?: ColorRole | string;
    defaults?: GraphNoteDefaults;
    spec?: GraphNoteSpec;
  },
): PlacedNodeCard {
  const color = resolveColor(spec.color, Colors.note);
  const style = noteStyle(spec.spec ?? {}, spec.defaults);
  const cardFit = fitCard({
    id: spec.id,
    title: spec.title,
    rows: annotationRows(spec.items, style),
    width: spec.width,
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    minHeight: style.minHeight,
    maxHeight: style.maxHeight,
    padding: style.padding,
    titleSize: style.titleSize,
    rowSize: style.itemSize,
    titleGap: style.titleGap,
    rowGap: style.itemGap,
    strict: style.strict,
    iconId: style.iconId,
    iconSize: style.iconSize,
  });
  const elements: ElementLike[] = [];
  const texts: ElementLike[] = [];
  const frame = scene.rect(spec.x, spec.y, cardFit.width, cardFit.height, { color, strokeWidth: 1 });
  elements.push(frame);

  let icon: ElementLike | null = null;
  if (style.iconId) {
    icon = assets.place(scene, style.iconId, spec.x + style.padding, spec.y + style.padding, style.iconSize ?? 16);
    elements.push(icon);
  }

  if (cardFit.title) {
    const title = scene.text(spec.x + cardFit.title.x, spec.y + cardFit.title.y, cardFit.title.fitted.text, {
      size: cardFit.title.fitted.size,
      color,
      width: cardFit.title.availableWidth,
      lineHeight: cardFit.title.fitted.lineHeight,
    });
    elements.push(title);
    texts.push(title);
  }

  for (const row of cardFit.rows) {
    const line = scene.text(spec.x + row.x, spec.y + row.y, row.fitted.text, {
      size: row.fitted.size,
      color: resolveColor(row.source.color ?? row.source.role, Colors.default),
      width: row.availableWidth,
      lineHeight: row.fitted.lineHeight,
    });
    elements.push(line);
    texts.push(line);
  }

  const block = scene.group(elements);
  const bounds = boundsFor(elements);
  block.bounds = bounds;
  const groupIds = Array.isArray(frame.groupIds) ? (frame.groupIds as string[]) : [];
  return {
    id: spec.id,
    block: new PlacedBlock(block.elements, bounds),
    bounds,
    frame,
    texts,
    icon,
    groupId: groupIds[groupIds.length - 1] ?? "",
    anchors: anchorsFor(bounds),
    overflowed: cardFit.overflowed,
    warnings: cardFit.warnings,
  };
}

function hasAnnotationItems(spec: GraphNoteSpec): boolean {
  return (spec.items?.length ?? 0) > 0;
}

function noteWidthFor(
  id: string,
  spec: GraphNoteSpec,
  defaults: GraphNoteDefaults,
  overrideWidth?: number,
  fallbackPreferredWidth?: number,
  isAnnotation = false,
): number {
  const style = noteStyle(spec, defaults);
  return fitCard(noteFitOptions(id, spec, defaults, overrideWidth, fallbackPreferredWidth, isAnnotation, style)).width;
}

function noteFitOptions(
  id: string,
  spec: GraphNoteSpec,
  defaults: GraphNoteDefaults,
  overrideWidth: number | undefined,
  fallbackPreferredWidth: number | undefined,
  isAnnotation: boolean,
  style: ReturnType<typeof noteStyle>,
): FitCardOptions {
  return {
    id,
    title: spec.title ?? defaults.title ?? id,
    rows: isAnnotation
      ? annotationRows(spec.items, style)
      : (spec.bullets ?? defaults.bullets ?? []).map((bullet, index) => ({
        id: `${id}.bullet[${index}]`,
        text: `- ${bullet}`,
        size: style.itemSize,
        minSize: Math.min(style.itemSize, 11),
        maxLines: defaults.text?.maxLines,
        overflow: defaults.text?.overflow,
      })),
    width: overrideWidth ?? spec.width ?? defaults.width,
    preferredWidth: spec.preferredWidth ?? spec.preferred_width
      ?? defaults.preferredWidth ?? defaults.preferred_width
      ?? (isAnnotation ? undefined : fallbackPreferredWidth),
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    minHeight: style.minHeight,
    maxHeight: style.maxHeight,
    padding: style.padding,
    titleSize: style.titleSize,
    rowSize: style.itemSize,
    titleGap: style.titleGap,
    rowGap: style.itemGap,
    strict: style.strict,
    iconId: style.iconId,
    iconSize: style.iconSize,
  };
}

function noteStyle(spec: GraphNoteSpec, defaults: GraphNoteDefaults = {}): {
  padding: number;
  titleSize: number;
  itemSize: number;
  titleGap: number;
  itemGap: number;
  minWidth: number;
  maxWidth: number;
  minHeight?: number;
  maxHeight?: number;
  strict: boolean;
  iconId?: string;
  iconSize?: number;
} {
  return {
    padding: spec.padding ?? defaults.padding ?? 12,
    titleSize: spec.titleSize ?? spec.title_size ?? defaults.titleSize ?? defaults.title_size ?? 12,
    itemSize: spec.itemSize ?? spec.item_size ?? spec.rowSize ?? spec.row_size
      ?? defaults.itemSize ?? defaults.item_size ?? defaults.rowSize ?? defaults.row_size ?? 11,
    titleGap: spec.titleGap ?? spec.title_gap ?? defaults.titleGap ?? defaults.title_gap ?? 6,
    itemGap: spec.itemGap ?? spec.item_gap ?? spec.rowGap ?? spec.row_gap
      ?? defaults.itemGap ?? defaults.item_gap ?? defaults.rowGap ?? defaults.row_gap ?? 3,
    minWidth: spec.minWidth ?? spec.min_width ?? defaults.minWidth ?? defaults.min_width ?? 168,
    maxWidth: spec.maxWidth ?? spec.max_width ?? defaults.maxWidth ?? defaults.max_width ?? 280,
    minHeight: spec.minHeight ?? spec.min_height ?? defaults.minHeight ?? defaults.min_height,
    maxHeight: spec.maxHeight ?? spec.max_height ?? defaults.maxHeight ?? defaults.max_height,
    strict: spec.strict ?? defaults.strict ?? false,
    iconId: spec.iconId ?? spec.icon_id ?? defaults.iconId ?? defaults.icon_id,
    iconSize: 16,
  };
}

function normalizeAnnotationItems(items: GraphAnnotationItem[] | undefined): GraphAnnotationLineSpec[] {
  return (items ?? []).map((item) => typeof item === "string" ? { text: item } : item);
}

function annotationRows(items: GraphAnnotationItem[] | undefined, style: ReturnType<typeof noteStyle>): ContentCardRow[] {
  return normalizeAnnotationItems(items).map((item, index) => {
    const size = item.size ?? item.fontSize ?? item.font_size ?? style.itemSize;
    return {
      id: `annotation.row[${index}]`,
      text: item.text,
      role: item.role,
      color: item.color,
      size,
      minSize: Math.min(size, 9),
    };
  });
}

function directRoute(
  source: PlacedNodeCard,
  target: PlacedNodeCard,
  edge: GraphEdgeSpec,
  direction: GraphEdgeDirection,
): PointTuple[] {
  const fromPort = edge.fromPort ?? edge.from_port;
  const toPort = edge.toPort ?? edge.to_port;
  const start = fromPort ? source.anchors[fromPort] : source.anchors[sideForDirection(direction, "from")];
  const end = toPort ? target.anchors[toPort] : target.anchors[sideForDirection(direction, "to")];
  if (!start) {
    throw new Error(`Graph edge '${edge.from}->${edge.to}' references missing fromPort '${fromPort}'`);
  }
  if (!end) {
    throw new Error(`Graph edge '${edge.from}->${edge.to}' references missing toPort '${toPort}'`);
  }
  if (direction === "top-down" || direction === "bottom-up") {
    const midY = (start[1] + end[1]) / 2;
    return [start, [start[0], midY], [end[0], midY], end];
  }
  const midX = (start[0] + end[0]) / 2;
  return [start, [midX, start[1]], [midX, end[1]], end];
}

function outerRoute(
  source: PlacedNodeCard,
  target: PlacedNodeCard,
  bounds: Bounds,
  direction: GraphEdgeDirection,
): PointTuple[] {
  if (direction === "right-to-left") {
    const start = source.anchors.left;
    const end = target.anchors.right;
    const y = bounds.bottom + 42;
    return [start, [start[0], y], [end[0], y], end];
  }
  if (direction === "left-to-right") {
    const start = source.anchors.right;
    const end = target.anchors.left;
    const y = bounds.bottom + 42;
    return [start, [start[0], y], [end[0], y], end];
  }
  const start = source.anchors[sideForDirection(direction, "from")];
  const end = target.anchors[sideForDirection(direction, "to")];
  const x = bounds.right + 42;
  return [start, [x, start[1]], [x, end[1]], end];
}

function sideForDirection(direction: GraphEdgeDirection, endpoint: "from" | "to"): NodeSide {
  if (direction === "right-to-left") {
    return endpoint === "from" ? "left" : "right";
  }
  if (direction === "top-down") {
    return endpoint === "from" ? "bottom" : "top";
  }
  if (direction === "bottom-up") {
    return endpoint === "from" ? "top" : "bottom";
  }
  return endpoint === "from" ? "right" : "left";
}

function inferDirection(source: Bounds, target: Bounds): GraphEdgeDirection {
  if (target.top >= source.bottom) {
    return "top-down";
  }
  if (target.bottom <= source.top) {
    return "bottom-up";
  }
  const dx = target.centerX - source.centerX;
  const dy = target.centerY - source.centerY;
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy >= 0 ? "top-down" : "bottom-up";
  }
  return dx >= 0 ? "left-to-right" : "right-to-left";
}

function edgeColor(edge: GraphEdgeSpec, themeSpec: ThemeSpec | undefined): string {
  const role = edge.kind === "risk" ? "risk" : edge.kind === "provenance" ? "external" : "default";
  return themeSpec?.accents?.[edge.kind ?? "primary"] ?? themeSpec?.accents?.[role] ?? Colors[role as ColorRole];
}

function polylineMidpoint(points: PointTuple[]): PointTuple {
  if (points.length === 0) {
    return [0, 0];
  }
  const middle = points[Math.floor((points.length - 1) / 2)];
  const next = points[Math.min(points.length - 1, Math.floor((points.length - 1) / 2) + 1)];
  return [(middle[0] + next[0]) / 2, (middle[1] + next[1]) / 2];
}

function labelPositionFor(points: PointTuple[], source: Bounds, target: Bounds, width: number): PointTuple {
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) {
    return [0, 0];
  }
  if (Math.abs(start[1] - end[1]) < 1) {
    const center = polylineMidpoint(points);
    const top = Math.min(source.top, target.top);
    const y = top > 0 && top < 120 ? Math.max(source.bottom, target.bottom) + 24 : top - 38;
    return [center[0] - width / 2, y];
  }
  if (source.bottom <= target.top) {
    return [start[0] + 16, source.bottom + 24];
  }
  if (target.bottom <= source.top) {
    return [start[0] + 16, target.bottom + 24];
  }
  const center = polylineMidpoint(points);
  return [center[0] - width / 2, Math.min(source.top, target.top) - 49];
}
