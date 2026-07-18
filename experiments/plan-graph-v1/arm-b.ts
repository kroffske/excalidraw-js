import type { Fixture } from "./fixture.js";
import type { MeasuredFixture, Placement } from "./model.js";
import { codePointCompare, rankFixture } from "./rank.js";

const SIBLING_GAP = 48;
const LEVEL_GAP = 84;

export function placeArmB(measured: MeasuredFixture): Placement {
  const { fixture } = measured;
  const policy = measured.groupPolicy;
  const { ranks } = rankFixture(fixture);
  const orderedRanks = barycenterOrder(fixture, ranks);
  const groupOrder = globalGroupOrder(fixture, orderedRanks);
  const nodeBounds: Placement["nodeBounds"] = {};
  const groupBounds: Placement["groupBounds"] = {};
  const order: Record<string, number> = {};
  let groupX = 0;

  for (const groupId of groupOrder) {
    const group = measured.groups[groupId];
    const membersByRank = new Map<number, string[]>();
    for (const member of group.members) {
      const rank = ranks[member];
      const members = membersByRank.get(rank) ?? [];
      members.push(member);
      membersByRank.set(rank, members);
    }
    for (const members of membersByRank.values()) {
      members.sort(
        (left, right) =>
          rankPosition(orderedRanks, ranks[left], left) -
            rankPosition(orderedRanks, ranks[right], right) ||
          codePointCompare(left, right),
      );
    }
    const widestRank = Math.max(
      0,
      ...[...membersByRank.values()].map((members) =>
        members.reduce(
          (width, member, index) =>
            width +
            measured.nodes[member].width +
            (index === 0 ? 0 : SIBLING_GAP),
          0,
        ),
      ),
    );
    const groupWidth = Math.max(
      policy.sectionMinWidth,
      widestRank + policy.padding * 2,
    );
    const maxRank = Math.max(0, ...group.members.map((id) => ranks[id]));
    const bodyY = policy.padding + policy.titleHeight + policy.headerGap;
    for (const [rank, members] of membersByRank) {
      const rowWidth = members.reduce(
        (width, member, index) =>
          width +
          measured.nodes[member].width +
          (index === 0 ? 0 : SIBLING_GAP),
        0,
      );
      let nodeX = groupX + (groupWidth - rowWidth) / 2;
      members.forEach((member, index) => {
        const node = measured.nodes[member];
        nodeBounds[member] = {
          x: nodeX,
          y: bodyY + rank * (node.height + LEVEL_GAP),
          width: node.width,
          height: node.height,
        };
        order[member] = rankPosition(orderedRanks, rank, member);
        nodeX += node.width + SIBLING_GAP;
        if (index === members.length - 1) return;
      });
    }
    const maxBottom = Math.max(
      bodyY,
      ...group.members.map(
        (member) => nodeBounds[member].y + nodeBounds[member].height,
      ),
    );
    groupBounds[groupId] = {
      x: groupX,
      y: 0,
      width: groupWidth,
      height: Math.max(
        policy.sectionMinHeight,
        maxBottom + policy.padding,
        bodyY +
          maxRank * (measured.measurementPolicy.minHeight + LEVEL_GAP) +
          measured.measurementPolicy.minHeight +
          policy.padding,
      ),
    };
    groupX += groupWidth + policy.sectionGap;
  }

  return { ranks, order, nodeBounds, groupBounds };
}

export function barycenterOrder(
  fixture: Fixture,
  ranks: Record<string, number>,
): Map<number, string[]> {
  const ordered = new Map<number, string[]>();
  for (const node of fixture.nodes) {
    const rank = ranks[node.id];
    const row = ordered.get(rank) ?? [];
    row.push(node.id);
    ordered.set(rank, row);
  }
  const groupByNode = new Map(
    fixture.nodes.map((node) => [node.id, node.group]),
  );
  for (const row of ordered.values()) {
    row.sort(
      (left, right) =>
        codePointCompare(groupByNode.get(left)!, groupByNode.get(right)!) ||
        codePointCompare(left, right),
    );
  }

  const maxRank = Math.max(0, ...ordered.keys());
  for (const direction of ["forward", "backward", "forward", "backward"] as const) {
    const rankSequence =
      direction === "forward"
        ? Array.from({ length: maxRank + 1 }, (_, index) => index)
        : Array.from({ length: maxRank + 1 }, (_, index) => maxRank - index);
    for (const rank of rankSequence) {
      const row = ordered.get(rank);
      if (!row) continue;
      const neighborRank = direction === "forward" ? rank - 1 : rank + 1;
      const neighborRow = ordered.get(neighborRank);
      if (!neighborRow) continue;
      const previousPosition = new Map(row.map((id, index) => [id, index]));
      const neighborPosition = new Map(
        neighborRow.map((id, index) => [id, index]),
      );
      const barycenter = (id: string): number | null => {
        const positions = fixture.edges
          .filter(
            (edge) =>
              edge.kind !== "feedback" &&
              ((edge.to === id &&
                ranks[edge.from] === neighborRank &&
                ranks[edge.to] === rank) ||
                (edge.from === id &&
                  ranks[edge.to] === neighborRank &&
                  ranks[edge.from] === rank)),
          )
          .map((edge) =>
            neighborPosition.get(edge.from === id ? edge.to : edge.from),
          )
          .filter((value): value is number => value !== undefined);
        if (positions.length === 0) return null;
        return positions.reduce((sum, value) => sum + value, 0) / positions.length;
      };
      const buckets = new Map<string, string[]>();
      for (const id of row) {
        const group = groupByNode.get(id)!;
        const bucket = buckets.get(group) ?? [];
        bucket.push(id);
        buckets.set(group, bucket);
      }
      const scoredBuckets = [...buckets.entries()].map(([group, members]) => {
        const score = bucketBarycenterScore(
          members,
          barycenter,
          previousPosition,
        );
        return { group, members, score };
      });
      scoredBuckets.sort(
        (left, right) =>
          left.score - right.score ||
          Math.min(...left.members.map((id) => previousPosition.get(id)!)) -
            Math.min(...right.members.map((id) => previousPosition.get(id)!)) ||
          codePointCompare(left.group, right.group),
      );
      const next = scoredBuckets.flatMap(({ members }) =>
        [...members].sort((left, right) => {
          const leftScore = barycenter(left);
          const rightScore = barycenter(right);
          return (
            (leftScore ?? previousPosition.get(left)!) -
              (rightScore ?? previousPosition.get(right)!) ||
            previousPosition.get(left)! - previousPosition.get(right)! ||
            codePointCompare(left, right)
          );
        }),
      );
      ordered.set(rank, next);
    }
  }
  return ordered;
}

export function bucketBarycenterScore(
  members: string[],
  barycenter: (id: string) => number | null,
  previousPosition: Map<string, number>,
): number {
  const values = members.map((id) => {
    const retained = previousPosition.get(id);
    if (retained === undefined) throw new Error(`INCOMPLETE_NODE_SET:${id}`);
    return barycenter(id) ?? retained;
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function globalGroupOrder(
  fixture: Fixture,
  orderedRanks: Map<number, string[]>,
): string[] {
  const positions = new Map<string, number>();
  for (const row of orderedRanks.values()) {
    row.forEach((id, index) => positions.set(id, index));
  }
  return fixture.groups
    .map((group) => ({
      id: group.id,
      mean:
        group.members.reduce((sum, id) => sum + (positions.get(id) ?? 0), 0) /
        group.members.length,
    }))
    .sort(
      (left, right) =>
        left.mean - right.mean || codePointCompare(left.id, right.id),
    )
    .map(({ id }) => id);
}

function rankPosition(
  orderedRanks: Map<number, string[]>,
  rank: number,
  id: string,
): number {
  const position = orderedRanks.get(rank)?.indexOf(id) ?? -1;
  if (position < 0) throw new Error(`INCOMPLETE_NODE_SET:${id}`);
  return position;
}
