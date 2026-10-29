import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayoutRuntime as createBrowserRuntime } from '../src/graph-layout/engines.js';
import { createLayoutRuntime } from '../src/graph-layout/engines-node.js';
import { initializeLayoutRuntime } from '../src/graph-layout/engines-core.js';
import { prepareNodeAvoidWasm } from '../src/graph-layout/prepare-assets.js';
import { LAYOUT_ENGINE_VERSIONS, type AvoidOwned } from '../src/graph-layout/runtime-types.js';

const temporary: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('explicit optional layout runtime', () => {
  it('requires a local browser deployment URL before acquiring resources', async () => {
    await expect(createBrowserRuntime()).rejects.toMatchObject({ code: 'LAYOUT_WASM_URL_REQUIRED' });
    vi.stubGlobal('location', new URL('https://app.example.test/page'));
    for (const url of ['https://cdn.example.test/libavoid.wasm', 'file:///local/libavoid.wasm', 'data:application/wasm,AA==']) {
      await expect(createBrowserRuntime({ avoidWasmUrl: url })).rejects.toMatchObject({ code: 'LAYOUT_WASM_URL_INVALID' });
    }
  });

  it('rejects real missing/invalid HTTP resources before calling the unsafe upstream loader', async () => {
    const requested: string[] = [];
    const server = createServer((request, response) => {
      requested.push(request.url ?? '');
      response.writeHead(request.url === '/missing.wasm' ? 404 : 200, { 'content-type': 'application/wasm' });
      response.end(request.url === '/missing.wasm' ? 'Not found' : 'not a WASM module');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP address.');
    vi.stubGlobal('location', new URL(`http://127.0.0.1:${address.port}/`));
    try {
      await expect(createBrowserRuntime({ avoidWasmUrl: '/missing.wasm' })).rejects.toMatchObject({ code: 'LAYOUT_WASM_UNAVAILABLE' });
      await expect(createBrowserRuntime({ avoidWasmUrl: '/invalid.wasm' })).rejects.toMatchObject({ code: 'LAYOUT_WASM_INVALID' });
      expect(requested).toEqual(['/missing.wasm', '/invalid.wasm']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('recovers resource and post-load cleanup failures without reloading ready peers, then computes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'graph-layout-runtime-test-'));
    temporary.push(directory);
    const missing = join(directory, 'missing.wasm');
    await expect(createLayoutRuntime({ avoidWasmUrl: missing })).rejects.toMatchObject({
      code: 'LAYOUT_RUNTIME_INITIALIZATION_FAILED', cause: { code: 'ENOENT' },
    });
    const invalid = join(directory, 'invalid.wasm');
    await writeFile(invalid, 'not a WASM module');
    await expect(createLayoutRuntime({ avoidWasmUrl: invalid })).rejects.toMatchObject({ code: 'LAYOUT_WASM_INVALID' });
    const malformed = join(directory, 'malformed.wasm');
    await writeFile(malformed, new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1]));
    await expect(createLayoutRuntime({ avoidWasmUrl: malformed })).rejects.toMatchObject({
      code: 'LAYOUT_WASM_INVALID', cause: { name: 'CompileError' },
    });
    const unrelated = join(directory, 'empty-module.wasm');
    await writeFile(unrelated, new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    await expect(createLayoutRuntime({ avoidWasmUrl: unrelated })).rejects.toMatchObject({ code: 'LAYOUT_WASM_INVALID' });
    const { Graphviz } = await import('@hpcc-js/wasm-graphviz');
    const { AvoidLib } = await import('libavoid-js');
    const graphvizLoad = vi.spyOn(Graphviz, 'load');
    const avoidLoad = vi.spyOn(AvoidLib, 'load');
    const originalCleanupFailure = new Error('Injected first snapshot removal failure');
    const laterCleanupFailure = new Error('Injected later snapshot removal failure');
    let releaseSecondAttempt!: () => void;
    const secondAttempt = new Promise<void>(resolve => { releaseSecondAttempt = resolve; });
    let cleanupAttempts = 0;
    let snapshot = '';
    // Inject only the real platform resource release boundary, after both pinned engines load.
    const prepare = vi.fn(async () => {
      const prepared = await prepareNodeAvoidWasm();
      snapshot = prepared.url;
      temporary.push(dirname(snapshot));
      return { url: prepared.url, async release() {
        cleanupAttempts += 1;
        if (cleanupAttempts === 1) throw originalCleanupFailure;
        if (cleanupAttempts === 2) {
          await secondAttempt;
          throw laterCleanupFailure;
        }
        await prepared.release();
      } };
    });
    const pending = initializeLayoutRuntime(`installed:libavoid-js@${LAYOUT_ENGINE_VERSIONS['libavoid-js']}`, prepare);
    expect(createLayoutRuntime()).toBe(pending);
    await expect(createLayoutRuntime({ avoidWasmUrl: missing })).rejects.toMatchObject({ code: 'LAYOUT_RUNTIME_CONFLICT' });
    await expect(pending).rejects.toMatchObject({ code: 'LAYOUT_RUNTIME_CLEANUP_FAILED', cause: originalCleanupFailure });
    const initializedGraphviz = await graphvizLoad.mock.results[0].value;
    const initializedAvoid = AvoidLib.getInstance();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(graphvizLoad).toHaveBeenCalledTimes(1);
    expect(avoidLoad).toHaveBeenCalledTimes(1);
    expect(cleanupAttempts).toBe(1);
    expect((await readFile(snapshot)).length).toBeGreaterThan(0);
    await expect(createLayoutRuntime({ avoidWasmUrl: invalid })).rejects.toMatchObject({ code: 'LAYOUT_RUNTIME_CONFLICT' });
    const cleanupRetry = createLayoutRuntime();
    expect(createLayoutRuntime()).toBe(cleanupRetry);
    expect(cleanupAttempts).toBe(2);
    const failure = expect(cleanupRetry).rejects.toMatchObject({ code: 'LAYOUT_RUNTIME_CLEANUP_FAILED',
      cause: { cause: originalCleanupFailure, errors: [originalCleanupFailure, laterCleanupFailure] } });
    releaseSecondAttempt();
    await failure;
    const runtime = await createLayoutRuntime();
    expect(cleanupAttempts).toBe(3);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(graphvizLoad).toHaveBeenCalledTimes(1);
    expect(avoidLoad).toHaveBeenCalledTimes(1);
    expect(runtime.graphviz).toBe(initializedGraphviz);
    expect(runtime.Avoid).toBe(initializedAvoid);
    await expect(readFile(snapshot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(await createLayoutRuntime()).toBe(runtime);
    const graph = JSON.parse(runtime.graphviz.layout('digraph { rankdir=LR; a -> b; }', 'json', 'dot'));
    expect(graph.objects.map((node: { name: string }) => node.name)).toEqual(['a', 'b']);
    expect(Number(graph.objects[0].pos.split(',')[0])).toBeLessThan(Number(graph.objects[1].pos.split(',')[0]));
    expect(runtime.graphviz.version()).toMatch(/\d+\.\d+/);
    const A = runtime.Avoid;
    const router = new A.Router(A.RouterFlag.OrthogonalRouting.value);
    const owned: AvoidOwned[] = [];
    try {
      const start = new A.Point(0, 0), end = new A.Point(300, 0);
      owned.push(start, end);
      const source = new A.ConnEnd(start), target = new A.ConnEnd(end);
      owned.push(source, target);
      const connector = new A.ConnRef(router, source, target);
      connector.setRoutingType(A.ConnType.ConnType_Orthogonal.value);
      router.processTransaction();
      const route = connector.displayRoute();
      expect(route.size()).toBeGreaterThanOrEqual(2);
      expect([route.at(0).x, route.at(0).y]).toEqual([0, 0]);
      expect([route.at(route.size() - 1).x, route.at(route.size() - 1).y]).toEqual([300, 0]);
    } finally {
      router.delete();
      for (const value of owned.reverse()) value.delete();
    }
    await expect(createLayoutRuntime({ avoidWasmUrl: invalid })).rejects.toMatchObject({ code: 'LAYOUT_RUNTIME_CONFLICT' });
  });
});
