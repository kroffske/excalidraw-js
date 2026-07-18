import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Scene } from "./core.js";
import type { ElementLike } from "./geometry.js";
import { packageRoot as findPackageRoot } from "./paths.js";
import {
  BUNDLED_ASSET_PACKS,
  catalogSha256,
  parseAssetManifest,
  searchAssetCatalog,
  validateAssetManifestItems,
  validateBundledCatalog,
} from "./asset-catalog.js";
import type {
  AssetCatalogEntry,
  AssetDescriptor,
  AssetManifestItem,
  AssetSearchOptions,
  AssetSearchResult,
  BundledAssetPack,
  ParsedAssetManifest,
} from "./asset-catalog.js";
export {
  ASSET_CATEGORIES,
  ASSET_DOMAINS,
  ASSET_VISUAL_KINDS,
  BUNDLED_ASSET_PACKS,
  catalogSha256,
  codeUnitCompare,
  normalizeAssetSearchText,
  parseAssetManifest,
  searchAssetCatalog,
  validateAssetManifestItems,
  validateBundledCatalog,
} from "./asset-catalog.js";
export type {
  AssetCatalogEntry,
  AssetCategory,
  AssetDescriptor,
  AssetDomain,
  AssetLocalizedTerms,
  AssetLocalizedText,
  AssetManifestItem,
  AssetManifestV2,
  AssetProvenance,
  AssetSearchMatch,
  AssetSearchOptions,
  AssetSearchReason,
  AssetSearchResult,
  AssetSvgReader,
  AssetVisualKind,
  BundledAssetPack,
  ParsedAssetManifest,
} from "./asset-catalog.js";

export const BUNDLED_PACKS = BUNDLED_ASSET_PACKS;
export type BundledPack = BundledAssetPack;

export interface AssetOptions {
  group?: string;
  name?: string;
  code?: string;
  groupIndex?: number | null;
  group_index?: number | null;
  iconIndex?: number | null;
  icon_index?: number | null;
  aliases?: string[];
}

export class Asset {
  readonly id: string;
  readonly filename: string;
  readonly data: Buffer;
  readonly group: string;
  readonly name: string;
  readonly code: string;
  readonly groupIndex: number | null;
  readonly iconIndex: number | null;
  readonly aliases: string[];

  constructor(id: string, filename: string, data: Buffer | Uint8Array, options: AssetOptions = {}) {
    this.id = id;
    this.filename = filename;
    this.data = Buffer.from(data);
    this.group = options.group ?? "";
    this.name = options.name ?? "";
    this.code = options.code ?? "";
    this.groupIndex = options.groupIndex ?? options.group_index ?? null;
    this.iconIndex = options.iconIndex ?? options.icon_index ?? null;
    this.aliases = options.aliases ?? [];
  }

  get group_index(): number | null {
    return this.groupIndex;
  }

  get icon_index(): number | null {
    return this.iconIndex;
  }
}

export interface AssetRegistryOptions {
  aliases?: Record<string, string>;
  order?: string[];
}

export class AssetRegistry {
  private readonly assets: Map<string, Asset>;
  private readonly aliases: Map<string, string>;
  private readonly order: string[];

  constructor(assets: Record<string, Asset> | Map<string, Asset> = {}, options: AssetRegistryOptions = {}) {
    this.assets = assets instanceof Map ? new Map(assets) : new Map(Object.entries(assets));
    this.aliases = new Map(Object.entries(options.aliases ?? {}));
    this.order = options.order ?? Array.from(this.assets.keys()).sort();
  }

  static bundled(pack: BundledPack = "core"): AssetRegistry {
    assertPack(pack);
    const root = join(packageDataRoot(), "assets", pack);
    const manifest = parseAssetManifest(
      JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")),
      pack,
    );
    return AssetRegistry.fromItems(manifest.assets, join(root, "svg"));
  }

  static fromManifest(path: string, svgDir: string | null = null): AssetRegistry {
    const manifestPath = resolve(path);
    const root = svgDir ? resolve(svgDir) : join(dirname(manifestPath), "svg");
    const manifest = parseAssetManifest(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
    return AssetRegistry.fromItems(manifest.assets, root);
  }

  static from_manifest(path: string, svgDir: string | null = null): AssetRegistry {
    return AssetRegistry.fromManifest(path, svgDir);
  }

  static fromDirectory(path: string, pattern = "*.svg"): AssetRegistry {
    const root = resolve(path);
    const registry = new AssetRegistry();
    const suffix = pattern.startsWith("*.") ? pattern.slice(1) : ".svg";
    for (const filename of readdirSync(root).filter((name) => name.endsWith(suffix)).sort()) {
      registry.register(filename.replace(/\.svg$/i, ""), join(root, filename));
    }
    return registry;
  }

  static from_directory(path: string, pattern = "*.svg"): AssetRegistry {
    return AssetRegistry.fromDirectory(path, pattern);
  }

  static fromItems(items: readonly AssetManifestItem[], root: string): AssetRegistry {
    validateAssetManifestItems(items, "registry manifest");
    const assets: Record<string, Asset> = {};
    const aliases: Record<string, string> = {};
    const order: string[] = [];

    for (const item of items) {
      const asset = new Asset(item.id, item.filename, readFileSync(join(root, item.filename)), {
        group: item.group ?? "",
        name: item.name ?? item.id,
        code: item.code ?? "",
        groupIndex: item.group_index ?? null,
        iconIndex: item.icon_index ?? null,
        aliases: item.aliases ?? [],
      });
      assets[asset.id] = asset;
      order.push(asset.id);
      for (const alias of assetAliases(asset)) {
        aliases[alias] ??= asset.id;
      }
    }

    return new AssetRegistry(assets, { aliases, order });
  }

  register(assetId: string, path: string): void {
    const filename = path.split(/[\\/]/).at(-1) ?? assetId;
    this.assets.set(assetId, new Asset(assetId, filename, readFileSync(path)));
    if (!this.order.includes(assetId)) {
      this.order.push(assetId);
    }
  }

  resolve(assetId: string): Asset {
    const resolvedId = this.aliases.get(assetId) ?? assetId;
    const asset = this.assets.get(resolvedId);
    if (!asset) {
      const known = this.ids().join(", ");
      const knownAliases = Array.from(this.aliases.keys()).sort().join(", ");
      let message = `Unknown asset id '${assetId}'. Known ids: ${known}`;
      if (knownAliases) {
        message += `. Known aliases/codes: ${knownAliases}`;
      }
      throw new Error(message);
    }
    return asset;
  }

  resolveGroup(group: string, name: string): Asset {
    return this.resolve(`${slug(group)}:${slug(name)}`);
  }

  resolve_group(group: string, name: string): Asset {
    return this.resolveGroup(group, name);
  }

  resolveIndex(groupIndex: number, iconIndex: number): Asset {
    return this.resolve(`${String(groupIndex).padStart(2, "0")}-${String(iconIndex).padStart(2, "0")}`);
  }

  resolve_index(groupIndex: number, iconIndex: number): Asset {
    return this.resolveIndex(groupIndex, iconIndex);
  }

  idForGroup(group: string, name: string): string {
    return this.resolveGroup(group, name).id;
  }

  id_for_group(group: string, name: string): string {
    return this.idForGroup(group, name);
  }

  idForIndex(groupIndex: number, iconIndex: number): string {
    return this.resolveIndex(groupIndex, iconIndex).id;
  }

  id_for_index(groupIndex: number, iconIndex: number): string {
    return this.idForIndex(groupIndex, iconIndex);
  }

  ids(): string[] {
    return [...this.order];
  }

  list(): string[] {
    return this.ids();
  }

  groups(): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    for (const assetId of this.order) {
      const asset = this.assets.get(assetId);
      if (!asset) {
        continue;
      }
      grouped[asset.group] ??= [];
      grouped[asset.group].push(asset.id);
    }
    return grouped;
  }

  items(): Asset[] {
    return this.order.map((assetId) => this.assets.get(assetId)).filter((asset): asset is Asset => Boolean(asset));
  }

  describe(assetId: string): Record<string, unknown> {
    return assetDict(this.resolve(assetId));
  }
}

export function place(scene: Scene, iconId: string, x: number, y: number, size = 64, options: { registry?: AssetRegistry | null } = {}): ElementLike {
  return scene.placeAsset(iconId, x, y, size, options);
}

export function placeRect(
  scene: Scene,
  iconId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { registry?: AssetRegistry | null } = {},
): ElementLike {
  return scene.placeAssetRect(iconId, x, y, w, h, options);
}

export const place_rect = placeRect;

export function bundledManifest(pack: BundledPack = "core"): AssetManifestItem[] {
  assertPack(pack);
  const manifest = readBundledManifest(pack);
  return manifest.assets.map(legacyManifestItem);
}

export function searchAssets(
  query: string,
  options: AssetSearchOptions = {},
): AssetSearchResult[] {
  const catalog = bundledCatalog();
  return searchAssetCatalog(query, catalog.entries, catalog.digest, options);
}

export function getAssetDescriptor(
  pack: BundledPack,
  id: string,
): AssetDescriptor {
  assertPack(pack);
  const descriptor = bundledCatalog().byPack[pack].get(id);
  if (!descriptor) {
    throw new Error(`Unknown asset descriptor '${pack}:${id}'.`);
  }
  return structuredClone(descriptor);
}

export function exportBundledAssets(target: string, pack: BundledPack = "core"): string {
  assertPack(pack);
  const destination = resolve(target);
  const root = join(packageDataRoot(), "assets", pack);
  mkdirSync(destination, { recursive: true });

  for (const filename of ["manifest.json", "manifest.csv"]) {
    copyFileSync(join(root, filename), join(destination, filename));
  }
  copyFileSync(
    join(packageDataRoot(), "assets", "PROVENANCE.md"),
    join(destination, "PROVENANCE.md"),
  );

  const svgDestination = join(destination, "svg");
  if (existsSync(svgDestination)) {
    rmSync(svgDestination, { recursive: true, force: true });
  }
  mkdirSync(svgDestination, { recursive: true });
  for (const filename of readdirSync(join(root, "svg"))) {
    if (filename.endsWith(".svg")) {
      copyFileSync(join(root, "svg", filename), join(svgDestination, filename));
    }
  }
  return destination;
}

export const bundled_manifest = bundledManifest;
export const export_bundled_assets = exportBundledAssets;

interface LoadedBundledCatalog {
  entries: AssetCatalogEntry[];
  byPack: Record<BundledPack, Map<string, AssetDescriptor>>;
  digest: string;
}

let loadedBundledCatalog: LoadedBundledCatalog | null = null;

function readBundledManifest(pack: BundledPack): ParsedAssetManifest {
  return parseAssetManifest(
    JSON.parse(
      readFileSync(
        join(packageDataRoot(), "assets", pack, "manifest.json"),
        "utf8",
      ),
    ),
    pack,
  );
}

function bundledCatalog(): LoadedBundledCatalog {
  if (loadedBundledCatalog) {
    return loadedBundledCatalog;
  }
  const manifests = Object.fromEntries(
    BUNDLED_ASSET_PACKS.map((pack) => [pack, readBundledManifest(pack)]),
  ) as Record<BundledAssetPack, ParsedAssetManifest>;
  const descriptors = validateBundledCatalog(manifests);
  const byPack = {
    core: new Map<string, AssetDescriptor>(),
    trading: new Map<string, AssetDescriptor>(),
  };
  const entries: AssetCatalogEntry[] = [];
  let offset = 0;
  for (const pack of BUNDLED_PACKS) {
    const count = manifests[pack].assets.length;
    for (const descriptor of descriptors.slice(offset, offset + count)) {
      byPack[pack].set(descriptor.id, descriptor);
      entries.push({ pack, descriptor });
    }
    offset += count;
  }
  loadedBundledCatalog = {
    entries,
    byPack,
    digest: catalogSha256(descriptors),
  };
  return loadedBundledCatalog;
}

function legacyManifestItem(item: AssetManifestItem): AssetManifestItem {
  return {
    id: item.id,
    group: item.group,
    name: item.name,
    code: item.code,
    group_index: item.group_index,
    icon_index: item.icon_index,
    filename: item.filename,
    viewBox: item.viewBox,
    aliases: item.aliases ? [...item.aliases] : [],
    colors: item.colors ? [...item.colors] : [],
  };
}

export function assetsMain(argv = process.argv.slice(2)): number {
  try {
    const args = parseAssetsArgs(argv);
    if (args.help || !args.command) {
      printAssetsUsage();
      return args.command ? 0 : 2;
    }
    if (args.command === "packs") {
      print(args.json ? JSON.stringify(BUNDLED_PACKS) : BUNDLED_PACKS.join("\n"));
      return 0;
    }

    if (args.command === "search") {
      const results = searchAssets(args.query ?? "", {
        packs: args.searchPacks,
        limit: args.limit,
      });
      const projected = results.map((result) => ({
        result,
        descriptor: getAssetDescriptor(result.pack, result.id),
      }));
      if (args.json) {
        print(JSON.stringify(projected, null, 2));
      } else if (projected.length === 0) {
        print("No matching assets.");
      } else {
        print(formatSearchResults(projected, args.language));
      }
      return 0;
    }

    const registry = AssetRegistry.bundled(args.pack);
    if (args.command === "groups") {
      const groups = registry.groups();
      if (args.json) {
        print(JSON.stringify(groups, null, 2));
      } else {
        print(Object.entries(groups).map(([group, ids]) => `${group}: ${ids.length}`).join("\n"));
      }
      return 0;
    }

    if (args.command === "list") {
      let assets = registry.items();
      if (args.group) {
        const group = slug(args.group);
        assets = assets.filter((asset) => asset.group === group);
      }
      print(args.json ? JSON.stringify(assets.map(assetDict), null, 2) : assets.map((asset) => asset.id).join("\n"));
      return 0;
    }

    if (args.command === "show") {
      if (!args.assetId) {
        throw new Error("show requires an asset id");
      }
      print(JSON.stringify(registry.describe(args.assetId), null, 2));
      return 0;
    }

    if (args.command === "export") {
      if (!args.target) {
        throw new Error("export requires a target directory");
      }
      print(exportBundledAssets(args.target, args.pack));
      return 0;
    }

    printAssetsUsage();
    return 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

interface ParsedAssetsArgs {
  pack: BundledPack;
  searchPacks: readonly BundledPack[] | "all";
  json: boolean;
  group: string | null;
  command: string | null;
  assetId: string | null;
  target: string | null;
  query: string | null;
  limit: number | undefined;
  language: "en" | "ru";
  help: boolean;
}

function parseAssetsArgs(argv: string[]): ParsedAssetsArgs {
  let json = false;
  let group: string | null = null;
  let help = false;
  let limit: number | undefined;
  let language: "en" | "ru" = "en";
  const packValues: string[] = [];
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--pack") {
      packValues.push(requiredOptionValue(argv, ++index, "--pack"));
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--group") {
      group = requiredOptionValue(argv, ++index, "--group");
    } else if (arg === "--limit") {
      const raw = requiredOptionValue(argv, ++index, "--limit");
      limit = Number(raw);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error("--limit must be a positive integer");
      }
    } else if (arg === "--lang") {
      const raw = requiredOptionValue(argv, ++index, "--lang");
      if (raw !== "en" && raw !== "ru") {
        throw new Error("--lang must be 'en' or 'ru'");
      }
      language = raw;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option '${arg}'`);
    } else {
      positional.push(arg);
    }
  }

  const command = positional[0] ?? null;
  if (command === "search") {
    if (group !== null) {
      throw new Error("--group is not valid for search");
    }
    const searchPacks = parseSearchPacks(packValues);
    return {
      pack: "core",
      searchPacks,
      json,
      group: null,
      command,
      assetId: null,
      target: null,
      query: positional.slice(1).join(" "),
      limit,
      language,
      help,
    };
  }
  if (limit !== undefined || language !== "en") {
    throw new Error("--limit and --lang are valid only for search");
  }
  if (packValues.length > 1) {
    throw new Error("Existing asset commands accept exactly one --pack");
  }
  const pack = packValues.length === 0 ? "core" : parsePack(packValues[0]);
  return {
    pack,
    searchPacks: "all",
    json,
    group,
    command,
    assetId: command === "show" ? positional[1] ?? null : null,
    target: command === "export" ? positional[1] ?? null : null,
    query: null,
    limit: undefined,
    language,
    help,
  };
}

function requiredOptionValue(
  argv: readonly string[],
  index: number,
  option: string,
): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseSearchPacks(values: readonly string[]): readonly BundledPack[] | "all" {
  if (values.length === 0) {
    return "all";
  }
  if (values.includes("all")) {
    if (values.length !== 1) {
      throw new Error("--pack all cannot be combined with another pack");
    }
    return "all";
  }
  const requested = new Set(values.map(parsePack));
  return BUNDLED_PACKS.filter((pack) => requested.has(pack));
}

function parsePack(value: string | undefined): BundledPack {
  if (value === "core" || value === "trading") {
    return value;
  }
  throw new Error(`Unknown pack '${value}'. Available: ${BUNDLED_PACKS.join(", ")}`);
}

function assertPack(pack: string): asserts pack is BundledPack {
  if (!BUNDLED_PACKS.includes(pack as BundledPack)) {
    throw new Error(`Unknown pack '${pack}'. Available: ${BUNDLED_PACKS.join(", ")}`);
  }
}

function packageDataRoot(): string {
  return findPackageRoot(import.meta.url);
}

function assetAliases(asset: Asset): Set<string> {
  const aliases = new Set(asset.aliases.filter(Boolean));
  if (asset.name) {
    aliases.add(asset.name);
  }
  if (asset.code) {
    aliases.add(asset.code);
  }
  if (asset.group && asset.name) {
    aliases.add(`${asset.group}:${asset.name}`);
  }
  return aliases;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function assetDict(asset: Asset): Record<string, unknown> {
  return {
    id: asset.id,
    filename: asset.filename,
    group: asset.group,
    name: asset.name,
    code: asset.code,
    group_index: asset.groupIndex,
    icon_index: asset.iconIndex,
    aliases: asset.aliases,
  };
}

function formatSearchResults(
  items: ReadonlyArray<{
    result: AssetSearchResult;
    descriptor: AssetDescriptor;
  }>,
  language: "en" | "ru",
): string {
  return items.flatMap(({ result, descriptor }, index) => {
    const lines = [
      `${index + 1}. ${result.pack}:${result.id} (score ${result.score})`,
      `   EN: ${descriptor.labels.en}`,
      `   RU: ${descriptor.labels.ru}`,
      `   ${language.toUpperCase()}: ${descriptor.descriptions[language]}`,
    ];
    for (const item of result.reasons) {
      const delta = item.delta >= 0 ? `+${item.delta}` : String(item.delta);
      lines.push(
        `   ${delta} ${item.match} ${item.field}: ${item.query_term} -> ${item.matched_term}`,
      );
    }
    return lines;
  }).join("\n");
}

function printAssetsUsage(): void {
  const text = `Usage: excalidraw-assets [--pack core|trading|all] <command> [options]

Commands:
  packs
  groups [--json]
  list [--group GROUP] [--json]
  show ASSET_ID
  search QUERY... [--pack core|trading|all] [--limit N] [--lang en|ru] [--json]
  export TARGET
`;
  writeFileSync(1, text);
}

function print(value: string): void {
  writeFileSync(1, `${value}\n`);
}
