import type { MeasuredFixture, Placement } from "./model.js";
import { rankFixture } from "./rank.js";

const CARD_GAP = 22;

export function placeArmA(measured: MeasuredFixture): Placement {
  const { fixture } = measured;
  const policy = measured.groupPolicy;
  const { ranks } = rankFixture(fixture);
  const nodeBounds: Placement["nodeBounds"] = {};
  const groupBounds: Placement["groupBounds"] = {};
  const order: Record<string, number> = {};

  fixture.groups.forEach((group, groupIndex) => {
    const x =
      groupIndex * (policy.sectionMinWidth + policy.sectionGap);
    const contentY =
      policy.padding + policy.titleHeight + policy.headerGap;
    let cursorY = contentY;
    for (const member of group.members) {
      const node = measured.nodes[member];
      nodeBounds[member] = {
        x: x + policy.padding,
        y: cursorY,
        width: node.width,
        height: node.height,
      };
      order[member] = group.members.indexOf(member);
      cursorY += node.height + CARD_GAP;
    }
    const formulaHeight =
      group.members.length *
        (measured.measurementPolicy.minHeight + CARD_GAP) +
      policy.padding * 2 +
      policy.titleHeight +
      policy.headerGap;
    const measuredHeight =
      cursorY - CARD_GAP + policy.padding;
    groupBounds[group.id] = {
      x,
      y: 0,
      width: policy.sectionMinWidth,
      height: Math.max(
        policy.sectionMinHeight,
        formulaHeight,
        measuredHeight,
      ),
    };
  });

  return { ranks, order, nodeBounds, groupBounds };
}
