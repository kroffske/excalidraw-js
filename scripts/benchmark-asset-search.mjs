#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_PATH = resolve(
  REPO_ROOT,
  "tests/fixtures/asset-search/v1/benchmark.json",
);
const CORPUS_SHA256 =
  "c721577bdffc3062ac4f120409d1fbfabb4cb3374e37e56081aa182f76c01fd6";
const DEFAULT_OUT_DIR = resolve(REPO_ROOT, "evals/asset-search/v1/current");
const DEFAULT_RUNTIME_MODULE = resolve(REPO_ROOT, "dist/assets.js");
export const DEFAULT_SCORER_FILE = resolve(
  REPO_ROOT,
  "dist/asset-catalog.js",
);
const DEFAULT_LEDGER = resolve(
  REPO_ROOT,
  "catalog-review/assets/v1/descriptor-evidence.json",
);
const DEFAULT_LEGACY_BASELINE = resolve(
  REPO_ROOT,
  "catalog-review/assets/v1/baseline",
);
const SCORER_ID = "lexical-v1";
const MRR_UNITS = Object.freeze({ 1: 60, 2: 30, 3: 20, 4: 15, 5: 12 });
const ALLOWED_SOURCE_KINDS = new Set([
  "id-name",
  "svg-title",
  "svg-desc",
  "taxonomy",
  "ordinary-product-vocabulary",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeBenchmarkText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function loadFrozenCorpus(path = CORPUS_PATH) {
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  if (digest !== CORPUS_SHA256) {
    throw new Error(
      `Frozen corpus SHA-256 mismatch: expected ${CORPUS_SHA256}, got ${digest}.`,
    );
  }
  const corpus = JSON.parse(bytes.toString("utf8"));
  if (
    corpus.version !== 1 ||
    JSON.stringify(corpus.packs) !== '["core","trading"]' ||
    JSON.stringify(corpus.languages) !== '["en","ru"]' ||
    !Array.isArray(corpus.queries) ||
    corpus.queries.length !== 48
  ) {
    throw new Error("Frozen corpus shape is not asset-search benchmark v1.");
  }
  const ids = new Set();
  for (const query of corpus.queries) {
    if (
      typeof query.id !== "string" ||
      typeof query.query !== "string" ||
      typeof query.acceptedId !== "string" ||
      !corpus.packs.includes(query.pack) ||
      !corpus.languages.includes(query.language) ||
      ids.has(query.id)
    ) {
      throw new Error(`Invalid or duplicate frozen query '${query.id}'.`);
    }
    ids.add(query.id);
  }
  for (const dimension of ["language", "pack"]) {
    for (const value of corpus[`${dimension}s`]) {
      const count = corpus.queries.filter((query) => query[dimension] === value)
        .length;
      if (count !== 24) {
        throw new Error(
          `Frozen corpus ${dimension} '${value}' has ${count} queries, expected 24.`,
        );
      }
    }
  }
  return { corpus, bytes, sha256: digest };
}

function orderedObject(source, keys) {
  const output = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      output[key] = source[key];
    }
  }
  return output;
}

function canonicalDescriptor(descriptor) {
  const output = orderedObject(descriptor, [
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
    "labels",
    "descriptions",
    "categories",
    "domains",
    "keywords",
    "synonyms",
    "negative_keywords",
    "visual_kind",
    "provenance",
  ]);
  for (const key of [
    "labels",
    "descriptions",
    "keywords",
    "synonyms",
    "negative_keywords",
  ]) {
    if (output[key] !== undefined) {
      output[key] = orderedObject(output[key], ["en", "ru"]);
    }
  }
  if (output.provenance !== undefined) {
    output.provenance = orderedObject(output.provenance, [
      "source_kind",
      "source_url",
      "source_ref",
      "license_spdx",
      "license_url",
      "attribution",
      "svg_sha256",
    ]);
  }
  return output;
}

export function catalogDigest(descriptors) {
  const canonical = descriptors
    .map(canonicalDescriptor)
    .sort((left, right) => codeUnitCompare(left.id, right.id));
  return sha256(Buffer.from(JSON.stringify(canonical).normalize("NFC"), "utf8"));
}

function stringLeaves(value, path = []) {
  if (typeof value === "string") {
    return [{ path, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => stringLeaves(item, [...path, index]));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      stringLeaves(item, [...path, key]),
    );
  }
  return [];
}

function validateLedger(ledger) {
  if (
    ledger.schema_version !== 1 ||
    ledger.catalog_schema_version !== 2 ||
    ledger.taxonomy_version !== 1 ||
    !Array.isArray(ledger.records) ||
    ledger.records.length !== 256
  ) {
    throw new Error("Descriptor evidence ledger has an invalid v1 envelope.");
  }
  const recordKeys = new Set();
  for (const record of ledger.records) {
    const recordKey = JSON.stringify([record?.id, record?.language]);
    if (
      typeof record.id !== "string" ||
      !["en", "ru"].includes(record.language) ||
      typeof record.label !== "string" ||
      !Array.isArray(record.grounded_fields) ||
      !record.grounded_fields.includes("labels") ||
      !Array.isArray(record.sources) ||
      record.sources.length === 0 ||
      recordKeys.has(recordKey) ||
      record.sources.some(
        (source) =>
          !source ||
          !ALLOWED_SOURCE_KINDS.has(source.kind) ||
          typeof source.ref !== "string" ||
          source.ref.trim() === "",
      )
    ) {
      throw new Error(
        `Descriptor evidence ledger record '${record?.id ?? "unknown"}' is ungrounded.`,
      );
    }
    recordKeys.add(recordKey);
  }
}

export function loadLegacyIdentity(
  baselineDir = DEFAULT_LEGACY_BASELINE,
  packs = ["core", "trading"],
) {
  const identity = new Map();
  for (const pack of packs) {
    const items = JSON.parse(
      readFileSync(resolve(baselineDir, `${pack}-manifest-v1.json`), "utf8"),
    );
    if (!Array.isArray(items) || items.length !== 64) {
      throw new Error(`Legacy ${pack} baseline must contain exactly 64 items.`);
    }
    for (const item of items) {
      if (identity.has(item.id)) {
        throw new Error(`Legacy baseline duplicates asset id '${item.id}'.`);
      }
      identity.set(item.id, {
        name: normalizeBenchmarkText(item.name ?? ""),
        aliases: new Set(
          (item.aliases ?? []).map((alias) => normalizeBenchmarkText(alias)),
        ),
      });
    }
  }
  if (identity.size !== 128) {
    throw new Error(
      `Legacy baseline contains ${identity.size} ids, expected 128.`,
    );
  }
  return identity;
}

export function validateAntiGaming(
  descriptors,
  corpus,
  ledger,
  legacyIdentity = new Map(),
) {
  validateLedger(ledger);
  const ledgerLabels = new Set(
    ledger.records.map((record) =>
      JSON.stringify([record.id, record.language, record.label]),
    ),
  );
  const queryIds = corpus.queries.map((query) => ({
    raw: query.id,
    normalized: normalizeBenchmarkText(query.id),
  }));
  const wholeQueries = corpus.queries.map((query) => ({
    ...query,
    normalized: normalizeBenchmarkText(query.query),
  }));
  const failures = [];

  for (const descriptor of descriptors) {
    for (const language of ["en", "ru"]) {
      const label = descriptor.labels?.[language];
      if (
        typeof label !== "string" ||
        !ledgerLabels.has(JSON.stringify([descriptor.id, language, label]))
      ) {
        failures.push(
          `${descriptor.id}:labels.${language} lacks an exact structured evidence record`,
        );
      }
    }
    for (const leaf of stringLeaves(descriptor)) {
      const normalized = normalizeBenchmarkText(leaf.value);
      for (const queryId of queryIds) {
        if (
          queryId.normalized &&
          normalized.includes(queryId.normalized)
        ) {
          failures.push(
            `${descriptor.id}:${leaf.path.join(".")} contains benchmark id ${queryId.raw}`,
          );
        }
      }
      for (const query of wholeQueries) {
        if (!query.normalized || normalized !== query.normalized) {
          continue;
        }
        const [root, language] = leaf.path;
        const allowedLabel =
          root === "labels" &&
          language === query.language &&
          leaf.value === descriptor.labels?.[query.language] &&
          ledgerLabels.has(
            JSON.stringify([descriptor.id, query.language, leaf.value]),
          );
        const legacy = legacyIdentity.get(descriptor.id);
        const allowedLegacyIdentity =
          (root === "name" && normalized === legacy?.name) ||
          (root === "aliases" && legacy?.aliases.has(normalized));
        if (!allowedLabel && !allowedLegacyIdentity) {
          failures.push(
            `${descriptor.id}:${leaf.path.join(".")} equals whole query ${query.id}`,
          );
        }
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Benchmark anti-gaming checks failed:\n${failures.join("\n")}`);
  }
}

function rankFor(results, acceptedId, pack) {
  const index = results.findIndex(
    (result) => result.id === acceptedId && result.pack === pack,
  );
  return index < 0 ? null : index + 1;
}

function assertCandidateIntegrity(query, results, catalogByQualifiedId, digest) {
  const seen = new Set();
  for (const result of results) {
    const qualifiedId = `${result.pack}:${result.id}`;
    if (result.pack !== query.pack) {
      throw new Error(
        `${query.id} returned cross-pack candidate '${qualifiedId}'.`,
      );
    }
    if (seen.has(qualifiedId)) {
      throw new Error(`${query.id} returned duplicate '${qualifiedId}'.`);
    }
    if (!catalogByQualifiedId.has(qualifiedId)) {
      throw new Error(`${query.id} returned unknown '${qualifiedId}'.`);
    }
    if (result.catalog_sha256 !== digest) {
      throw new Error(
        `${query.id} returned catalog digest '${result.catalog_sha256}', expected '${digest}'.`,
      );
    }
    if (
      typeof result.score !== "number" ||
      result.score <= 0 ||
      !Array.isArray(result.reasons) ||
      result.score !==
        result.reasons.reduce((total, reason) => total + reason.delta, 0)
    ) {
      throw new Error(`${query.id} returned an invalid explained score.`);
    }
    seen.add(qualifiedId);
  }
}

function replayQuery(searchAssets, query) {
  const serializations = [];
  let first = null;
  for (let repeat = 0; repeat < 10; repeat += 1) {
    const results = searchAssets(query.query, {
      packs: [query.pack],
      limit: 5,
    });
    if (!Array.isArray(results)) {
      throw new Error(`${query.id} did not return an array.`);
    }
    if (repeat === 0) {
      first = results;
    }
    serializations.push(JSON.stringify(results));
  }
  if (new Set(serializations).size !== 1) {
    throw new Error(`${query.id} changed ranking across ten repeated calls.`);
  }
  return first;
}

function metricSlice(rows) {
  const rank1 = rows.filter((row) => row.rank === 1).length;
  const rank3 = rows.filter(
    (row) => row.rank !== null && row.rank <= 3,
  ).length;
  const mrrUnits = rows.reduce(
    (sum, row) => sum + (MRR_UNITS[row.rank] ?? 0),
    0,
  );
  return {
    total: rows.length,
    rank_1: rank1,
    rank_3: rank3,
    mrr_units: mrrUnits,
    mrr_max_units: rows.length * 60,
  };
}

export function summarizeRanks(rows) {
  return {
    overall: metricSlice(rows),
    language: Object.fromEntries(
      ["en", "ru"].map((language) => [
        language,
        metricSlice(rows.filter((row) => row.language === language)),
      ]),
    ),
    pack: Object.fromEntries(
      ["core", "trading"].map((pack) => [
        pack,
        metricSlice(rows.filter((row) => row.pack === pack)),
      ]),
    ),
  };
}

export function acceptanceFailures(metrics, latency) {
  const failures = [];
  if (metrics.overall.rank_1 < 36) {
    failures.push(`rank-1 ${metrics.overall.rank_1}/48 is below 36/48`);
  }
  if (metrics.overall.rank_3 < 42) {
    failures.push(`rank-3 ${metrics.overall.rank_3}/48 is below 42/48`);
  }
  if (metrics.overall.mrr_units < 2304) {
    failures.push(
      `MRR@5 units ${metrics.overall.mrr_units}/2880 is below 2304/2880`,
    );
  }
  for (const [dimension, slices] of [
    ["language", metrics.language],
    ["pack", metrics.pack],
  ]) {
    for (const [name, slice] of Object.entries(slices)) {
      if (slice.rank_3 < 20) {
        failures.push(
          `${dimension} ${name} rank-3 ${slice.rank_3}/24 is below 20/24`,
        );
      }
    }
  }
  if (latency.p95_ms > 10) {
    failures.push(`latency p95 ${latency.p95_ms} ms exceeds 10 ms`);
  }
  if (latency.p99_ms > 20) {
    failures.push(`latency p99 ${latency.p99_ms} ms exceeds 20 ms`);
  }
  return failures;
}

function seededShuffle(values, seed) {
  const output = [...values];
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function percentile(samples, fraction) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function measureLatency(searchAssets, queries) {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const query of seededShuffle(queries, 0x51a7_0000 + pass)) {
      searchAssets(query.query, { packs: [query.pack], limit: 5 });
    }
  }

  const passes = [];
  const values = [];
  for (let pass = 0; pass < 20; pass += 1) {
    const samples = [];
    for (const query of seededShuffle(queries, 0x51a7_1000 + pass)) {
      const start = performance.now();
      searchAssets(query.query, { packs: [query.pack], limit: 5 });
      const elapsed = performance.now() - start;
      samples.push({ query_id: query.id, elapsed_ms: elapsed });
      values.push(elapsed);
    }
    passes.push({ pass: pass + 1, samples });
  }
  return {
    warmup_passes: 3,
    measured_passes: 20,
    sample_count: values.length,
    percentile_method: "nearest-rank",
    p95_ms: percentile(values, 0.95),
    p99_ms: percentile(values, 0.99),
    passes,
  };
}

function environmentRecord() {
  const cpuList = cpus();
  const environment = {
    node: process.version,
    v8: process.versions.v8,
    unicode: process.versions.unicode,
    platform: platform(),
    release: release(),
    arch: process.arch,
    cpu_model: cpuList[0]?.model ?? "unknown",
    cpu_count: cpuList.length,
    total_memory_bytes: totalmem(),
  };
  return {
    ...environment,
    sha256: sha256(Buffer.from(JSON.stringify(environment), "utf8")),
  };
}

function packageTreeRecord() {
  const packed = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (packed.status !== 0) {
    throw new Error(`npm pack --dry-run failed:\n${packed.stderr}`);
  }
  const [manifest] = JSON.parse(packed.stdout);
  const files = manifest.files
    .map((entry) => entry.path)
    .sort(codeUnitCompare);
  const hash = createHash("sha256");
  for (const path of files) {
    const bytes = readFileSync(resolve(REPO_ROOT, path));
    hash.update(path, "utf8");
    hash.update("\0");
    hash.update(sha256(bytes), "utf8");
    hash.update("\0");
  }
  return {
    sha256: hash.digest("hex"),
    method: "sorted npm-pack file paths and per-file SHA-256",
    file_count: files.length,
  };
}

function snapshotFields(descriptor) {
  return Object.keys(canonicalDescriptor(descriptor));
}

export function diffCatalogSnapshots(previous, current) {
  const before = new Map(
    (previous?.descriptors ?? []).map((entry) => [
      `${entry.pack}:${entry.descriptor.id}`,
      entry.descriptor,
    ]),
  );
  const after = new Map(
    current.descriptors.map((entry) => [
      `${entry.pack}:${entry.descriptor.id}`,
      entry.descriptor,
    ]),
  );
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort(
    codeUnitCompare,
  );
  const changes = [];
  for (const qualifiedId of keys) {
    const oldDescriptor = before.get(qualifiedId);
    const newDescriptor = after.get(qualifiedId);
    if (!oldDescriptor) {
      changes.push({ qualified_id: qualifiedId, fields: ["$added"] });
      continue;
    }
    if (!newDescriptor) {
      changes.push({ qualified_id: qualifiedId, fields: ["$removed"] });
      continue;
    }
    const fields = [
      ...new Set([
        ...snapshotFields(oldDescriptor),
        ...snapshotFields(newDescriptor),
      ]),
    ]
      .filter(
        (field) =>
          JSON.stringify(oldDescriptor[field]) !==
          JSON.stringify(newDescriptor[field]),
      )
      .sort(codeUnitCompare);
    if (fields.length > 0) {
      changes.push({ qualified_id: qualifiedId, fields });
    }
  }
  return {
    previous_catalog_sha256: previous?.catalog_sha256 ?? null,
    current_catalog_sha256: current.catalog_sha256,
    changes,
  };
}

function assertCatalogSnapshot(snapshot, label) {
  if (
    !snapshot ||
    typeof snapshot.catalog_sha256 !== "string" ||
    !Array.isArray(snapshot.descriptors)
  ) {
    throw new Error(`${label} catalog snapshot has an invalid shape.`);
  }
  const digest = catalogDigest(
    snapshot.descriptors.map((entry) => entry.descriptor),
  );
  if (digest !== snapshot.catalog_sha256) {
    throw new Error(
      `${label} catalog snapshot digest mismatch: expected ${snapshot.catalog_sha256}, got ${digest}.`,
    );
  }
}

function markdownReport(report) {
  const lines = [
    "# Asset search benchmark v1",
    "",
    `Acceptance: **${report.acceptance.passed ? "PASS" : "FAIL"}**`,
    "",
    "This report covers the frozen 48 accepted intents only. It does not establish general semantic-search, weak-model, or visual-quality performance.",
    "",
    "## Retrieval",
    "",
    "| Slice | Queries | Rank 1 | Rank 3 | MRR@5 units |",
    "|---|---:|---:|---:|---:|",
    `| Overall | 48 | ${report.metrics.overall.rank_1}/48 | ${report.metrics.overall.rank_3}/48 | ${report.metrics.overall.mrr_units}/2880 |`,
    ...Object.entries(report.metrics.language).map(
      ([name, metric]) =>
        `| Language ${name} | 24 | ${metric.rank_1}/24 | ${metric.rank_3}/24 | ${metric.mrr_units}/1440 |`,
    ),
    ...Object.entries(report.metrics.pack).map(
      ([name, metric]) =>
        `| Pack ${name} | 24 | ${metric.rank_1}/24 | ${metric.rank_3}/24 | ${metric.mrr_units}/1440 |`,
    ),
    "",
    "Rank 1 = accepted pack-qualified id is first. Rank 3 = accepted id appears in first three. MRR@5 units use exact contributions 60/30/20/15/12/0 for rank 1/2/3/4/5/miss; overall acceptance requires at least 2304/2880.",
    "",
    "## Determinism and integrity",
    "",
    `- Ten-call ranking replay: ${report.determinism.passed ? "byte-identical" : "failed"}.`,
    `- Candidate integrity: ${report.candidate_integrity.passed ? "passed" : "failed"}.`,
    `- Corpus SHA-256: \`${report.hashes.corpus_sha256}\`.`,
    `- Catalog SHA-256: \`${report.hashes.catalog_sha256}\`.`,
    `- Scorer SHA-256: \`${report.hashes.scorer_sha256}\`.`,
    `- Package SHA-256: \`${report.hashes.package_sha256}\`.`,
    `- Environment SHA-256: \`${report.environment.sha256}\`.`,
    "",
    "## Latency",
    "",
    `Three warm-up passes preceded 20 deterministically shuffled passes (${report.latency.sample_count} raw query samples). Nearest-rank p95: ${report.latency.p95_ms} ms; p99: ${report.latency.p99_ms} ms.`,
    "",
    "Latency is evidence for the recorded environment only. Raw unrounded samples remain in `report.json`.",
    "",
    "## Catalog changes",
    "",
  ];
  if (report.catalog_diff === null) {
    lines.push("No earlier catalog snapshot was available; this is the first scored catalog.");
  } else if (report.catalog_diff.changes.length === 0) {
    lines.push("No descriptor fields changed from the previous scored catalog.");
  } else {
    for (const change of report.catalog_diff.changes) {
      lines.push(`- \`${change.qualified_id}\`: ${change.fields.join(", ")}`);
    }
  }
  if (report.acceptance.failures.length > 0) {
    lines.push("", "## Failed gates", "");
    for (const failure of report.acceptance.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    runtimeModule: DEFAULT_RUNTIME_MODULE,
    scorerFile: DEFAULT_SCORER_FILE,
    ledger: DEFAULT_LEDGER,
    legacyBaseline: DEFAULT_LEGACY_BASELINE,
    baseline: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--out", "--module", "--scorer-file", "--ledger", "--legacy-baseline", "--baseline"].includes(flag)) {
      throw new Error(
        "Usage: benchmark-asset-search.mjs [--out DIR] [--module FILE] [--scorer-file FILE] [--ledger FILE] [--legacy-baseline DIR] [--baseline FILE]",
      );
    }
    options[
      {
        "--out": "outDir",
        "--module": "runtimeModule",
        "--scorer-file": "scorerFile",
        "--ledger": "ledger",
        "--legacy-baseline": "legacyBaseline",
        "--baseline": "baseline",
      }[flag]
    ] = resolve(REPO_ROOT, value);
    index += 1;
  }
  return options;
}

export async function runBenchmark(options) {
  const { corpus, sha256: corpusSha256 } = loadFrozenCorpus();
  if (!existsSync(options.runtimeModule)) {
    throw new Error(
      `Runtime module '${relative(REPO_ROOT, options.runtimeModule)}' is missing; run npm run build first.`,
    );
  }
  const runtime = await import(
    `${pathToFileURL(options.runtimeModule).href}?benchmark=${Date.now()}`
  );
  if (
    typeof runtime.searchAssets !== "function" ||
    typeof runtime.getAssetDescriptor !== "function" ||
    typeof runtime.AssetRegistry?.bundled !== "function"
  ) {
    throw new Error(
      "Runtime module must export searchAssets, getAssetDescriptor, and AssetRegistry.",
    );
  }

  const snapshotEntries = [];
  const catalogByQualifiedId = new Map();
  for (const pack of corpus.packs) {
    const ids = runtime.AssetRegistry.bundled(pack).ids();
    if (ids.length !== 64) {
      throw new Error(`Bundled pack '${pack}' has ${ids.length} ids, expected 64.`);
    }
    for (const id of ids) {
      const descriptor = runtime.getAssetDescriptor(pack, id);
      if (descriptor.id !== id) {
        throw new Error(`Descriptor lookup '${pack}:${id}' returned '${descriptor.id}'.`);
      }
      const canonical = canonicalDescriptor(descriptor);
      snapshotEntries.push({ pack, descriptor: canonical });
      catalogByQualifiedId.set(`${pack}:${id}`, canonical);
    }
  }
  if (catalogByQualifiedId.size !== 128) {
    throw new Error(
      `Combined catalog has ${catalogByQualifiedId.size} qualified ids, expected 128.`,
    );
  }
  for (const query of corpus.queries) {
    runtime.getAssetDescriptor(query.pack, query.acceptedId);
  }

  const descriptors = snapshotEntries.map((entry) => entry.descriptor);
  const digest = catalogDigest(descriptors);
  const ledger = JSON.parse(readFileSync(options.ledger, "utf8"));
  const legacyIdentity = loadLegacyIdentity(
    options.legacyBaseline,
    corpus.packs,
  );
  validateAntiGaming(descriptors, corpus, ledger, legacyIdentity);

  const rows = corpus.queries.map((query) => {
    const results = replayQuery(runtime.searchAssets, query);
    assertCandidateIntegrity(query, results, catalogByQualifiedId, digest);
    return {
      id: query.id,
      language: query.language,
      pack: query.pack,
      query: query.query,
      accepted_id: query.acceptedId,
      rank: rankFor(results, query.acceptedId, query.pack),
      candidates: results,
    };
  });
  const metrics = summarizeRanks(rows);
  const latency = measureLatency(runtime.searchAssets, corpus.queries);
  const failures = acceptanceFailures(metrics, latency);
  const environment = environmentRecord();
  const packageTree = packageTreeRecord();
  const scorerSha256 = sha256(readFileSync(options.scorerFile));
  const snapshot = {
    catalog_sha256: digest,
    descriptors: snapshotEntries.sort((left, right) =>
      codeUnitCompare(left.descriptor.id, right.descriptor.id),
    ),
  };
  const firstScoredBaselinePath = resolve(
    dirname(options.outDir),
    "baseline-catalog.json",
  );
  const previousSnapshotPath =
    options.baseline ??
    (existsSync(firstScoredBaselinePath)
      ? firstScoredBaselinePath
      : null);
  const previousSnapshot = previousSnapshotPath
    ? JSON.parse(readFileSync(previousSnapshotPath, "utf8"))
    : null;
  if (previousSnapshot) {
    assertCatalogSnapshot(previousSnapshot, "Previous");
  }
  assertCatalogSnapshot(snapshot, "Current");
  const catalogDiff = previousSnapshot
    ? diffCatalogSnapshots(previousSnapshot, snapshot)
    : null;
  if (
    catalogDiff &&
    catalogDiff.previous_catalog_sha256 !== digest &&
    catalogDiff.changes.length === 0
  ) {
    throw new Error("Catalog digest changed without a descriptor field diff.");
  }

  const report = {
    schema_version: 1,
    benchmark: "asset-search/v1",
    scope:
      "48 frozen accepted intents across English/Russian and core/trading; not a general semantic-search, weak-model, or visual-quality benchmark",
    hashes: {
      corpus_sha256: corpusSha256,
      catalog_sha256: digest,
      scorer_id: SCORER_ID,
      scorer_sha256: scorerSha256,
      package_sha256: packageTree.sha256,
      package_hash_method: packageTree.method,
      package_file_count: packageTree.file_count,
    },
    environment,
    metrics,
    determinism: { repeats_per_query: 10, passed: true },
    candidate_integrity: { passed: true },
    anti_gaming: {
      passed: true,
      evidence_ledger: relative(REPO_ROOT, options.ledger),
      legacy_identity_baseline: relative(
        REPO_ROOT,
        options.legacyBaseline,
      ),
    },
    latency,
    catalog_diff: catalogDiff,
    queries: rows,
    acceptance: {
      passed: failures.length === 0,
      failures,
    },
  };

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(
    resolve(options.outDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(options.outDir, "report.md"),
    markdownReport(report),
    "utf8",
  );
  writeFileSync(
    resolve(options.outDir, "catalog-snapshot.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  if (!existsSync(firstScoredBaselinePath)) {
    writeFileSync(
      firstScoredBaselinePath,
      `${JSON.stringify(snapshot)}\n`,
      "utf8",
    );
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBenchmark(options);
  console.log(
    `asset-search benchmark ${report.acceptance.passed ? "PASS" : "FAIL"}: ${report.metrics.overall.rank_1}/48 rank-1, ${report.metrics.overall.rank_3}/48 rank-3, ${report.metrics.overall.mrr_units}/2880 MRR@5 units`,
  );
  if (!report.acceptance.passed) {
    for (const failure of report.acceptance.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
