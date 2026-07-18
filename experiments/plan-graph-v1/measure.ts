import { fitCard } from "../../src/card.js";
import type { Fixture } from "./fixture.js";
import type {
  GroupMeasurementPolicy,
  MeasuredFixture,
  MeasuredGroup,
  MeasuredNode,
} from "./model.js";

const MEASUREMENT_POLICY = {
  owner: "src/card.ts#fitCard",
  width: 300,
  minHeight: 112,
  padding: 16,
  titleSize: 17,
  titleMinSize: 13,
  titleMaxLines: 2,
  rows: [] as [],
  iconId: null,
} as const;

const GROUP_POLICY: GroupMeasurementPolicy = {
  owner: "src/layout.ts#section",
  padding: 24,
  titleHeight: 40,
  headerGap: 8,
  sectionGap: 40,
  sectionMinWidth: 360,
  sectionMinHeight: 390,
};

export function measureFixture(fixture: Fixture): MeasuredFixture {
  const nodes = Object.fromEntries(
    fixture.nodes.map((node) => {
      const fitted = fitCard({
        id: node.id,
        title: node.title,
        width: MEASUREMENT_POLICY.width,
        minHeight: MEASUREMENT_POLICY.minHeight,
        padding: MEASUREMENT_POLICY.padding,
        titleSize: MEASUREMENT_POLICY.titleSize,
        titleMinSize: MEASUREMENT_POLICY.titleMinSize,
        titleMaxLines: MEASUREMENT_POLICY.titleMaxLines,
        rows: [],
        iconId: null,
      });
      if (!fitted.title || fitted.overflowed) {
        throw new Error(`MEASUREMENT_FAILED:${fixture.id}:${node.id}`);
      }
      const measured: MeasuredNode = {
        id: node.id,
        group: node.group,
        title: node.title,
        width: fitted.width,
        height: fitted.height,
        titleX: fitted.title.x,
        titleY: fitted.title.y,
        titleWidth: fitted.title.availableWidth,
        titleSize: fitted.title.fitted.size,
        titleLineHeight: fitted.title.fitted.lineHeight,
        titleText: fitted.title.fitted.text,
      };
      return [node.id, measured];
    }),
  );

  const groups = Object.fromEntries(
    fixture.groups.map((group) => {
      const measured: MeasuredGroup = {
        id: group.id,
        label: group.label,
        members: [...group.members],
        padding: GROUP_POLICY.padding,
        titleHeight: GROUP_POLICY.titleHeight,
        headerGap: GROUP_POLICY.headerGap,
      };
      return [group.id, measured];
    }),
  );

  return {
    fixture,
    nodes,
    groups,
    measurementPolicy: MEASUREMENT_POLICY,
    groupPolicy: GROUP_POLICY,
  };
}
