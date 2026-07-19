import {
  DiagramBuildMetadata,
  DiagramSpec,
  SemanticPaletteName,
  SemanticStatus,
  SequenceInteractionSpec,
  SwimlaneFlowSpec,
  buildDiagramSpec,
  validateDiagramSpec,
} from "../../src/index.js";

const palettes: SemanticPaletteName[] = [
  "semantic-neutral",
  "change-diff",
  "high-contrast",
  "c4-blue",
];
const statuses: SemanticStatus[] = [
  "added",
  "changed",
  "removed",
  "risk",
];

const spec: DiagramSpec = {
  template: "c4.container",
  title: "Compatibility proof",
  system: {
    id: "system",
    name: "System",
    description: "Preserves the original typed C4 surface.",
    containers: [
      {
        id: "first",
        name: "First",
        description: "First container.",
        technology: "TypeScript",
      },
      {
        id: "second",
        name: "Second",
        description: "Second container.",
        technology: "TypeScript",
      },
    ],
  },
};

const validation = validateDiagramSpec(spec);
if (validation.ok) {
  validation.value.system.containers[0].technology.toUpperCase();
}

const build = buildDiagramSpec(spec);
if (build.ok) {
  const metadata: DiagramBuildMetadata = build.metadata;
  metadata.system.name.toUpperCase();
}

const semanticC4: DiagramSpec = {
  ...spec,
  palette: palettes[0],
  system: {
    ...spec.system,
    containers: spec.system.containers.map((container, index) => ({
      ...container,
      status: statuses[index],
    })),
  },
  relationships: [{
    id: "first-second",
    from: "first",
    to: "second",
    description: "calls",
    status: statuses[2],
  }],
};

const semanticSequence: SequenceInteractionSpec = {
  template: "sequence.interaction",
  title: "Palette type proof",
  palette: palettes[1],
  participants: [
    { id: "first", name: "First", status: statuses[0] },
    { id: "second", name: "Second", status: statuses[1] },
  ],
  messages: [{
    id: "first-second",
    from: "first",
    to: "second",
    label: "calls",
    status: statuses[2],
  }],
};

const semanticSwimlane: SwimlaneFlowSpec = {
  template: "flow.swimlane",
  title: "Palette type proof",
  palette: palettes[2],
  lanes: [
    { id: "first", label: "First" },
    { id: "second", label: "Second" },
  ],
  activities: [
    {
      id: "start",
      lane: "first",
      type: "step",
      title: "Start",
      status: statuses[0],
    },
    {
      id: "end",
      lane: "second",
      type: "decision",
      title: "End",
      status: statuses[3],
    },
  ],
  transitions: [{
    id: "start-end",
    from: "start",
    to: "end",
    status: statuses[1],
  }],
};

for (const palette of palettes) {
  buildDiagramSpec({ ...semanticC4, palette });
  buildDiagramSpec({ ...semanticSequence, palette });
  buildDiagramSpec({ ...semanticSwimlane, palette });
}
