import { readFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDLED_ASSET_PACKS,
  catalogSha256,
  parseAssetManifest,
  validateBundledCatalog,
} from "../src/asset-catalog.js";
import type {
  AssetDescriptor,
  AssetManifestV2,
  BundledAssetPack,
  ParsedAssetManifest,
} from "../src/asset-catalog.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const PACKS = BUNDLED_ASSET_PACKS;
const REQUIRED_GROUNDED_FIELDS = [
  "labels",
  "descriptions",
  "categories",
  "domains",
  "keywords",
  "synonyms",
  "negative_keywords",
  "visual_kind",
] as const;
const EVIDENCE_SOURCE_KINDS = new Set([
  "id-name",
  "svg-title",
  "svg-desc",
  "taxonomy",
  "ordinary-product-vocabulary",
]);
const PROVENANCE_SOURCE_REF = "assets/PROVENANCE.md#project-authored-bundled-assets";
const PROJECT_SOURCE_URL = "https://github.com/kroffske/excalidraw-js";
const PROJECT_ATTRIBUTION = "Project-authored by repository owner and maintainer kroffske.";
const INTRODUCTION_COMMIT = "d28d62eaa0f4c6b0ceb06af216f91ed5f4545bd7";
const PROJECT_LICENSE_URL = `${PROJECT_SOURCE_URL}/blob/${INTRODUCTION_COMMIT}/LICENSE`;

const CSV_COLUMNS = [
  "id",
  "group",
  "name",
  "code",
  "group_index",
  "icon_index",
  "filename",
  "viewBox",
  "aliases",
  "colors",
  "schema_version",
  "taxonomy_version",
  "pack",
  "labels.en",
  "labels.ru",
  "descriptions.en",
  "descriptions.ru",
  "categories",
  "domains",
  "keywords.en",
  "keywords.ru",
  "synonyms.en",
  "synonyms.ru",
  "negative_keywords.en",
  "negative_keywords.ru",
  "visual_kind",
  "provenance.source_kind",
  "provenance.source_url",
  "provenance.source_ref",
  "provenance.license_spdx",
  "provenance.license_url",
  "provenance.attribution",
  "provenance.svg_sha256",
] as const;

export const GENERATED_CATALOG_PATHS = [
  "assets/core/manifest.json",
  "assets/core/manifest.csv",
  "catalog-review/assets/v1/core/index.html",
  "assets/trading/manifest.json",
  "assets/trading/manifest.csv",
  "catalog-review/assets/v1/trading/index.html",
] as const;

interface EvidenceSource {
  kind: string;
  ref: string;
}

interface EvidenceRecord {
  id: string;
  language: "en" | "ru";
  label: string;
  grounded_fields: string[];
  sources: EvidenceSource[];
}

interface DescriptorEvidence {
  schema_version: number;
  catalog_schema_version: number;
  taxonomy_version: number;
  records: EvidenceRecord[];
}

export interface GenerateAssetCatalogOptions {
  sourceRoot?: string;
  outputRoot?: string;
  check?: boolean;
}

export interface GenerateAssetCatalogResult {
  catalogSha256: string;
  assetCount: number;
  outputPaths: string[];
}

function readJson(path: string): unknown {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${path}: UTF-8 BOM is forbidden`);
  }
  const text = bytes.toString("utf8");
  if (text !== text.normalize("NFC")) {
    throw new Error(`${path}: text must be Unicode NFC`);
  }
  return JSON.parse(text) as unknown;
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2).normalize("NFC")}\n`;
}

function manifestEnvelope(
  pack: BundledAssetPack,
  assets: AssetDescriptor[],
): AssetManifestV2 {
  return {
    schema_version: 2,
    taxonomy_version: 1,
    pack,
    assets,
  };
}

function legacyManifest(descriptors: readonly AssetDescriptor[]): unknown[] {
  return descriptors.map((descriptor) => ({
    id: descriptor.id,
    group: descriptor.group,
    name: descriptor.name,
    code: descriptor.code,
    group_index: descriptor.group_index,
    icon_index: descriptor.icon_index,
    filename: descriptor.filename,
    viewBox: descriptor.viewBox,
    aliases: descriptor.aliases,
    colors: descriptor.colors,
  }));
}

function csvValue(value: string): string {
  if (!/[",\r\n]/u.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function csvRow(values: readonly string[]): string {
  return values.map(csvValue).join(",");
}

function joinValues(values: readonly string[]): string {
  return values.join("|");
}

function descriptorCsvRow(pack: BundledAssetPack, descriptor: AssetDescriptor): string {
  return csvRow([
    descriptor.id,
    descriptor.group,
    descriptor.name,
    descriptor.code ?? "",
    descriptor.group_index?.toString() ?? "",
    descriptor.icon_index?.toString() ?? "",
    descriptor.filename,
    descriptor.viewBox,
    joinValues(descriptor.aliases),
    joinValues(descriptor.colors),
    "2",
    "1",
    pack,
    descriptor.labels.en,
    descriptor.labels.ru,
    descriptor.descriptions.en,
    descriptor.descriptions.ru,
    joinValues(descriptor.categories),
    joinValues(descriptor.domains),
    joinValues(descriptor.keywords.en),
    joinValues(descriptor.keywords.ru),
    joinValues(descriptor.synonyms.en),
    joinValues(descriptor.synonyms.ru),
    joinValues(descriptor.negative_keywords.en),
    joinValues(descriptor.negative_keywords.ru),
    descriptor.visual_kind,
    descriptor.provenance.source_kind,
    descriptor.provenance.source_url ?? "",
    descriptor.provenance.source_ref ?? "",
    descriptor.provenance.license_spdx,
    descriptor.provenance.license_url ?? "",
    descriptor.provenance.attribution ?? "",
    descriptor.provenance.svg_sha256,
  ]);
}

function renderCsv(pack: BundledAssetPack, descriptors: readonly AssetDescriptor[]): string {
  return [
    csvRow(CSV_COLUMNS),
    ...descriptors.map((descriptor) => descriptorCsvRow(pack, descriptor)),
    "",
  ].join("\n").normalize("NFC");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderContactSheet(
  pack: BundledAssetPack,
  descriptors: readonly AssetDescriptor[],
  digest: string,
): string {
  const cards = descriptors.map((descriptor) => `      <article class="asset" data-asset-id="${escapeHtml(descriptor.id)}">
        <img src="../../../../assets/${pack}/svg/${escapeHtml(descriptor.filename)}" alt="" width="160" height="160">
        <h2>${escapeHtml(descriptor.labels.en)}</h2>
        <p class="ru" lang="ru">${escapeHtml(descriptor.labels.ru)}</p>
        <code>${escapeHtml(descriptor.id)}</code>
      </article>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pack} asset catalog review</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Noto Sans", sans-serif; }
    body { margin: 24px; color: #172035; background: #f7f8fc; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .meta { margin: 0; color: #586174; overflow-wrap: anywhere; }
    .catalog { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
    .asset { min-width: 0; padding: 16px; border: 1px solid #ccd2df; border-radius: 8px; background: white; }
    img { display: block; width: 100%; height: 160px; object-fit: contain; }
    h2 { margin: 12px 0 4px; font-size: 16px; }
    .ru { min-height: 40px; margin: 0 0 8px; color: #39445c; }
    code { display: block; font-size: 11px; overflow-wrap: anywhere; }
    @media (max-width: 900px) { .catalog { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { .catalog { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>${pack} asset catalog</h1>
    <p class="meta">${descriptors.length} assets · catalog SHA-256 ${digest}</p>
  </header>
  <main class="catalog">
${cards}
  </main>
</body>
</html>
`;
}

function requireEvidenceObject(raw: unknown, path: string): DescriptorEvidence {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: evidence must be an object`);
  }
  return raw as DescriptorEvidence;
}

function assertExactArray(
  actual: readonly string[],
  expected: readonly string[],
  context: string,
): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${context}: expected ${expected.join(",")}`);
  }
}

export function validateDescriptorEvidence(
  sourceRoot: string,
  descriptors: readonly AssetDescriptor[],
): void {
  const path = join(sourceRoot, "catalog-review/assets/v1/descriptor-evidence.json");
  const evidence = requireEvidenceObject(readJson(path), path);
  if (
    evidence.schema_version !== 1
    || evidence.catalog_schema_version !== 2
    || evidence.taxonomy_version !== 1
    || !Array.isArray(evidence.records)
  ) {
    throw new Error(`${path}: unsupported evidence envelope`);
  }

  const expectedRecords = descriptors.flatMap((descriptor) => (["en", "ru"] as const).map(
    (language) => ({ descriptor, language }),
  ));
  if (evidence.records.length !== expectedRecords.length) {
    throw new Error(`${path}: expected ${expectedRecords.length} records`);
  }

  const seen = new Set<string>();
  evidence.records.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${path}: record ${index} must be an object`);
    }
    const expected = expectedRecords[index];
    const key = `${record.id}\0${record.language}`;
    if (seen.has(key)) throw new Error(`${path}: duplicate evidence ${record.id}/${record.language}`);
    seen.add(key);
    if (
      record.id !== expected.descriptor.id
      || record.language !== expected.language
      || record.label !== expected.descriptor.labels[expected.language]
    ) {
      throw new Error(`${path}: record ${index} does not match catalog order and label`);
    }
    assertExactArray(record.grounded_fields, REQUIRED_GROUNDED_FIELDS, `${path}: ${key} grounded_fields`);
    if (!Array.isArray(record.sources) || record.sources.length === 0) {
      throw new Error(`${path}: ${key} needs structured sources`);
    }
    for (const source of record.sources) {
      if (
        !source
        || typeof source !== "object"
        || !EVIDENCE_SOURCE_KINDS.has(source.kind)
        || typeof source.ref !== "string"
        || source.ref.length === 0
        || source.ref !== source.ref.normalize("NFC")
      ) {
        throw new Error(`${path}: ${key} has invalid source`);
      }
    }
    if (!record.sources.some((source) => source.kind === "id-name" || source.kind === "svg-title")) {
      throw new Error(`${path}: ${key} needs identity or SVG title evidence`);
    }
    if (!record.sources.some((source) => source.kind === "taxonomy")) {
      throw new Error(`${path}: ${key} needs taxonomy evidence`);
    }
  });
}

function validateCatalogReleasePolicy(
  sourceRoot: string,
  manifests: Readonly<Record<BundledAssetPack, ParsedAssetManifest>>,
  descriptors: readonly AssetDescriptor[],
): void {
  if (descriptors.length !== 128) throw new Error("bundled catalog must contain exactly 128 assets");
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  for (const descriptor of descriptors) {
    const provenance = descriptor.provenance;
    if (
      provenance.source_kind !== "project-authored"
      || provenance.source_url !== PROJECT_SOURCE_URL
      || provenance.source_ref !== PROVENANCE_SOURCE_REF
      || provenance.license_spdx !== "MIT"
      || provenance.license_url !== PROJECT_LICENSE_URL
      || provenance.attribution !== PROJECT_ATTRIBUTION
    ) {
      throw new Error(`${descriptor.id}: provenance does not bind the project attestation`);
    }
    if (
      descriptor.negative_keywords.en.length !== 0
      || descriptor.negative_keywords.ru.length !== 0
    ) {
      throw new Error(`${descriptor.id}: baseline negative_keywords must be empty`);
    }
  }
  for (const pack of PACKS) {
    if (manifests[pack].assets.length !== 64) {
      throw new Error(`${pack}: bundled manifest must contain exactly 64 assets`);
    }
    const manifestFilenames = new Set(
      manifests[pack].assets.map((item) => descriptorById.get(item.id)?.filename),
    );
    const svgFilenames = readdirSync(join(sourceRoot, "assets", pack, "svg"))
      .filter((filename) => filename.endsWith(".svg"));
    if (
      manifestFilenames.has(undefined)
      || manifestFilenames.size !== svgFilenames.length
      || svgFilenames.some((filename) => !manifestFilenames.has(filename))
    ) {
      throw new Error(`${pack}: manifest and SVG directory must be a bijection`);
    }
  }

  const provenancePath = join(sourceRoot, "assets/PROVENANCE.md");
  const provenanceRecord = readFileSync(provenancePath, "utf8");
  for (const requiredText of [
    "## Project-authored bundled assets",
    "`kroffske`",
    "2026-07-18",
    INTRODUCTION_COMMIT,
    "byte-identical",
    "`MIT` license",
  ]) {
    if (!provenanceRecord.includes(requiredText)) {
      throw new Error(`${provenancePath}: missing attestation text ${requiredText}`);
    }
  }
}

function validateFrozenLegacyBaseline(
  sourceRoot: string,
  pack: BundledAssetPack,
  descriptors: readonly AssetDescriptor[],
): void {
  const path = join(
    sourceRoot,
    `catalog-review/assets/v1/baseline/${pack}-manifest-v1.json`,
  );
  const expected = canonicalJson(legacyManifest(descriptors));
  const frozen = readFileSync(path, "utf8");
  if (frozen !== expected) {
    throw new Error(
      `${path}: immutable legacy baseline drift; restore the baseline legacy fields`,
    );
  }
}

function writeOrCheck(
  outputs: ReadonlyMap<string, string>,
  outputRoot: string,
  check: boolean,
): void {
  for (const [relativePath, content] of outputs) {
    const path = join(outputRoot, relativePath);
    if (check) {
      const committed = readFileSync(path, "utf8");
      if (committed !== content) throw new Error(`${relativePath}: generated content differs`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
}

export function generateAssetCatalog(
  options: GenerateAssetCatalogOptions = {},
): GenerateAssetCatalogResult {
  const sourceRoot = resolve(options.sourceRoot ?? REPO_ROOT);
  const outputRoot = resolve(options.outputRoot ?? sourceRoot);
  const manifests = Object.fromEntries(PACKS.map((pack) => {
    const raw = readJson(join(sourceRoot, `assets/${pack}/manifest.json`));
    return [pack, parseAssetManifest(raw, pack)];
  })) as Record<BundledAssetPack, ParsedAssetManifest>;

  const descriptors = validateBundledCatalog(
    manifests,
    (pack, filename) => readFileSync(join(sourceRoot, "assets", pack, "svg", filename)),
  );
  validateCatalogReleasePolicy(sourceRoot, manifests, descriptors);
  validateDescriptorEvidence(sourceRoot, descriptors);
  const digest = catalogSha256(descriptors);

  const outputs = new Map<string, string>();
  let offset = 0;
  for (const pack of PACKS) {
    const packAssetCount = manifests[pack].assets.length;
    const envelope = manifestEnvelope(pack, descriptors.slice(offset, offset + packAssetCount));
    offset += packAssetCount;
    validateFrozenLegacyBaseline(sourceRoot, pack, envelope.assets);
    outputs.set(`assets/${pack}/manifest.json`, canonicalJson(envelope));
    outputs.set(`assets/${pack}/manifest.csv`, renderCsv(pack, envelope.assets));
    outputs.set(
      `catalog-review/assets/v1/${pack}/index.html`,
      renderContactSheet(pack, envelope.assets, digest),
    );
  }
  writeOrCheck(outputs, outputRoot, options.check ?? false);
  return {
    catalogSha256: digest,
    assetCount: descriptors.length,
    outputPaths: [...outputs.keys()],
  };
}

function parseArguments(args: readonly string[]): GenerateAssetCatalogOptions {
  let outputRoot: string | undefined;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      check = true;
    } else if (argument === "--output-root") {
      outputRoot = args[index + 1];
      if (!outputRoot) throw new Error("--output-root requires a path");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (check && outputRoot) throw new Error("--check cannot be combined with --output-root");
  return { outputRoot, check };
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  const options = parseArguments(process.argv.slice(2));
  const result = generateAssetCatalog(options);
  const action = options.check ? "Validated" : "Generated";
  process.stdout.write(
    `${action} ${result.assetCount} assets (${result.catalogSha256})\n`,
  );
}
