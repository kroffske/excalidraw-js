import type { AvoidRuntime, LayoutRuntime } from './runtime-types.js';

export interface CreateLayoutRuntimeOptions {
  /** Node: file path/file URL; browser: explicit same-origin HTTP(S) deployment URL. */
  avoidWasmUrl?: string | URL;
}

export class LayoutRuntimeError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LayoutRuntimeError';
  }
}

export interface PreparedAvoidWasm {
  url: string;
  release(): void | Promise<void>;
}

interface AvoidLibrary {
  readonly avoidLib?: unknown;
  load(url: string): Promise<void>;
  getInstance(): unknown;
}

function record(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function avoidLibrary(module: unknown): AvoidLibrary {
  if (!record(module) || !record(module.AvoidLib)
    || typeof module.AvoidLib.load !== 'function' || typeof module.AvoidLib.getInstance !== 'function') {
    throw new TypeError('The libavoid-js peer does not expose the supported AvoidLib API.');
  }
  return module.AvoidLib as unknown as AvoidLibrary;
}

function avoidRuntime(value: unknown): AvoidRuntime {
  if (!record(value) || ['Router', 'Point', 'Rectangle', 'Polygon', 'ShapeRef', 'ShapeConnectionPin', 'ConnEnd', 'ConnRef']
    .some(name => typeof value[name] !== 'function')
    || !record(value.RouterFlag) || !record(value.RouterFlag.OrthogonalRouting)
    || typeof value.RouterFlag.OrthogonalRouting.value !== 'number'
    || !record(value.ConnType) || !record(value.ConnType.ConnType_Orthogonal)
    || typeof value.ConnType.ConnType_Orthogonal.value !== 'number'
    || !record(value.RoutingParameter) || !record(value.RoutingOption)) {
    throw new TypeError('The libavoid-js peer does not expose the supported routing API.');
  }
  // The pinned package's declarations omit its actual embind constructors and enums.
  return value as unknown as AvoidRuntime;
}

let pending: Promise<LayoutRuntime> | undefined;
let selectedSource: string | undefined;
interface ReadyRuntime {
  runtime: LayoutRuntime;
  release?: () => void | Promise<void>;
  cleanupFailure?: { cause: unknown };
}
let ready: ReadyRuntime | undefined;

async function releaseReadyRuntime(state: ReadyRuntime): Promise<LayoutRuntime> {
  if (state.release) {
    try {
      await state.release();
      state.release = undefined;
      state.cleanupFailure = undefined;
    } catch (cause) {
      const original = state.cleanupFailure;
      state.cleanupFailure ??= { cause };
      throw new LayoutRuntimeError('LAYOUT_RUNTIME_CLEANUP_FAILED',
        'Layout engines are ready, but temporary WASM cleanup failed. Retry the same source to finish cleanup.', {
          cause: original && original.cause !== cause
            ? new AggregateError([original.cause, cause], 'Temporary WASM cleanup still fails.', { cause: original.cause })
            : cause,
        });
    }
  }
  return state.runtime;
}

/** One owner for the peer's process/realm-wide singleton; platform preparation performs real I/O. */
export function initializeLayoutRuntime(source: string, prepare: () => Promise<PreparedAvoidWasm>): Promise<LayoutRuntime> {
  if (selectedSource !== undefined && source !== selectedSource) return Promise.reject(new LayoutRuntimeError('LAYOUT_RUNTIME_CONFLICT',
    `The layout runtime is already initializing or initialized with ${selectedSource}. Reuse that source or use a fresh process/page.`));
  if (pending) return pending;
  selectedSource = source;
  pending = (async () => {
    // A cleanup failure does not undo the peers' successful singleton initialization.
    if (ready) return releaseReadyRuntime(ready);
    const [graphvizModule, avoidModule] = await Promise.all([
      import('@hpcc-js/wasm-graphviz'),
      import('libavoid-js') as Promise<unknown>,
    ]);
    const library = avoidLibrary(avoidModule);
    if (library.avoidLib) throw new LayoutRuntimeError('LAYOUT_RUNTIME_CONFLICT',
      'libavoid-js was initialized outside createLayoutRuntime. Use a fresh process/page to select a WASM source.');
    // Complete resource validation before starting either WASM engine.
    const prepared = await prepare();
    try {
      const graphviz = await graphvizModule.Graphviz.load();
      await library.load(prepared.url);
      ready = { runtime: Object.freeze({ graphviz, Avoid: avoidRuntime(library.getInstance()) }),
        release: () => prepared.release() };
    } catch (cause) {
      try {
        await prepared.release();
      } catch (cleanupCause) {
        throw new AggregateError([cause, cleanupCause], 'Layout engine initialization and temporary WASM cleanup failed.', { cause });
      }
      throw cause;
    }
    return releaseReadyRuntime(ready);
  })().catch((cause: unknown) => {
    pending = undefined;
    if (!ready) selectedSource = undefined;
    if (cause instanceof LayoutRuntimeError) throw cause;
    throw new LayoutRuntimeError('LAYOUT_RUNTIME_INITIALIZATION_FAILED',
      'Layout engine initialization failed. Install the exact optional peers and provide a readable prepared WASM asset.', { cause });
  });
  return pending;
}

/** Refuse missing/corrupt resources before entering the pinned Emscripten loader's unsafe failure branch. */
export async function validateAvoidWasm(bytes: Uint8Array): Promise<void> {
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new LayoutRuntimeError('LAYOUT_WASM_INVALID', 'The libavoid asset is not a WebAssembly binary.');
  }
  let module: WebAssembly.Module;
  try {
    module = await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>);
  } catch (cause) {
    throw new LayoutRuntimeError('LAYOUT_WASM_INVALID', 'The libavoid WebAssembly binary could not be compiled.', { cause });
  }
  const exports = new Set(WebAssembly.Module.exports(module).map(item => item.name));
  if (['memory', '__wasm_call_ctors', '__getTypeName', 'malloc', 'free', 'emscripten_stack_init']
    .some(name => !exports.has(name))) {
    throw new LayoutRuntimeError('LAYOUT_WASM_INVALID', 'The WebAssembly binary does not expose the supported libavoid ABI.');
  }
}
