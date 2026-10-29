import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeLayoutRuntime, LayoutRuntimeError } from './engines-core.js';
import type { CreateLayoutRuntimeOptions } from './engines-core.js';
import { prepareNodeAvoidWasm } from './prepare-assets.js';
import type { LayoutRuntime } from './runtime-types.js';

export { LayoutRuntimeError } from './engines-core.js';
export type { CreateLayoutRuntimeOptions } from './engines-core.js';
export type { LayoutRuntime } from './runtime-types.js';

/** Node condition of the engine entry. The default asset comes from the installed pinned peer. */
export function createLayoutRuntime(options: CreateLayoutRuntimeOptions = {}): Promise<LayoutRuntime> {
  let source: string | undefined;
  try {
    const input = options.avoidWasmUrl;
    if (input !== undefined) {
      if (typeof input === 'string' && (input.trim() === ''
        || /^[a-z][a-z\d+.-]*:/i.test(input) && !/^[a-z]:[\\/]/i.test(input) && !input.startsWith('file:'))) {
        throw new TypeError('Expected a filesystem path or file URL.');
      }
      source = input instanceof URL || input.startsWith('file:')
        ? fileURLToPath(input) : resolve(input);
      if (!source) throw new TypeError('An empty WASM path is not supported.');
    }
  } catch (cause) {
    return Promise.reject(new LayoutRuntimeError('LAYOUT_WASM_URL_INVALID',
      'Node layout requires a filesystem path or file URL.', { cause }));
  }
  return initializeLayoutRuntime(source ?? 'installed:libavoid-js@0.5.0-beta.5',
    () => prepareNodeAvoidWasm(source));
}
