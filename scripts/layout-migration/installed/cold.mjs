const effects = { fetches: [], wasmCalls: [] };
globalThis.fetch = (...args) => {
  effects.fetches.push(String(args[0]));
  throw new Error('Engine-free installed geometry fetched a resource');
};
for (const name of ['compile', 'compileStreaming', 'instantiate', 'instantiateStreaming']) {
  WebAssembly[name] = () => {
    effects.wasmCalls.push(name);
    throw new Error(`Engine-free installed geometry initialized WebAssembly: ${name}`);
  };
}
const { layoutGraph, layoutComponent, layoutSequence } = await import('@kroffske/excalidraw-diagrams/graph-layout');
const { coldChecks, requireValue } = await import('./cases.mjs');

const checks = coldChecks(layoutGraph, layoutComponent, layoutSequence);
requireValue(effects.fetches.length === 0 && effects.wasmCalls.length === 0,
  'Engine-free installed geometry acquired a runtime');
console.log(JSON.stringify({ status: 'passed', checks, effects }));
