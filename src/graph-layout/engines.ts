import { initializeLayoutRuntime, LayoutRuntimeError, validateAvoidWasm } from './engines-core.js';
import type { CreateLayoutRuntimeOptions } from './engines-core.js';
import type { LayoutRuntime } from './runtime-types.js';

export { LayoutRuntimeError } from './engines-core.js';
export type { CreateLayoutRuntimeOptions } from './engines-core.js';
export type { LayoutRuntime } from './runtime-types.js';

/** Browser entry. Engine peers and WASM are acquired only after this explicit call. */
export function createLayoutRuntime(options: CreateLayoutRuntimeOptions = {}): Promise<LayoutRuntime> {
  let source: URL;
  try {
    if (!options.avoidWasmUrl) throw new LayoutRuntimeError('LAYOUT_WASM_URL_REQUIRED',
      'Browser layout requires an explicit same-origin WASM URL from prepareLayoutAssets.');
    source = new URL(String(options.avoidWasmUrl), globalThis.location?.href);
    if (!['http:', 'https:'].includes(source.protocol) || !globalThis.location
      || source.origin !== globalThis.location.origin || source.username || source.password) {
      throw new LayoutRuntimeError('LAYOUT_WASM_URL_INVALID',
        'The browser WASM URL must use HTTP(S) on the current origin.');
    }
  } catch (cause) {
    return Promise.reject(cause instanceof LayoutRuntimeError ? cause
      : new LayoutRuntimeError('LAYOUT_WASM_URL_INVALID', 'The browser WASM URL is invalid.', { cause }));
  }
  return initializeLayoutRuntime(source.href, async () => {
    const response = await fetch(source, { credentials: 'same-origin', redirect: 'error' });
    if (!response.ok) throw new LayoutRuntimeError('LAYOUT_WASM_UNAVAILABLE',
      `The libavoid WASM request failed with HTTP ${response.status}: ${source.href}`);
    const bytes = await response.arrayBuffer();
    await validateAvoidWasm(new Uint8Array(bytes));
    // One HTTP acquisition; the generated loader reads the validated snapshot.
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
    return { url, release: () => URL.revokeObjectURL(url) };
  });
}
