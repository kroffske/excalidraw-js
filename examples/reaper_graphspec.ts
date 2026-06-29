import { AssetRegistry, Scene, diagram } from "../src/index.ts";

const scene = new Scene({ seed: 20260629, assetRegistry: AssetRegistry.bundled() });

const g = diagram.flow(scene, {
  title: "Reaper integration - one supervised-loop tick",
  subtitle: "Signal claim then advisory risk resize for OPEN-intent only; native risk remains the writer.",
  theme: diagram.theme({
    base: "mono-blue",
    accents: {
      risk: "#b45309",
      changed: "#7c3aed",
    },
  }),
  defaults: {
    node: { strict: true },
    edge: { label: { maxLines: 2, overflow: "ellipsis" } },
    layout: { preset: "two-row-flow" },
  },
});

g.node("dataContext", {
  title: "DataContext",
  bullets: ["per instrument / aso"],
});
g.node("reaperSignalProvider", {
  title: "ReaperSignalProvider",
  bullets: ["async_generate", "impolite scan"],
});
g.node("algoInsightSignal", {
  title: "generate_algoinsight_signal",
  bullets: ["external -> signal"],
});
g.node("executionIntent", {
  title: "ExecutionIntent",
  bullets: ["OPEN or CLOSE", "pref risk"],
});
g.node("approveBatch", {
  title: "approve_batch_with_optional_reaper",
  role: "changed",
  bullets: ["OPEN -> resize to cap", "max_position_size"],
});
g.node("portfolioRiskCoordinator", {
  title: "PortfolioRiskCoordinator",
  role: "risk",
  bullets: ["single writer", "native risk"],
});

g.row("claim", ["dataContext", "reaperSignalProvider", "algoInsightSignal"]);
g.row("execution", ["portfolioRiskCoordinator", "approveBatch", "executionIntent"]);

g.edge("dataContext", "reaperSignalProvider", { label: "context" });
g.edge("reaperSignalProvider", "algoInsightSignal", { label: "async generate" });
g.edge("algoInsightSignal", "executionIntent", { label: "signal input", direction: "top-down" });
g.edge("executionIntent", "approveBatch", { label: "OPEN intent", direction: "right-to-left" });
g.edge("approveBatch", "portfolioRiskCoordinator", {
  label: "reduced size",
  kind: "risk",
  direction: "right-to-left",
});

g.note("openOnly", {
  title: "OPEN-only",
  bullets: ["CLOSE passes straight to native risk", "resize < min qty -> reject"],
}).attachTo("approveBatch", { side: "bottom" });
g.note("provenance", {
  title: "provenance",
  bullets: ["reaper in RiskDecision.attributes", "provider run status"],
}).attachTo("portfolioRiskCoordinator", { side: "bottom" });
g.annotation("annotation", {
  title: "flow markers",
  maxWidth: 220,
  items: [
    { text: "normal flow", role: "default" },
    { text: "changed integration", role: "changed" },
    { text: "native risk", role: "risk" },
    { text: "notes and provenance", role: "note" },
  ],
});

const result = g.layout();
const health = g.assertHealthy();

const outPath = "examples/out/reaper_graphspec.excalidraw";
scene.write(outPath);

console.log(JSON.stringify({
  excalidrawPath: outPath,
  elements: scene.elements.length,
  nodes: Object.keys(result.nodes).length,
  notes: Object.keys(result.notes).length,
  edges: result.edges.length,
  validation: { ok: health.ok, warnings: health.warnings.length, errors: health.errors.length },
}, null, 2));
