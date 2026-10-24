// Stage 0 feasibility only. No engine is imported until this function is called.
let pending;

export function createLayoutRuntime({ avoidWasmUrl } = {}) {
  if (!pending) {
    pending = Promise.all([
      import('@hpcc-js/wasm-graphviz'),
      import('libavoid-js'),
    ]).then(async ([{ Graphviz }, { AvoidLib }]) => {
      const [graphviz] = await Promise.all([
        Graphviz.load(),
        AvoidLib.load(avoidWasmUrl),
      ]);
      return Object.freeze({ graphviz, Avoid: AvoidLib.getInstance() });
    }).catch(cause => {
      pending = undefined;
      throw new Error('Stage 0 layout engine initialization failed', {
        cause,
      });
    });
  }
  return pending;
}
