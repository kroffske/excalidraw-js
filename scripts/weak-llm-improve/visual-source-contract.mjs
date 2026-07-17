import { extractSource } from "./source-contract.mjs";
import { assertRestrictedVisualAst } from "./safe-source-ast.mjs";

export const VISUAL_HELPERS = Object.freeze([
  "arrayStrip",
  "candle",
  "candlestickChart",
  "card",
  "classScores",
  "link",
  "stepStrip",
  "uiWindow",
]);

export { extractSource };

export function validateVisualSourceShape(source, options = {}) {
  const suffix = options.scenarioSlug ? ` for ${options.scenarioSlug}` : "";
  try { assertRestrictedVisualAst(source, VISUAL_HELPERS); }
  catch (error) { throw new Error(`Generated source violates restricted visual contract${suffix}: ${error.message}`); }
}
