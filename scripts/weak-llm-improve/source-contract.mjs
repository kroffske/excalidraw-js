import { assertRestrictedGraphAst } from "./safe-source-ast.mjs";

export function extractSource(raw) {
  const match = raw.match(/```(?:ts|typescript|js|javascript)?\s*\n([\s\S]*?)```/i);
  if (match) {
    return match[1].trim();
  }
  throw new Error("Model response did not contain a fenced TypeScript code block.");
}

export function validateSourceShape(source, options = {}) {
  const suffix = options.scenarioSlug ? ` for ${options.scenarioSlug}` : "";
  try { assertRestrictedGraphAst(source); }
  catch (error) { throw new Error(`Generated source violates restricted graph contract${suffix}: ${error.message}`); }
}
