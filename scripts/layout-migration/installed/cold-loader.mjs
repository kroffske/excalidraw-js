import { appendFileSync } from 'node:fs';

export async function resolve(specifier, context, nextResolve) {
  appendFileSync(process.env.LAYOUT_ACCEPTANCE_RESOLUTIONS, JSON.stringify({ specifier, parentURL: context.parentURL }) + '\n');
  if (/^(@hpcc-js\/wasm-graphviz|libavoid-js)(\/|$)/.test(specifier)
    || (context.parentURL?.includes('/dist/graph-layout/') && specifier.startsWith('node:'))) {
    throw new Error(`Cold graph-layout import acquired an engine or Node builtin: ${specifier}`);
  }
  const result = await nextResolve(specifier, context);
  if (/\/dist\/graph-layout\/engines(?:-core|-node)?\.js$/.test(result.url)) {
    throw new Error(`Cold graph-layout import acquired an engine entry point: ${result.url}`);
  }
  return result;
}
