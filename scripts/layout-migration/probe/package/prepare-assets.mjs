// Node-only deployment preparation. No browser consumer repeats peer internals.
import { createRequire } from 'node:module';
import { dirname, join, resolve, parse } from 'node:path';
import { cp, mkdir, readFile, realpath } from 'node:fs/promises';

const require = createRequire(import.meta.url);

export async function prepareLayoutAssets(destination) {
  const target = resolve(destination);
  if (target === parse(target).root) throw new Error('A dedicated output directory is required');
  const versions = { '@hpcc-js/wasm-graphviz': '1.29.2', 'libavoid-js': '0.5.0-beta.5' };
  const peers = {};
  for (const [name, expected] of Object.entries(versions)) {
    // Both pinned packages expose their main file under dist/. Their export maps
    // intentionally forbid resolving package.json or the WASM as subpath imports.
    const entry = await realpath(require.resolve(name));
    const root = dirname(dirname(entry));
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (manifest.name !== name || manifest.version !== expected) {
      throw new Error(`Unsupported stage 0 peer: ${name} ${manifest.version}; expected ${expected}`);
    }
    peers[name] = { root, entry, version: manifest.version };
  }
  // Exclusive creation refuses an existing destination before copying anything.
  await mkdir(target);
  await cp(join(peers['libavoid-js'].root, 'dist/libavoid.wasm'), join(target, 'libavoid.wasm'));
  await cp(join(peers['libavoid-js'].root, 'LICENSE'), join(target, 'libavoid-js-LICENSE.txt'));
  await cp(join(peers['@hpcc-js/wasm-graphviz'].root, 'LICENSE'), join(target, 'wasm-graphviz-LICENSE.txt'));
  return { destination: target, peers, assets: ['libavoid.wasm', 'libavoid-js-LICENSE.txt', 'wasm-graphviz-LICENSE.txt'] };
}
