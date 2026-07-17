import {
  DiagramBuildMetadata,
  DiagramSpec,
  buildDiagramSpec,
  validateDiagramSpec,
} from "../../src/index.js";

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
