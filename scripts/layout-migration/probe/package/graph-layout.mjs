// Minimal engine computation probe; this is not the migration's geometry API.
export const prototype = 'stage0-packaging-only';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

export function computeProbe(runtime) {
  if (!runtime?.graphviz || !runtime?.Avoid) {
    throw Object.assign(new Error('An initialized runtime is required'), {
      code: 'LAYOUT_RUNTIME_REQUIRED',
    });
  }
  const graph = JSON.parse(runtime.graphviz.layout(
    'digraph probe { rankdir=LR; node [shape=box, fixedsize=true, width=1, height=0.5]; a -> b; }',
    'json', 'dot',
  ));
  const nodes = graph.objects.map(({ name, pos, width, height }) => ({
    id: name,
    center: pos.split(',').map(Number),
    width: Number(width) * 72,
    height: Number(height) * 72,
  }));
  check(nodes.length === 2 && nodes.every(node =>
    node.center.length === 2 && node.center.every(Number.isFinite)
      && Number.isFinite(node.width) && node.width > 0
      && Number.isFinite(node.height) && node.height > 0),
  'Graphviz must return two finite positive node boxes');
  check(nodes[0].id === 'a' && nodes[1].id === 'b'
    && nodes[0].center[0] < nodes[1].center[0],
  'Graphviz must compute left-to-right placement');
  check(graph.edges.length === 1 && graph.edges[0].tail === 0 && graph.edges[0].head === 1,
    'Graphviz must preserve the requested edge direction');

  // A blocking rectangle distinguishes real orthogonal routing from a direct line.
  const A = runtime.Avoid;
  const router = new A.Router(A.RouterFlag.OrthogonalRouting.value);
  const owned = [];
  const own = value => { owned.push(value); return value; };
  try {
    const topLeft = own(new A.Point(120, -30));
    const bottomRight = own(new A.Point(180, 30));
    const rectangle = own(new A.Rectangle(topLeft, bottomRight));
    new A.ShapeRef(router, rectangle); // Router owns shapes and connectors.
    const source = own(new A.Point(0, 0));
    const target = own(new A.Point(300, 0));
    const sourceEnd = own(new A.ConnEnd(source));
    const targetEnd = own(new A.ConnEnd(target));
    const connector = new A.ConnRef(router, sourceEnd, targetEnd);
    connector.setRoutingType(A.ConnType.ConnType_Orthogonal.value);
    router.processTransaction();
    const line = connector.displayRoute();
    const points = [];
    for (let index = 0; index < line.size(); index += 1) {
      const point = line.at(index);
      points.push([point.x, point.y]);
    }
    check(points.length >= 4 && points.every(point => point.every(Number.isFinite)),
      'libavoid must return a finite detour around the obstacle');
    check(points[0][0] === 0 && points[0][1] === 0
      && points.at(-1)[0] === 300 && points.at(-1)[1] === 0,
    'libavoid must preserve endpoints');
    for (let index = 1; index < points.length; index += 1) {
      const [x1, y1] = points[index - 1], [x2, y2] = points[index];
      check(x1 === x2 || y1 === y2, 'libavoid segment must be orthogonal');
      const enters = x1 === x2
        ? x1 > 120 && x1 < 180 && Math.max(y1, y2) > -30 && Math.min(y1, y2) < 30
        : y1 > -30 && y1 < 30 && Math.max(x1, x2) > 120 && Math.min(x1, x2) < 180;
      check(!enters, 'libavoid route must avoid the open obstacle interior');
    }
    return { prototype, graphvizVersion: runtime.graphviz.version(), nodes,
      route: { endpoints: [[0, 0], [300, 0]], obstacle: [120, -30, 60, 60], points } };
  } finally {
    router.delete();
    for (const value of owned.reverse()) value.delete();
  }
}
