import { Scene } from "../../src/core.js";
import { Bounds, PlacedBlock } from "../../src/geometry.js";
import { connectRouted } from "../../src/layout.js";
import type { MeasuredFixture, Placement, Point, Rect } from "./model.js";
import { codePointCompare } from "./rank.js";

export function routePlacement(
  measured: MeasuredFixture,
  placement: Placement,
): Record<string, Point[]> {
  const scene = new Scene({ seed: 20260718 });
  const nodeBlocks = Object.fromEntries(
    Object.entries(placement.nodeBounds).map(([id, rect]) => [
      id,
      new PlacedBlock([], toBounds(rect)),
    ]),
  );
  const allNodeObstacles = Object.entries(placement.nodeBounds);
  const allGroupObstacles = Object.entries(placement.groupBounds);
  const groupByNode = new Map(
    measured.fixture.nodes.map((node) => [node.id, node.group]),
  );
  const routes: Record<string, Point[]> = {};

  for (const edge of [...measured.fixture.edges]
    .filter((candidate) => candidate.kind !== "feedback")
    .sort((left, right) => codePointCompare(left.id, right.id))) {
    const sourceGroup = groupByNode.get(edge.from)!;
    const targetGroup = groupByNode.get(edge.to)!;
    const obstacles = [
      ...allNodeObstacles
        .filter(([id]) => id !== edge.from && id !== edge.to)
        .map(([, rect]) => toBounds(rect)),
      ...allGroupObstacles
        .filter(([id]) => id !== sourceGroup && id !== targetGroup)
        .map(([, rect]) => toBounds(rect)),
      ...allGroupObstacles
        .filter(([id]) => id !== sourceGroup && id !== targetGroup)
        .map(([id, rect]) =>
          new Bounds(rect.x, rect.y, rect.width, titleBandHeight(measured, id)),
        ),
    ];
    const routed = connectRouted(
      scene,
      nodeBlocks[edge.from],
      nodeBlocks[edge.to],
      {
        kind: edge.kind === "primary" ? "primary" : "secondary",
        path: "auto",
        obstacles,
        clearance: 6,
        cornerRadius: 0,
      },
    );
    routes[edge.id] = routed.points.map(copyPoint);
  }

  const feedback = [...measured.fixture.edges]
    .filter((edge) => edge.kind === "feedback")
    .sort((left, right) => codePointCompare(left.id, right.id));
  const layoutBounds = unionBounds(Object.values(placement.groupBounds));
  feedback.forEach((edge, index) => {
    const sourceGroup = groupByNode.get(edge.from)!;
    const targetGroup = groupByNode.get(edge.to)!;
    const obstacles = [
      ...allNodeObstacles
        .filter(([id]) => id !== edge.from && id !== edge.to)
        .map(([, rect]) => toBounds(rect)),
      ...allGroupObstacles
        .filter(([id]) => id !== sourceGroup && id !== targetGroup)
        .map(([, rect]) => toBounds(rect)),
    ];
    const routed = connectRouted(
      scene,
      nodeBlocks[edge.from],
      nodeBlocks[edge.to],
      {
        kind: "feedback",
        direction: "top-down",
        from: "right",
        to: "right",
        path: "outer",
        outerSide: "right",
        outerGap: 48 + index * 16,
        routeBounds: layoutBounds,
        obstacles,
        clearance: 6,
        cornerRadius: 0,
      },
    );
    routes[edge.id] = routed.points.map(copyPoint);
  });
  return routes;
}

function titleBandHeight(measured: MeasuredFixture, id: string): number {
  const group = measured.groups[id];
  return group.padding + group.titleHeight + group.headerGap;
}

function toBounds(rect: Rect): Bounds {
  return new Bounds(rect.x, rect.y, rect.width, rect.height);
}

function unionBounds(rects: Rect[]): Bounds {
  if (rects.length === 0) return new Bounds(0, 0, 0, 0);
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return new Bounds(left, top, right - left, bottom - top);
}

function copyPoint(point: readonly [number, number]): Point {
  return [point[0], point[1]];
}
