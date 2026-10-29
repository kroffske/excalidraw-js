/** Node-only peer discovery and deployment preparation. Never imported by the browser entry. */
import { constants } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { validateAvoidWasm } from './engines-core.js';
import type { PreparedAvoidWasm } from './engines-core.js';
import { LAYOUT_ENGINE_VERSIONS } from './runtime-types.js';

const require = createRequire(import.meta.url);
type PeerName = keyof typeof LAYOUT_ENGINE_VERSIONS;
interface InstalledPeer { root: string; version: string }
const assetNames = Object.freeze(['libavoid.wasm', 'libavoid-js-LICENSE.txt', 'wasm-graphviz-LICENSE.txt'] as const);

async function installedPeers(): Promise<Record<PeerName, InstalledPeer>> {
  const peers = {} as Record<PeerName, InstalledPeer>;
  for (const name of Object.keys(LAYOUT_ENGINE_VERSIONS) as PeerName[]) {
    // The pinned peers export dist entries but intentionally hide package.json and the WASM subpath.
    const entry = await realpath(require.resolve(name));
    const root = dirname(dirname(entry));
    const manifest: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || !('name' in manifest) || !('version' in manifest)
      || manifest.name !== name || typeof manifest.version !== 'string'
      || manifest.version !== LAYOUT_ENGINE_VERSIONS[name]) {
      throw new Error(`Unsupported layout peer ${name}; expected version ${LAYOUT_ENGINE_VERSIONS[name]}.`);
    }
    peers[name] = { root, version: manifest.version };
  }
  return peers;
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** Copy the installed peer's WASM and both license notices to a NEW dedicated deployment directory. */
export async function prepareLayoutAssets(destination: string): Promise<{
  destination: string;
  peers: Record<PeerName, InstalledPeer>;
  assets: string[];
}> {
  if (typeof destination !== 'string' || destination.trim() === '') throw new TypeError('A new dedicated output directory is required.');
  const requested = resolve(destination);
  if (requested === parse(requested).root) throw new Error('A new dedicated output directory is required.');
  const target = join(await realpath(dirname(requested)), basename(requested));
  const peers = await installedPeers();
  for (const peer of Object.values(peers)) {
    if (contains(peer.root, target) || contains(target, peer.root)) throw new Error('The output directory must not overlap an installed layout peer.');
  }
  // Resolve and read all inputs before creating output. No partial deployment for missing inputs.
  const files = await Promise.all([
    readFile(join(peers['libavoid-js'].root, 'dist/libavoid.wasm')),
    readFile(join(peers['libavoid-js'].root, 'LICENSE')),
    readFile(join(peers['@hpcc-js/wasm-graphviz'].root, 'LICENSE')),
  ]);
  await validateAvoidWasm(files[0]);
  if (!files[1].length || !files[2].length) throw new Error('Both upstream license notices are required.');
  await mkdir(target); // Exclusive: existing directories/files/symlinks are refused before writes.
  try {
    for (let index = 0; index < assetNames.length; index += 1) {
      await writeFile(join(target, assetNames[index]), files[index], { flag: 'wx', mode: constants.S_IRUSR | constants.S_IWUSR | constants.S_IRGRP | constants.S_IROTH });
    }
  } catch (cause) {
    // This invocation exclusively created this directory and owns only these new files.
    await rm(target, { recursive: true, force: true });
    throw cause;
  }
  return { destination: target, peers, assets: [...assetNames] };
}

/** Internal Node platform boundary. Snapshot validated bytes so the peer cannot reread changed input. */
export async function prepareNodeAvoidWasm(source?: string): Promise<PreparedAvoidWasm> {
  const peers = await installedPeers();
  const bytes = await readFile(source ?? join(peers['libavoid-js'].root, 'dist/libavoid.wasm'));
  await validateAvoidWasm(bytes);
  const directory = await mkdtemp(join(tmpdir(), 'excalidraw-layout-runtime-'));
  try {
    const url = join(directory, 'libavoid.wasm');
    await writeFile(url, bytes, { flag: 'wx', mode: 0o600 });
    return { url, release: () => rm(directory, { recursive: true, force: true }) };
  } catch (cause) {
    await rm(directory, { recursive: true, force: true });
    throw cause;
  }
}
