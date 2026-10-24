import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareLayoutAssets, prepareNodeAvoidWasm } from '../src/graph-layout/prepare-assets.js';
import { LAYOUT_ENGINE_VERSIONS } from '../src/graph-layout/runtime-types.js';

const require = createRequire(import.meta.url);
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('Node installed layout asset preparation', () => {
  it('copies actual installed WASM and complete upstream license notices exactly once', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'graph-layout-assets-test-'));
    temporary.push(directory);
    const target = join(directory, 'layout-runtime');
    const result = await prepareLayoutAssets(target);
    expect(result.destination).toBe(await realpath(target));
    expect(await readdir(target)).toEqual([...result.assets].sort());
    for (const [name, expected] of Object.entries(LAYOUT_ENGINE_VERSIONS)) {
      expect(result.peers[name as keyof typeof LAYOUT_ENGINE_VERSIONS].version).toBe(expected);
    }
    const avoidRoot = dirname(dirname(require.resolve('libavoid-js')));
    const graphvizRoot = dirname(dirname(require.resolve('@hpcc-js/wasm-graphviz')));
    expect(await readFile(join(target, 'libavoid.wasm'))).toEqual(await readFile(join(avoidRoot, 'dist/libavoid.wasm')));
    expect(await readFile(join(target, 'libavoid-js-LICENSE.txt'), 'utf8')).toBe(await readFile(join(avoidRoot, 'LICENSE'), 'utf8'));
    expect(await readFile(join(target, 'wasm-graphviz-LICENSE.txt'), 'utf8')).toBe(await readFile(join(graphvizRoot, 'LICENSE'), 'utf8'));
    await writeFile(join(target, 'sentinel.txt'), 'preserve');
    await expect(prepareLayoutAssets(target)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(join(target, 'sentinel.txt'), 'utf8')).toBe('preserve');
  });

  it('refuses roots, empty paths, files, symlinks, and overlap with peer inputs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'graph-layout-assets-refusal-'));
    temporary.push(directory);
    for (const path of ['', ' ', parse(resolve(directory)).root]) await expect(prepareLayoutAssets(path)).rejects.toThrow(/dedicated/);
    const file = join(directory, 'existing-file');
    await writeFile(file, 'preserve');
    await expect(prepareLayoutAssets(file)).rejects.toMatchObject({ code: 'EEXIST' });
    const link = join(directory, 'existing-link');
    await symlink(file, link);
    await expect(prepareLayoutAssets(link)).rejects.toMatchObject({ code: 'EEXIST' });
    const avoidRoot = dirname(dirname(require.resolve('libavoid-js')));
    await expect(prepareLayoutAssets(join(avoidRoot, 'new-runtime-directory'))).rejects.toThrow(/overlap/);
    expect(await readFile(file, 'utf8')).toBe('preserve');
  });

  it('keeps the private deployment inventory independent of mutable returned results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'graph-layout-assets-inventory-'));
    temporary.push(directory);
    const first = await prepareLayoutAssets(join(directory, 'first'));
    first.assets.pop();
    first.assets.splice(0, first.assets.length, 'caller-owned-name');
    const target = join(directory, 'second');
    const second = await prepareLayoutAssets(target);
    expect(second.assets).toEqual(['libavoid.wasm', 'libavoid-js-LICENSE.txt', 'wasm-graphviz-LICENSE.txt']);
    expect(await readdir(target)).toEqual([...second.assets].sort());
    for (const [name, output] of [['libavoid-js', 'libavoid-js-LICENSE.txt'], ['@hpcc-js/wasm-graphviz', 'wasm-graphviz-LICENSE.txt']]) {
      const peerRoot = dirname(dirname(require.resolve(name)));
      expect(await readFile(join(target, output), 'utf8')).toBe(await readFile(join(peerRoot, 'LICENSE'), 'utf8'));
    }
  });

  it('owns and removes the validated Node snapshot without modifying its source', async () => {
    const prepared = await prepareNodeAvoidWasm();
    const bytes = await readFile(prepared.url);
    expect([...bytes.subarray(0, 4)]).toEqual([0, 97, 115, 109]);
    await prepared.release();
    await expect(readFile(prepared.url)).rejects.toMatchObject({ code: 'ENOENT' });
    const avoidRoot = dirname(dirname(require.resolve('libavoid-js')));
    expect(await readFile(join(avoidRoot, 'dist/libavoid.wasm'))).toEqual(bytes);
  });
});
