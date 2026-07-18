import { createHash } from "node:crypto";

export const BUNDLED_ASSET_PACKS = ["core", "trading"] as const;
export type BundledAssetPack = (typeof BUNDLED_ASSET_PACKS)[number];

export const ASSET_CATEGORIES = [
  "actor",
  "agent",
  "interface",
  "service",
  "data",
  "model",
  "pipeline",
  "evaluation",
  "security",
  "observability",
  "market",
  "strategy",
  "position",
  "risk",
  "derivative",
  "execution",
  "chart",
  "other",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_DOMAINS = [
  "ai-agents",
  "machine-learning",
  "data",
  "security",
  "operations",
  "trading",
  "finance",
  "general",
] as const;
export type AssetDomain = (typeof ASSET_DOMAINS)[number];

export const ASSET_VISUAL_KINDS = [
  "actor",
  "service",
  "data",
  "chart",
  "trade",
  "risk",
  "control",
  "event",
  "other",
] as const;
export type AssetVisualKind = (typeof ASSET_VISUAL_KINDS)[number];

export interface AssetManifestItem {
  id: string;
  name?: string;
  filename: string;
  code?: string;
  group?: string;
  group_index?: number;
  icon_index?: number;
  viewBox?: string;
  colors?: string[];
  aliases?: string[];
}

export interface AssetLocalizedText {
  en: string;
  ru: string;
}

export interface AssetLocalizedTerms {
  en: string[];
  ru: string[];
}

export interface AssetProvenance {
  source_kind: "project-authored" | "third-party";
  source_url?: string;
  source_ref: string;
  license_spdx: "MIT";
  license_url?: string;
  attribution?: string;
  svg_sha256: string;
}

export interface AssetDescriptor extends AssetManifestItem {
  name: string;
  code: string;
  group: string;
  group_index: number;
  icon_index: number;
  viewBox: string;
  colors: string[];
  aliases: string[];
  labels: AssetLocalizedText;
  descriptions: AssetLocalizedText;
  categories: AssetCategory[];
  domains: AssetDomain[];
  keywords: AssetLocalizedTerms;
  synonyms: AssetLocalizedTerms;
  negative_keywords: AssetLocalizedTerms;
  visual_kind: AssetVisualKind;
  provenance: AssetProvenance;
}

export interface AssetManifestV2 {
  schema_version: 2;
  taxonomy_version: 1;
  pack: string;
  assets: AssetDescriptor[];
}

export interface ParsedAssetManifest {
  schema_version: 1 | 2;
  taxonomy_version: 1 | null;
  pack: string | null;
  assets: AssetManifestItem[] | AssetDescriptor[];
}

export type AssetSvgReader = (pack: BundledAssetPack, filename: string) => Uint8Array;

export interface AssetCatalogEntry {
  pack: BundledAssetPack;
  descriptor: AssetDescriptor;
}

export interface AssetSearchOptions {
  packs?: readonly BundledAssetPack[] | "all";
  limit?: number;
}

export type AssetSearchMatch = "exact" | "phrase" | "prefix" | "edit1" | "negative";

export interface AssetSearchReason {
  field: string;
  query_term: string;
  matched_term: string;
  match: AssetSearchMatch;
  delta: number;
}

export interface AssetSearchResult {
  id: string;
  pack: BundledAssetPack;
  score: number;
  reasons: AssetSearchReason[];
  catalog_sha256: string;
}

const SEARCHABLE_TEXT = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Nd}\s._/,:;!?()\[\]{}'"+&%#@–—-]+$/u;
const SEARCH_TOKEN = /[\p{L}\p{N}]+/gu;
const MANIFEST_V2_KEYS = [
  "schema_version",
  "taxonomy_version",
  "pack",
  "assets",
] as const;
const MANIFEST_ITEM_KEYS = [
  "id",
  "name",
  "filename",
  "code",
  "group",
  "group_index",
  "icon_index",
  "viewBox",
  "colors",
  "aliases",
] as const;
const DESCRIPTOR_KEYS = [
  ...MANIFEST_ITEM_KEYS,
  "labels",
  "descriptions",
  "categories",
  "domains",
  "keywords",
  "synonyms",
  "negative_keywords",
  "visual_kind",
  "provenance",
] as const;
const LOCALIZED_KEYS = ["en", "ru"] as const;
const PROVENANCE_KEYS = [
  "source_kind",
  "source_url",
  "source_ref",
  "license_spdx",
  "license_url",
  "attribution",
  "svg_sha256",
] as const;

const MATCH_WEIGHTS = {
  label: { exact: 80, prefix: 40, edit1: 20 },
  name: { exact: 80, prefix: 40, edit1: 20 },
  alias: { exact: 80, prefix: 40, edit1: 20 },
  synonym: { exact: 70, prefix: 35, edit1: 18 },
  keyword: { exact: 50, prefix: 25, edit1: 12 },
  category: { exact: 35, prefix: 18, edit1: 9 },
  domain: { exact: 35, prefix: 18, edit1: 9 },
  description: { exact: 15, prefix: 8, edit1: 4 },
  group: { exact: 10, prefix: 5, edit1: 2 },
  visual_kind: { exact: 10, prefix: 5, edit1: 2 },
} as const;

type SearchField = keyof typeof MATCH_WEIGHTS;
type PositiveMatch = Exclude<AssetSearchMatch, "phrase" | "negative">;

const FIELD_PRIORITY: readonly SearchField[] = [
  "label",
  "name",
  "alias",
  "synonym",
  "keyword",
  "category",
  "domain",
  "description",
  "group",
  "visual_kind",
];

const FIELD_PRIORITY_INDEX = new Map(FIELD_PRIORITY.map((field, index) => [field, index]));
const MATCH_PRIORITY: Readonly<Record<PositiveMatch, number>> = {
  exact: 0,
  prefix: 1,
  edit1: 2,
};

interface SearchFieldValue {
  field: SearchField;
  path: string;
  normalized: string;
  tokens: string[];
  localeIndex: number;
  valueIndex: number;
}

interface PositiveWitness {
  field: SearchField;
  path: string;
  queryTerm: string;
  matchedTerm: string;
  match: PositiveMatch;
  delta: number;
  localeIndex: number;
  valueIndex: number;
}

interface RankedAssetSearchResult extends AssetSearchResult {
  exactClass: number;
  matchedTokenCount: number;
}

export function normalizeAssetSearchText(value: string): string {
  return (value.normalize("NFKC").toLowerCase().match(SEARCH_TOKEN) ?? []).join(" ");
}

export function searchAssetCatalog(
  query: string,
  entries: readonly AssetCatalogEntry[],
  catalogDigest: string,
  options: AssetSearchOptions = {},
): AssetSearchResult[] {
  const selectedPacks = normalizeSearchPacks(options.packs);
  const limit = normalizeSearchLimit(options.limit);
  const normalizedQuery = normalizeAssetSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  const querySequence = normalizedQuery.split(" ");
  const queryTokens = [...new Set(querySequence)];
  const ranked: RankedAssetSearchResult[] = [];
  for (const entry of entries) {
    if (!selectedPacks.has(entry.pack)) {
      continue;
    }
    const scored = scoreDescriptor(
      entry,
      normalizedQuery,
      querySequence,
      queryTokens,
      catalogDigest,
    );
    if (scored) {
      ranked.push(scored);
    }
  }

  ranked.sort((left, right) => (
    right.score - left.score
    || right.exactClass - left.exactClass
    || right.matchedTokenCount - left.matchedTokenCount
    || codeUnitCompare(left.id, right.id)
  ));
  return ranked.slice(0, limit).map(({
    exactClass: _exactClass,
    matchedTokenCount: _matchedTokenCount,
    ...result
  }) => result);
}

function normalizeSearchPacks(packs: AssetSearchOptions["packs"]): Set<BundledAssetPack> {
  if (packs === undefined || packs === "all") {
    return new Set(BUNDLED_ASSET_PACKS);
  }
  if (!Array.isArray(packs) || packs.length === 0) {
    throw new Error("Asset search packs must be a non-empty array or 'all'.");
  }
  const requested = new Set<BundledAssetPack>();
  for (const pack of packs) {
    if (!BUNDLED_ASSET_PACKS.includes(pack)) {
      throw new Error(`Unknown asset pack '${String(pack)}'. Available: ${BUNDLED_ASSET_PACKS.join(", ")}`);
    }
    requested.add(pack);
  }
  return new Set(BUNDLED_ASSET_PACKS.filter((pack) => requested.has(pack)));
}

function normalizeSearchLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 5;
  }
  if (!Number.isInteger(limit) || !Number.isFinite(limit) || limit <= 0) {
    throw new Error("Asset search limit must be a positive integer.");
  }
  return limit;
}

function scoreDescriptor(
  entry: AssetCatalogEntry,
  normalizedQuery: string,
  querySequence: readonly string[],
  queryTokens: readonly string[],
  catalogDigest: string,
): RankedAssetSearchResult | null {
  const descriptor = entry.descriptor;
  const aliases = descriptorAliases(descriptor);
  const fields = descriptorSearchFields(descriptor, descriptor.aliases);
  const reasons: AssetSearchReason[] = [];
  let exactClass = 0;

  const normalizedId = normalizeAssetSearchText(descriptor.id);
  if (normalizedQuery === normalizedId) {
    exactClass = 3;
    reasons.push(reason("id", normalizedQuery, normalizedId, "exact", 10_000));
  } else {
    const identityAlias = aliases.find((alias) => normalizeAssetSearchText(alias) === normalizedQuery);
    if (identityAlias !== undefined) {
      exactClass = 2;
      reasons.push(reason("alias", normalizedQuery, normalizeAssetSearchText(identityAlias), "exact", 10_000));
    }
  }

  if (querySequence.length >= 2) {
    const phrase = descriptorSearchFields(descriptor, aliases)
      .filter(({ field }) => field === "label" || field === "alias" || field === "synonym" || field === "keyword")
      .find(({ normalized }) => normalized === normalizedQuery);
    if (phrase) {
      reasons.push(reason(phrase.path, normalizedQuery, phrase.normalized, "phrase", 100));
    }
  }

  let matchedTokenCount = 0;
  for (const queryToken of queryTokens) {
    let best: PositiveWitness | null = null;
    for (const fieldValue of fields) {
      for (const matchedTerm of fieldValue.tokens) {
        const match = positiveMatch(queryToken, matchedTerm);
        if (!match) {
          continue;
        }
        const witness: PositiveWitness = {
          field: fieldValue.field,
          path: fieldValue.path,
          queryTerm: queryToken,
          matchedTerm,
          match,
          delta: MATCH_WEIGHTS[fieldValue.field][match],
          localeIndex: fieldValue.localeIndex,
          valueIndex: fieldValue.valueIndex,
        };
        if (!best || comparePositiveWitness(witness, best) < 0) {
          best = witness;
        }
      }
    }
    if (best) {
      matchedTokenCount += 1;
      if (best.match === "exact" && exactClass === 0) {
        exactClass = 1;
      }
      reasons.push(reason(best.path, best.queryTerm, best.matchedTerm, best.match, best.delta));
    }
  }

  const seenNegatives = new Set<string>();
  for (const fieldValue of negativeFieldValues(descriptor)) {
    if (!fieldValue.normalized || seenNegatives.has(fieldValue.normalized)) {
      continue;
    }
    seenNegatives.add(fieldValue.normalized);
    const matches = fieldValue.tokens.length === 1
      ? queryTokens.includes(fieldValue.tokens[0])
      : includesTokenSequence(querySequence, fieldValue.tokens);
    if (matches) {
      reasons.push(reason(
        fieldValue.path,
        fieldValue.normalized,
        fieldValue.normalized,
        "negative",
        -100,
      ));
    }
  }

  reasons.sort(compareReasons);
  const score = reasons.reduce((total, item) => total + item.delta, 0);
  if (score <= 0) {
    return null;
  }
  return {
    id: descriptor.id,
    pack: entry.pack,
    score,
    reasons,
    catalog_sha256: catalogDigest,
    exactClass,
    matchedTokenCount,
  };
}

function descriptorAliases(descriptor: AssetDescriptor): string[] {
  return [...new Set([
    ...descriptor.aliases,
    descriptor.name,
    descriptor.code,
    `${descriptor.group}:${descriptor.name}`,
  ].filter(Boolean))];
}

function manifestItemResolverAliases(item: AssetManifestItem): string[] {
  const name = item.name ?? item.id;
  return [...new Set([
    item.id,
    ...(item.aliases ?? []),
    name,
    item.code,
    item.group && name ? `${item.group}:${name}` : undefined,
  ].filter((value): value is string => Boolean(value)))];
}

function descriptorSearchFields(
  descriptor: AssetDescriptor,
  aliases: readonly string[],
): SearchFieldValue[] {
  const fields: SearchFieldValue[] = [];
  const add = (
    field: SearchField,
    path: string,
    values: readonly string[],
    localeIndex = 0,
  ): void => {
    values.forEach((value, valueIndex) => {
      const normalized = normalizeAssetSearchText(value);
      fields.push({
        field,
        path,
        normalized,
        tokens: normalized ? normalized.split(" ") : [],
        localeIndex,
        valueIndex,
      });
    });
  };
  add("label", "labels.en", [descriptor.labels.en], 0);
  add("label", "labels.ru", [descriptor.labels.ru], 1);
  add("name", "name", [descriptor.name]);
  add("alias", "aliases", aliases);
  add("synonym", "synonyms.en", descriptor.synonyms.en, 0);
  add("synonym", "synonyms.ru", descriptor.synonyms.ru, 1);
  add("keyword", "keywords.en", descriptor.keywords.en, 0);
  add("keyword", "keywords.ru", descriptor.keywords.ru, 1);
  add("category", "categories", descriptor.categories);
  add("domain", "domains", descriptor.domains);
  add("description", "descriptions.en", [descriptor.descriptions.en], 0);
  add("description", "descriptions.ru", [descriptor.descriptions.ru], 1);
  add("group", "group", [descriptor.group]);
  add("visual_kind", "visual_kind", [descriptor.visual_kind]);
  return fields;
}

function negativeFieldValues(descriptor: AssetDescriptor): SearchFieldValue[] {
  const values: SearchFieldValue[] = [];
  for (const [localeIndex, language] of (["en", "ru"] as const).entries()) {
    descriptor.negative_keywords[language].forEach((value, valueIndex) => {
      const normalized = normalizeAssetSearchText(value);
      values.push({
        field: "keyword",
        path: `negative_keywords.${language}`,
        normalized,
        tokens: normalized ? normalized.split(" ") : [],
        localeIndex,
        valueIndex,
      });
    });
  }
  return values;
}

function positiveMatch(queryTerm: string, matchedTerm: string): PositiveMatch | null {
  if (queryTerm === matchedTerm) {
    return "exact";
  }
  const queryLength = [...queryTerm].length;
  const matchedLength = [...matchedTerm].length;
  if (
    Math.min(queryLength, matchedLength) >= 4
    && (queryTerm.startsWith(matchedTerm) || matchedTerm.startsWith(queryTerm))
  ) {
    return "prefix";
  }
  if (
    Math.min(queryLength, matchedLength) >= 5
    && sameSearchScript(queryTerm, matchedTerm)
    && levenshteinCodePoints(queryTerm, matchedTerm) === 1
  ) {
    return "edit1";
  }
  return null;
}

function sameSearchScript(left: string, right: string): boolean {
  const latin = /^\p{Script=Latin}+$/u;
  const cyrillic = /^\p{Script=Cyrillic}+$/u;
  return (latin.test(left) && latin.test(right)) || (cyrillic.test(left) && cyrillic.test(right));
}

function levenshteinCodePoints(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= a.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= b.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (a[leftIndex - 1] === b[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function includesTokenSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, index) => haystack[start + index] === token)) {
      return true;
    }
  }
  return false;
}

function comparePositiveWitness(left: PositiveWitness, right: PositiveWitness): number {
  return (
    right.delta - left.delta
    || MATCH_PRIORITY[left.match] - MATCH_PRIORITY[right.match]
    || (FIELD_PRIORITY_INDEX.get(left.field) ?? Number.MAX_SAFE_INTEGER)
      - (FIELD_PRIORITY_INDEX.get(right.field) ?? Number.MAX_SAFE_INTEGER)
    || left.localeIndex - right.localeIndex
    || left.valueIndex - right.valueIndex
    || codeUnitCompare(left.matchedTerm, right.matchedTerm)
  );
}

function reason(
  field: string,
  queryTerm: string,
  matchedTerm: string,
  match: AssetSearchMatch,
  delta: number,
): AssetSearchReason {
  return {
    field,
    query_term: queryTerm,
    matched_term: matchedTerm,
    match,
    delta,
  };
}

function compareReasons(left: AssetSearchReason, right: AssetSearchReason): number {
  return (
    right.delta - left.delta
    || reasonFieldPriority(left.field) - reasonFieldPriority(right.field)
    || codeUnitCompare(left.query_term, right.query_term)
    || codeUnitCompare(left.matched_term, right.matched_term)
  );
}

function reasonFieldPriority(path: string): number {
  if (path === "id") return -2;
  if (path === "alias" || path === "aliases") {
    return FIELD_PRIORITY_INDEX.get("alias") ?? 2;
  }
  if (path.startsWith("labels")) return FIELD_PRIORITY_INDEX.get("label") ?? 0;
  if (path === "name") return FIELD_PRIORITY_INDEX.get("name") ?? 1;
  if (path.startsWith("synonyms")) return FIELD_PRIORITY_INDEX.get("synonym") ?? 3;
  if (path.startsWith("keywords") || path.startsWith("negative_keywords")) {
    return FIELD_PRIORITY_INDEX.get("keyword") ?? 4;
  }
  if (path === "categories") return FIELD_PRIORITY_INDEX.get("category") ?? 5;
  if (path === "domains") return FIELD_PRIORITY_INDEX.get("domain") ?? 6;
  if (path.startsWith("descriptions")) return FIELD_PRIORITY_INDEX.get("description") ?? 7;
  if (path === "group") return FIELD_PRIORITY_INDEX.get("group") ?? 8;
  if (path === "visual_kind") return FIELD_PRIORITY_INDEX.get("visual_kind") ?? 9;
  return Number.MAX_SAFE_INTEGER;
}

export function parseAssetManifest(raw: unknown, expectedPack?: string): ParsedAssetManifest {
  if (Array.isArray(raw)) {
    const parsed: ParsedAssetManifest = {
      schema_version: 1,
      taxonomy_version: null,
      pack: expectedPack ?? null,
      assets: raw.map((item, index) => parseManifestItem(item, `assets[${index}]`)),
    };
    validateAssetManifestItems(parsed.assets, expectedPack ?? "manifest");
    return parsed;
  }

  const manifest = record(raw, "manifest");
  knownKeys(manifest, MANIFEST_V2_KEYS, "manifest");
  integerLiteral(manifest.schema_version, 2, "manifest.schema_version");
  integerLiteral(manifest.taxonomy_version, 1, "manifest.taxonomy_version");
  const pack = nonEmptyString(manifest.pack, "manifest.pack");
  if (expectedPack !== undefined && pack !== expectedPack) {
    fail(`manifest.pack must be '${expectedPack}', received '${pack}'`);
  }
  if (!Array.isArray(manifest.assets)) {
    fail("manifest.assets must be an array");
  }

  const parsed: ParsedAssetManifest = {
    schema_version: 2,
    taxonomy_version: 1,
    pack,
    assets: manifest.assets.map((item, index) => parseDescriptor(item, `assets[${index}]`)),
  };
  validateAssetManifestItems(parsed.assets, pack);
  return parsed;
}

export function validateAssetManifestItems(
  items: readonly AssetManifestItem[],
  context = "manifest",
): void {
  const ids = new Set<string>();
  const codes = new Map<string, string>();
  const resolverAliases = new Map<string, string>();

  for (const item of items) {
    if (ids.has(item.id)) {
      fail(`${context} contains duplicate asset id '${item.id}'`);
    }
    ids.add(item.id);

    if (item.code) {
      const existingCodeId = codes.get(item.code);
      if (existingCodeId !== undefined && existingCodeId !== item.id) {
        fail(
          `${context} code '${item.code}' maps to both '${existingCodeId}' and '${item.id}'`,
        );
      }
      codes.set(item.code, item.id);
    }

    for (const alias of manifestItemResolverAliases(item)) {
      const existingId = resolverAliases.get(alias);
      if (existingId !== undefined && existingId !== item.id) {
        fail(
          `${context} resolver alias '${alias}' maps to both '${existingId}' and '${item.id}'`,
        );
      }
      resolverAliases.set(alias, item.id);
    }
  }
}

export function validateBundledCatalog(
  manifests: Readonly<Record<BundledAssetPack, ParsedAssetManifest>>,
  svgReader?: AssetSvgReader,
): AssetDescriptor[] {
  const descriptors: AssetDescriptor[] = [];
  const ids = new Set<string>();

  for (const pack of BUNDLED_ASSET_PACKS) {
    const manifest = manifests[pack];
    if (!manifest || manifest.schema_version !== 2 || manifest.taxonomy_version !== 1) {
      fail(`${pack} manifest must use schema_version 2 and taxonomy_version 1`);
    }
    if (manifest.pack !== pack) {
      fail(`${pack} manifest declares pack '${manifest.pack}'`);
    }
    if (manifest.assets.length !== 64) {
      fail(`${pack} manifest must contain exactly 64 assets`);
    }
    validateAssetManifestItems(manifest.assets, pack);

    for (const item of manifest.assets) {
      const descriptor = parseDescriptor(item, `${pack}:${item.id ?? "<unknown>"}`);
      if (ids.has(descriptor.id)) {
        fail(`duplicate asset id '${descriptor.id}'`);
      }
      ids.add(descriptor.id);
      if (svgReader) {
        const digest = sha256(svgReader(pack, descriptor.filename));
        if (digest !== descriptor.provenance.svg_sha256) {
          fail(`${pack}:${descriptor.id} svg_sha256 mismatch: expected ${descriptor.provenance.svg_sha256}, received ${digest}`);
        }
      }
      descriptors.push(descriptor);
    }
  }

  return descriptors;
}

export function catalogSha256(descriptors: readonly AssetDescriptor[]): string {
  const canonical = [...descriptors]
    .sort((left, right) => codeUnitCompare(left.id, right.id))
    .map(canonicalDescriptor);
  const bytes = Buffer.from(JSON.stringify(canonical).normalize("NFC"), "utf8");
  return sha256(bytes);
}

export function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseManifestItem(raw: unknown, path: string): AssetManifestItem {
  const item = record(raw, path);
  knownKeys(item, MANIFEST_ITEM_KEYS, path);
  const parsed: AssetManifestItem = {
    id: nonEmptyString(item.id, `${path}.id`),
    filename: safeSvgFilename(item.filename, `${path}.filename`),
  };
  if (item.name !== undefined) parsed.name = nonEmptyString(item.name, `${path}.name`);
  if (item.code !== undefined) parsed.code = nonEmptyString(item.code, `${path}.code`);
  if (item.group !== undefined) parsed.group = nonEmptyString(item.group, `${path}.group`);
  if (item.group_index !== undefined) parsed.group_index = positiveInteger(item.group_index, `${path}.group_index`);
  if (item.icon_index !== undefined) parsed.icon_index = positiveInteger(item.icon_index, `${path}.icon_index`);
  if (item.viewBox !== undefined) parsed.viewBox = nonEmptyString(item.viewBox, `${path}.viewBox`);
  if (item.colors !== undefined) parsed.colors = stringArray(item.colors, `${path}.colors`, false);
  if (item.aliases !== undefined) parsed.aliases = stringArray(item.aliases, `${path}.aliases`, false);
  return parsed;
}

function parseDescriptor(raw: unknown, path: string): AssetDescriptor {
  const item = record(raw, path);
  knownKeys(item, DESCRIPTOR_KEYS, path);
  const base = parseManifestItem(
    Object.fromEntries(MANIFEST_ITEM_KEYS.flatMap(
      (key) => item[key] === undefined ? [] : [[key, item[key]]],
    )),
    path,
  );
  const name = nonEmptyString(item.name, `${path}.name`);
  const code = nonEmptyString(item.code, `${path}.code`);
  const group = nonEmptyString(item.group, `${path}.group`);
  const descriptor: AssetDescriptor = {
    id: base.id,
    name,
    filename: base.filename,
    code,
    group,
    group_index: positiveInteger(item.group_index, `${path}.group_index`),
    icon_index: positiveInteger(item.icon_index, `${path}.icon_index`),
    viewBox: nonEmptyString(item.viewBox, `${path}.viewBox`),
    colors: stringArray(item.colors, `${path}.colors`, true),
    aliases: searchableArray(item.aliases, `${path}.aliases`, false),
    labels: localizedText(item.labels, `${path}.labels`),
    descriptions: localizedText(item.descriptions, `${path}.descriptions`),
    categories: enumArray(item.categories, ASSET_CATEGORIES, `${path}.categories`),
    domains: enumArray(item.domains, ASSET_DOMAINS, `${path}.domains`),
    keywords: localizedTerms(item.keywords, `${path}.keywords`, true),
    synonyms: localizedTerms(item.synonyms, `${path}.synonyms`, true),
    negative_keywords: localizedTerms(item.negative_keywords, `${path}.negative_keywords`, false),
    visual_kind: enumValue(item.visual_kind, ASSET_VISUAL_KINDS, `${path}.visual_kind`),
    provenance: provenance(item.provenance, `${path}.provenance`),
  };

  if (descriptor.id !== `${group}_${name}_${code}`) {
    fail(`${path}.id must equal group + "_" + name + "_" + code`);
  }
  if (descriptor.filename !== `${descriptor.id}.svg`) {
    fail(`${path}.filename must equal id + ".svg"`);
  }
  for (const [field, values] of searchableValues(descriptor)) {
    for (const value of values) {
      searchableString(value, `${path}.${field}`);
    }
  }
  return descriptor;
}

function canonicalDescriptor(descriptor: AssetDescriptor): Record<string, unknown> {
  const provenanceValue: Record<string, unknown> = {
    source_kind: descriptor.provenance.source_kind,
  };
  if (descriptor.provenance.source_url !== undefined) provenanceValue.source_url = descriptor.provenance.source_url;
  provenanceValue.source_ref = descriptor.provenance.source_ref;
  provenanceValue.license_spdx = descriptor.provenance.license_spdx;
  if (descriptor.provenance.license_url !== undefined) provenanceValue.license_url = descriptor.provenance.license_url;
  if (descriptor.provenance.attribution !== undefined) provenanceValue.attribution = descriptor.provenance.attribution;
  provenanceValue.svg_sha256 = descriptor.provenance.svg_sha256;

  return {
    id: descriptor.id,
    name: descriptor.name,
    filename: descriptor.filename,
    code: descriptor.code,
    group: descriptor.group,
    group_index: descriptor.group_index,
    icon_index: descriptor.icon_index,
    viewBox: descriptor.viewBox,
    colors: descriptor.colors,
    aliases: descriptor.aliases,
    labels: { en: descriptor.labels.en, ru: descriptor.labels.ru },
    descriptions: { en: descriptor.descriptions.en, ru: descriptor.descriptions.ru },
    categories: descriptor.categories,
    domains: descriptor.domains,
    keywords: { en: descriptor.keywords.en, ru: descriptor.keywords.ru },
    synonyms: { en: descriptor.synonyms.en, ru: descriptor.synonyms.ru },
    negative_keywords: { en: descriptor.negative_keywords.en, ru: descriptor.negative_keywords.ru },
    visual_kind: descriptor.visual_kind,
    provenance: provenanceValue,
  };
}

function provenance(raw: unknown, path: string): AssetProvenance {
  const value = record(raw, path);
  knownKeys(value, PROVENANCE_KEYS, path);
  const sourceKind = enumValue(value.source_kind, ["project-authored", "third-party"] as const, `${path}.source_kind`);
  const license = enumValue(value.license_spdx, ["MIT"] as const, `${path}.license_spdx`);
  const digest = nonEmptyString(value.svg_sha256, `${path}.svg_sha256`);
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    fail(`${path}.svg_sha256 must be a lowercase SHA-256 digest`);
  }
  const result: AssetProvenance = {
    source_kind: sourceKind,
    source_ref: nonEmptyString(value.source_ref, `${path}.source_ref`),
    license_spdx: license,
    svg_sha256: digest,
  };
  if (value.source_url !== undefined) result.source_url = nonEmptyString(value.source_url, `${path}.source_url`);
  if (value.license_url !== undefined) result.license_url = nonEmptyString(value.license_url, `${path}.license_url`);
  if (value.attribution !== undefined) result.attribution = nonEmptyString(value.attribution, `${path}.attribution`);
  return result;
}

function localizedText(raw: unknown, path: string): AssetLocalizedText {
  const value = record(raw, path);
  knownKeys(value, LOCALIZED_KEYS, path);
  return {
    en: searchableString(value.en, `${path}.en`),
    ru: searchableString(value.ru, `${path}.ru`),
  };
}

function localizedTerms(raw: unknown, path: string, nonEmpty: boolean): AssetLocalizedTerms {
  const value = record(raw, path);
  knownKeys(value, LOCALIZED_KEYS, path);
  return {
    en: searchableArray(value.en, `${path}.en`, nonEmpty),
    ru: searchableArray(value.ru, `${path}.ru`, nonEmpty),
  };
}

function searchableValues(descriptor: AssetDescriptor): Array<[string, readonly string[]]> {
  return [
    ["name", [descriptor.name]],
    ["code", [descriptor.code]],
    ["group", [descriptor.group]],
    ["aliases", descriptor.aliases],
    ["labels", [descriptor.labels.en, descriptor.labels.ru]],
    ["descriptions", [descriptor.descriptions.en, descriptor.descriptions.ru]],
    ["categories", descriptor.categories],
    ["domains", descriptor.domains],
    ["keywords", [...descriptor.keywords.en, ...descriptor.keywords.ru]],
    ["synonyms", [...descriptor.synonyms.en, ...descriptor.synonyms.ru]],
    ["negative_keywords", [...descriptor.negative_keywords.en, ...descriptor.negative_keywords.ru]],
    ["visual_kind", [descriptor.visual_kind]],
  ];
}

function record(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(`${path} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function knownKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .sort(codeUnitCompare);
  if (unknown.length > 0) {
    fail(`${path} contains unknown key${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }
}

function nonEmptyString(raw: unknown, path: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    fail(`${path} must be a non-empty string`);
  }
  if (raw.normalize("NFC") !== raw) {
    fail(`${path} must be NFC-normalized`);
  }
  return raw;
}

function searchableString(raw: unknown, path: string): string {
  const value = nonEmptyString(raw, path);
  if (value.includes("|")) {
    fail(`${path} must not contain '|'`);
  }
  if (!SEARCHABLE_TEXT.test(value)) {
    fail(`${path} contains characters outside the searchable repertoire`);
  }
  return value;
}

function stringArray(raw: unknown, path: string, nonEmpty: boolean): string[] {
  if (!Array.isArray(raw) || (nonEmpty && raw.length === 0)) {
    fail(`${path} must be ${nonEmpty ? "a non-empty" : "an"} array`);
  }
  return raw.map((value, index) => nonEmptyString(value, `${path}[${index}]`));
}

function searchableArray(raw: unknown, path: string, nonEmpty: boolean): string[] {
  const values = stringArray(raw, path, nonEmpty);
  return values.map((value, index) => searchableString(value, `${path}[${index}]`));
}

function enumArray<const T extends readonly string[]>(raw: unknown, allowed: T, path: string): Array<T[number]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(`${path} must be a non-empty array`);
  }
  return raw.map((value, index) => enumValue(value, allowed, `${path}[${index}]`));
}

function enumValue<const T extends readonly string[]>(raw: unknown, allowed: T, path: string): T[number] {
  if (typeof raw !== "string" || !allowed.includes(raw)) {
    fail(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return raw as T[number];
}

function positiveInteger(raw: unknown, path: string): number {
  if (!Number.isInteger(raw) || Number(raw) <= 0) {
    fail(`${path} must be a positive integer`);
  }
  return raw as number;
}

function integerLiteral(raw: unknown, expected: number, path: string): void {
  if (raw !== expected) {
    fail(`${path} must equal ${expected}`);
  }
}

function safeSvgFilename(raw: unknown, path: string): string {
  const value = nonEmptyString(raw, path);
  if (value.includes("/") || value.includes("\\") || value === "." || value === ".." || !value.endsWith(".svg")) {
    fail(`${path} must be a safe relative SVG filename`);
  }
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`Invalid asset manifest: ${message}`);
}
