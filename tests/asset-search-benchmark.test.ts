import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORER_FILE,
  acceptanceFailures,
  diffCatalogSnapshots,
  loadFrozenCorpus,
  summarizeRanks,
  validateAntiGaming,
} from "../scripts/benchmark-asset-search.mjs";

const CORPUS_PATH = resolve(
  "tests/fixtures/asset-search/v1/benchmark.json",
);
const CORPUS_SHA256 =
  "c721577bdffc3062ac4f120409d1fbfabb4cb3374e37e56081aa182f76c01fd6";

function evidenceLedger(label = "Independent label") {
  return {
    schema_version: 1,
    catalog_schema_version: 2,
    taxonomy_version: 1,
    records: Array.from({ length: 256 }, (_, index) => ({
      id: index < 2 ? "asset" : `other-${Math.floor(index / 2)}`,
      language: index % 2 === 0 ? "en" : "ru",
      label:
        index === 0
          ? label
          : index === 1
            ? "Независимая метка"
            : `Other ${index}`,
      grounded_fields: [
        "labels",
        "descriptions",
        "categories",
        "domains",
        "keywords",
        "synonyms",
        "negative_keywords",
        "visual_kind",
      ],
      sources: [{ kind: "id-name", ref: "asset" }],
    })),
  };
}

describe("frozen asset-search benchmark", () => {
  it("hashes the actual scorer implementation instead of its API wrapper", () => {
    expect(DEFAULT_SCORER_FILE).toMatch(/dist\/asset-catalog\.js$/u);
  });

  it("preserves exact accepted bytes and balanced 48-query shape", () => {
    const bytes = readFileSync(CORPUS_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      CORPUS_SHA256,
    );

    const loaded = loadFrozenCorpus(CORPUS_PATH);
    expect(loaded.corpus.queries).toHaveLength(48);
    expect(
      loaded.corpus.queries.filter(
        (query: { language: string }) => query.language === "en",
      ),
    ).toHaveLength(24);
    expect(
      loaded.corpus.queries.filter(
        (query: { pack: string }) => query.pack === "trading",
      ),
    ).toHaveLength(24);
  });

  it("keeps catalog generation independent from benchmark inputs", () => {
    for (const path of [
      "scripts/generate-asset-catalog.ts",
      "scripts/generate-asset-catalog.mjs",
      "scripts/generate-asset-catalog.bootstrap.mjs",
    ]) {
      if (!existsSync(path)) {
        continue;
      }
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("tests/fixtures/asset-search");
      expect(source).not.toContain("asset-benchmark/v1/benchmark.json");
      expect(source).not.toContain("benchmark-asset-search");
    }
  });

  it("uses exact integer MRR and conjunctive subset gates", () => {
    const rows = ["core", "trading"].flatMap((pack) =>
      ["en", "ru"].flatMap((language) =>
        Array.from({ length: 12 }, (_, index) => ({
          pack,
          language,
          rank: index < 9 ? 1 : index < 11 ? 2 : null,
        })),
      ),
    );
    const metrics = summarizeRanks(rows);

    expect(metrics.overall).toMatchObject({
      rank_1: 36,
      rank_3: 44,
      mrr_units: 2400,
      mrr_max_units: 2880,
    });
    expect(
      acceptanceFailures(metrics, { p95_ms: 10, p99_ms: 20 }),
    ).toEqual([]);

    metrics.language.ru.rank_3 = 19;
    expect(
      acceptanceFailures(metrics, { p95_ms: 10, p99_ms: 20 }),
    ).toContain("language ru rank-3 19/24 is below 20/24");
  });

  it("rejects benchmark text outside independently grounded labels", () => {
    const corpus = {
      queries: [
        {
          id: "core-en-01",
          language: "en",
          query: "Independent label",
        },
      ],
    };
    const labelDescriptor = {
      id: "asset",
      labels: { en: "Independent label", ru: "Независимая метка" },
      synonyms: { en: ["separate term"], ru: [] },
    };
    expect(() =>
      validateAntiGaming(
        [labelDescriptor],
        corpus,
        evidenceLedger("Independent label"),
      ),
    ).not.toThrow();

    expect(() =>
      validateAntiGaming(
        [
          {
            ...labelDescriptor,
            labels: { en: "Asset", ru: "Ресурс" },
            synonyms: { en: ["Independent label"], ru: [] },
          },
        ],
        corpus,
        evidenceLedger("Asset"),
      ),
    ).toThrow(/equals whole query core-en-01/);
  });

  it("allows only byte-frozen legacy name and alias query witnesses", () => {
    const corpus = {
      queries: [
        {
          id: "core-en-08",
          language: "en",
          query: "monitoring dashboard",
        },
      ],
    };
    const descriptor = {
      id: "asset",
      name: "monitoring_dashboard",
      aliases: ["monitoring_dashboard"],
      labels: { en: "Monitoring", ru: "Мониторинг" },
    };
    const ledger = evidenceLedger("Monitoring");
    ledger.records[1].label = "Мониторинг";
    const legacyIdentity = new Map([
      [
        "asset",
        {
          name: "monitoring dashboard",
          aliases: new Set(["monitoring dashboard"]),
        },
      ],
    ]);

    expect(() =>
      validateAntiGaming(
        [descriptor],
        corpus,
        ledger,
        legacyIdentity,
      ),
    ).not.toThrow();
    expect(() =>
      validateAntiGaming(
        [{ ...descriptor, aliases: ["monitoring-dashboard", "new alias"] }],
        {
          queries: [
            {
              id: "core-en-08",
              language: "en",
              query: "new alias",
            },
          ],
        },
        ledger,
        legacyIdentity,
      ),
    ).toThrow(/equals whole query core-en-08/);
  });

  it("lists exact changed ids and top-level fields after first scoring", () => {
    const before = {
      catalog_sha256: "before",
      descriptors: [
        {
          pack: "core",
          descriptor: {
            id: "asset",
            labels: { en: "Before", ru: "До" },
            keywords: { en: [], ru: [] },
          },
        },
      ],
    };
    const after = {
      catalog_sha256: "after",
      descriptors: [
        {
          pack: "core",
          descriptor: {
            id: "asset",
            labels: { en: "After", ru: "После" },
            keywords: { en: ["changed"], ru: [] },
          },
        },
      ],
    };

    expect(diffCatalogSnapshots(before, after).changes).toEqual([
      {
        qualified_id: "core:asset",
        fields: ["keywords", "labels"],
      },
    ]);
  });
});
