import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";
import {
  AssetRegistry,
  bundledManifest,
  getAssetDescriptor,
  searchAssets,
} from "../src/assets.js";
import * as assetsApi from "../src/assets.js";
import {
  catalogSha256,
  normalizeAssetSearchText,
  parseAssetManifest,
  searchAssetCatalog,
  validateBundledCatalog,
} from "../src/asset-catalog.js";
import type {
  AssetCatalogEntry,
  AssetDescriptor,
  AssetManifestItem,
  AssetSearchReason,
  BundledAssetPack,
  ParsedAssetManifest,
} from "../src/asset-catalog.js";

const CATALOG_DIGEST = "a".repeat(64);

function descriptor(
  overrides: Partial<AssetDescriptor> = {},
): AssetDescriptor {
  const group = overrides.group ?? "fixtures";
  const name = overrides.name ?? "alpha";
  const code = overrides.code ?? "99-01";
  const id = overrides.id ?? `${group}_${name}_${code}`;
  return {
    id,
    name,
    filename: overrides.filename ?? `${id}.svg`,
    code,
    group,
    group_index: 99,
    icon_index: 1,
    viewBox: "0 0 32 32",
    colors: ["#000000"],
    aliases: ["base-alias"],
    labels: { en: "Base glyph", ru: "Базовый знак" },
    descriptions: {
      en: "Default catalog description",
      ru: "Стандартное описание каталога",
    },
    categories: ["other"],
    domains: ["general"],
    keywords: { en: ["baseline"], ru: ["база"] },
    synonyms: { en: ["ordinary"], ru: ["обычный"] },
    negative_keywords: { en: [], ru: [] },
    visual_kind: "other",
    provenance: {
      source_kind: "project-authored",
      source_ref: "assets/PROVENANCE.md",
      license_spdx: "MIT",
      svg_sha256: "0".repeat(64),
    },
    ...overrides,
  };
}

function entry(
  id: string,
  overrides: Partial<AssetDescriptor> = {},
  pack: BundledAssetPack = "core",
): AssetCatalogEntry {
  return {
    pack,
    descriptor: descriptor({
      id,
      filename: `${id}.svg`,
      ...overrides,
    }),
  };
}

function searchOne(
  query: string,
  asset: AssetCatalogEntry,
): { score: number; reasons: AssetSearchReason[] } {
  const [result] = searchAssetCatalog(query, [asset], CATALOG_DIGEST);
  if (!result) {
    throw new Error(`Expected '${asset.descriptor.id}' to match '${query}'.`);
  }
  return result;
}

function manifests(
  core: readonly AssetDescriptor[],
  trading: readonly AssetDescriptor[],
): Record<BundledAssetPack, ParsedAssetManifest> {
  return {
    core: {
      schema_version: 2,
      taxonomy_version: 1,
      pack: "core",
      assets: [...core],
    },
    trading: {
      schema_version: 2,
      taxonomy_version: 1,
      pack: "trading",
      assets: [...trading],
    },
  };
}

function packDescriptors(
  pack: BundledAssetPack,
  count = 64,
): AssetDescriptor[] {
  return Array.from({ length: count }, (_, index) => {
    const name = `item${String(index + 1).padStart(2, "0")}`;
    const code = `99-${String(index + 1).padStart(2, "0")}`;
    const id = `${pack}_${name}_${code}`;
    return descriptor({
      id,
      filename: `${id}.svg`,
      group: pack,
      name,
      code,
      aliases: [],
    });
  });
}

function runAssetsCli(args: readonly string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/bin/excalidraw-assets.ts", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}

describe("asset manifest compatibility", () => {
  it("parses legacy v1 arrays without inventing descriptor fields", () => {
    const legacy: AssetManifestItem = {
      id: "agents_robot_agent_01-01",
      name: "robot_agent",
      filename: "agents_robot_agent_01-01.svg",
      code: "01-01",
      group: "agents",
      group_index: 1,
      icon_index: 1,
      viewBox: "0 0 32 32",
      colors: ["#4c6ef5"],
      aliases: ["robot"],
    };

    expect(parseAssetManifest([legacy], "core")).toEqual({
      schema_version: 1,
      taxonomy_version: null,
      pack: "core",
      assets: [legacy],
    });
  });

  it("parses v2 envelopes and rejects incompatible pack and identity metadata", () => {
    const item = descriptor();
    const raw = {
      schema_version: 2,
      taxonomy_version: 1,
      pack: "core",
      assets: [item],
    };

    expect(parseAssetManifest(raw, "core")).toEqual(raw);
    expect(() => parseAssetManifest(raw, "trading")).toThrow(
      /manifest\.pack must be 'trading'/,
    );
    expect(() => parseAssetManifest({
      ...raw,
      assets: [{ ...item, id: "wrong" }],
    }, "core")).toThrow(/id must equal group/);
    expect(() => parseAssetManifest({
      ...raw,
      assets: [{ ...item, filename: "../alpha.svg" }],
    }, "core")).toThrow(/safe relative SVG filename/);
  });

  it("rejects unknown v2 envelope, descriptor, localized, and provenance keys", () => {
    const item = descriptor();
    const raw = {
      schema_version: 2,
      taxonomy_version: 1,
      pack: "core",
      assets: [item],
    };
    const cases = [
      { ...raw, unexpected: true },
      { ...raw, assets: [{ ...item, unexpected: true }] },
      {
        ...raw,
        assets: [{
          ...item,
          labels: { ...item.labels, unexpected: "value" },
        }],
      },
      {
        ...raw,
        assets: [{
          ...item,
          provenance: { ...item.provenance, unexpected: "value" },
        }],
      },
    ];

    for (const invalid of cases) {
      expect(() => parseAssetManifest(invalid, "core")).toThrow(/unknown key/);
    }
  });

  it("loads both v1 and v2 manifests through the exact registry path", () => {
    const root = mkdtempSync(join(tmpdir(), "asset-search-manifests-"));
    const svgPath = join(root, "fixtures_alpha_99-01.svg");
    writeFileSync(svgPath, "<svg xmlns='http://www.w3.org/2000/svg'/>", "utf8");

    const item = descriptor();
    const legacyPath = join(root, "manifest-v1.json");
    const v2Path = join(root, "manifest-v2.json");
    writeFileSync(legacyPath, JSON.stringify([{
      id: item.id,
      name: item.name,
      filename: item.filename,
      code: item.code,
      group: item.group,
      group_index: item.group_index,
      icon_index: item.icon_index,
      viewBox: item.viewBox,
      colors: item.colors,
      aliases: item.aliases,
    }]), "utf8");
    writeFileSync(v2Path, JSON.stringify({
      schema_version: 2,
      taxonomy_version: 1,
      pack: "core",
      assets: [item],
    }), "utf8");

    const legacy = AssetRegistry.fromManifest(legacyPath, root);
    const current = AssetRegistry.fromManifest(v2Path, root);
    expect(legacy.ids()).toEqual([item.id]);
    expect(current.ids()).toEqual(legacy.ids());
    expect(current.resolve("base-alias").id).toBe(item.id);
    expect(current.describe(item.id)).toEqual(legacy.describe(item.id));
  });

  it("rejects collisions between explicit and synthesized aliases", () => {
    const first = descriptor({
      group: "fixtures",
      name: "shared",
      code: "99-01",
      id: "fixtures_shared_99-01",
      filename: "fixtures_shared_99-01.svg",
      aliases: [],
    });
    const second = descriptor({
      group: "fixtures",
      name: "other",
      code: "99-02",
      id: "fixtures_other_99-02",
      filename: "fixtures_other_99-02.svg",
      aliases: ["shared"],
    });
    const core = packDescriptors("core");
    core.splice(0, 2, first, second);
    const trading = packDescriptors("trading");

    expect(() => validateBundledCatalog(
      manifests(core, trading),
    )).toThrow(/resolver alias 'shared'/);
  });

  it("rejects cross-item resolver collisions through v2 fromManifest", () => {
    const root = mkdtempSync(join(tmpdir(), "asset-search-collision-"));
    const first = descriptor({
      group: "fixtures",
      name: "shared",
      code: "99-01",
      id: "fixtures_shared_99-01",
      filename: "fixtures_shared_99-01.svg",
      aliases: [],
    });
    const second = descriptor({
      group: "fixtures",
      name: "other",
      code: "99-02",
      id: "fixtures_other_99-02",
      filename: "fixtures_other_99-02.svg",
      aliases: ["shared"],
    });
    const path = join(root, "manifest.json");
    writeFileSync(path, JSON.stringify({
      schema_version: 2,
      taxonomy_version: 1,
      pack: "core",
      assets: [first, second],
    }), "utf8");

    expect(() => AssetRegistry.fromManifest(path, root)).toThrow(
      /resolver alias 'shared'/,
    );
  });
});

describe("asset search normalization and scoring", () => {
  it("normalizes NFKC, case, separators, Unicode tokens, and whitespace", () => {
    expect(normalizeAssetSearchText("  ＶＥＣＴＯＲ_DB/Поиск—42  ")).toBe(
      "vector db поиск 42",
    );
    expect(normalizeAssetSearchText("---")).toBe("");
  });

  const fieldCases: Array<{
    field: string;
    exact: number;
    prefix: number;
    edit1: number;
    matched: string;
    overrides: Partial<AssetDescriptor>;
  }> = [
    {
      field: "labels.en",
      exact: 80,
      prefix: 40,
      edit1: 20,
      matched: "needle",
      overrides: { labels: { en: "needle", ru: "Базовый знак" } },
    },
    {
      field: "name",
      exact: 80,
      prefix: 40,
      edit1: 20,
      matched: "needle",
      overrides: { name: "needle" },
    },
    {
      field: "aliases",
      exact: 80,
      prefix: 40,
      edit1: 20,
      matched: "needle",
      overrides: { aliases: ["needle"] },
    },
    {
      field: "synonyms.en",
      exact: 70,
      prefix: 35,
      edit1: 18,
      matched: "needle",
      overrides: { synonyms: { en: ["needle"], ru: ["обычный"] } },
    },
    {
      field: "keywords.en",
      exact: 50,
      prefix: 25,
      edit1: 12,
      matched: "needle",
      overrides: { keywords: { en: ["needle"], ru: ["база"] } },
    },
    {
      field: "categories",
      exact: 35,
      prefix: 18,
      edit1: 9,
      matched: "security",
      overrides: { categories: ["security"] },
    },
    {
      field: "domains",
      exact: 35,
      prefix: 18,
      edit1: 9,
      matched: "operations",
      overrides: { domains: ["operations"] },
    },
    {
      field: "descriptions.en",
      exact: 15,
      prefix: 8,
      edit1: 4,
      matched: "needle",
      overrides: {
        descriptions: {
          en: "needle",
          ru: "Стандартное описание каталога",
        },
      },
    },
    {
      field: "group",
      exact: 10,
      prefix: 5,
      edit1: 2,
      matched: "needle",
      overrides: { group: "needle" },
    },
    {
      field: "visual_kind",
      exact: 10,
      prefix: 5,
      edit1: 2,
      matched: "service",
      overrides: { visual_kind: "service" },
    },
  ];

  for (const item of fieldCases) {
    it(`applies exact/prefix/edit1 weights for ${item.field}`, () => {
      const asset = entry(`weight_${item.field}`, item.overrides);
      const edited = `${item.matched.slice(0, -1)}x`;
      const cases = [
        {
          query: `${item.matched} unmatched`,
          match: "exact",
          delta: item.exact,
        },
        {
          query: `${item.matched}s unmatched`,
          match: "prefix",
          delta: item.prefix,
        },
        {
          query: `${edited} unmatched`,
          match: "edit1",
          delta: item.edit1,
        },
      ] as const;

      for (const expected of cases) {
        const result = searchOne(expected.query, asset);
        expect(result.score).toBe(expected.delta);
        expect(result.reasons).toEqual([expect.objectContaining({
          field: item.field,
          query_term: expected.query.split(" ")[0],
          matched_term: item.matched,
          match: expected.match,
          delta: expected.delta,
        })]);
      }
    });
  }

  it("adds one whole-id or alias bonus and one eligible phrase bonus", () => {
    const idAsset = entry("agents_tool_call_01-02", {
      name: "unrelated",
      aliases: [],
    });
    const idResult = searchOne("AGENTS/TOOL-CALL/01-02", idAsset);
    expect(idResult.reasons.filter(({ delta }) => delta === 10_000)).toEqual([
      expect.objectContaining({ field: "id", match: "exact" }),
    ]);

    const aliasAsset = entry("alias-target", {
      name: "unrelated",
      aliases: ["operator:gate"],
    });
    const aliasResult = searchOne("operator gate", aliasAsset);
    expect(aliasResult.reasons.filter(({ delta }) => delta === 10_000)).toEqual([
      expect.objectContaining({ field: "alias", match: "exact" }),
    ]);

    const phraseAsset = entry("phrase-target", {
      labels: { en: "Human Approval", ru: "Одобрение человеком" },
    });
    const phraseResult = searchOne("HUMAN-APPROVAL", phraseAsset);
    expect(phraseResult.reasons.filter(({ match }) => match === "phrase")).toEqual([
      expect.objectContaining({
        field: "labels.en",
        query_term: "human approval",
        matched_term: "human approval",
        delta: 100,
      }),
    ]);
  });

  it("uses symmetric prefix matching with a four-code-point lower bound", () => {
    const asset = entry("prefix-bounds", {
      keywords: { en: ["vector"], ru: ["база"] },
    });

    expect(searchOne("vectors unmatched", asset).reasons).toEqual([
      expect.objectContaining({
        field: "keywords.en",
        query_term: "vectors",
        matched_term: "vector",
        match: "prefix",
        delta: 25,
      }),
    ]);
    expect(searchOne("vect unmatched", asset).reasons).toEqual([
      expect.objectContaining({
        field: "keywords.en",
        query_term: "vect",
        matched_term: "vector",
        match: "prefix",
        delta: 25,
      }),
    ]);
    expect(searchAssetCatalog(
      "vec unmatched",
      [asset],
      CATALOG_DIGEST,
    )).toEqual([]);
  });

  it("limits edit1 to same-script non-numeric tokens of at least five code points", () => {
    const latin = entry("edit-latin", {
      keywords: { en: ["vector"], ru: ["база"] },
    });
    expect(searchOne("vectxr unmatched", latin).reasons).toEqual([
      expect.objectContaining({
        field: "keywords.en",
        query_term: "vectxr",
        matched_term: "vector",
        match: "edit1",
        delta: 12,
      }),
    ]);

    const cyrillic = entry("edit-cyrillic", {
      keywords: { en: ["baseline"], ru: ["модель"] },
    });
    expect(searchOne("моделъ unmatched", cyrillic).reasons).toEqual([
      expect.objectContaining({
        field: "keywords.ru",
        query_term: "моделъ",
        matched_term: "модель",
        match: "edit1",
        delta: 12,
      }),
    ]);

    const rejected = [
      {
        query: "vеctor unmatched",
        asset: latin,
      },
      {
        query: "12346 unmatched",
        asset: entry("edit-numeric", {
          keywords: { en: ["12345"], ru: ["база"] },
        }),
      },
      {
        query: "abcx unmatched",
        asset: entry("edit-short", {
          keywords: { en: ["abcd"], ru: ["база"] },
        }),
      },
    ];
    for (const item of rejected) {
      expect(searchAssetCatalog(
        item.query,
        [item.asset],
        CATALOG_DIGEST,
      )).toEqual([]);
    }
  });

  it("chooses only the best field witness for each distinct query token", () => {
    const result = searchOne("needle needle", entry("best-witness", {
      labels: { en: "needle", ru: "Базовый знак" },
      synonyms: { en: ["needle"], ru: ["обычный"] },
      keywords: { en: ["needle"], ru: ["база"] },
      descriptions: {
        en: "needle",
        ru: "Стандартное описание каталога",
      },
    }));

    expect(result.score).toBe(80);
    expect(result.reasons).toEqual([expect.objectContaining({
      field: "labels.en",
      query_term: "needle",
      delta: 80,
    })]);
  });

  it("applies de-duplicated exact single and contiguous multi-token negatives", () => {
    const result = searchOne("danger zone needle", entry("negative", {
      labels: { en: "danger zone needle", ru: "Базовый знак" },
      negative_keywords: {
        en: ["danger zone", "danger zone"],
        ru: ["danger zone"],
      },
    }));
    expect(result.score).toBe(240);
    expect(result.reasons.filter(({ match }) => match === "negative")).toEqual([
      expect.objectContaining({
        query_term: "danger zone",
        matched_term: "danger zone",
        delta: -100,
      }),
    ]);

    const prefixOnly = searchOne("dangers needle", entry("negative-prefix", {
      labels: { en: "needle", ru: "Базовый знак" },
      negative_keywords: { en: ["danger"], ru: [] },
    }));
    expect(prefixOnly.reasons.some(({ match }) => match === "negative")).toBe(false);

    const nonContiguous = searchOne(
      "danger needle zone",
      entry("negative-non-contiguous", {
        labels: { en: "needle", ru: "Базовый знак" },
        negative_keywords: { en: ["danger zone"], ru: [] },
      }),
    );
    expect(nonContiguous.reasons.some(({ match }) => match === "negative")).toBe(
      false,
    );
  });

  it("filters candidates whose positive and negative total is not positive", () => {
    const results = searchAssetCatalog("needle", [entry("cancelled", {
      labels: { en: "needle", ru: "Базовый знак" },
      negative_keywords: { en: ["needle"], ru: [] },
    })], CATALOG_DIGEST);
    expect(results).toEqual([]);
  });

  it("sorts by score, exact class, matched-token count, then id", () => {
    const exactId = entry("shared", {
      name: "unrelated",
      aliases: [],
      labels: { en: "shared", ru: "Базовый знак" },
    });
    const exactAlias = entry("alias-candidate", {
      name: "unrelated",
      aliases: ["shared"],
    });
    expect(searchAssetCatalog(
      "shared",
      [exactAlias, exactId],
      CATALOG_DIGEST,
    ).map(({ id }) => id)).toEqual(["shared", "alias-candidate"]);

    const oneMatched = entry("one-matched", {
      labels: { en: "alpha", ru: "Базовый знак" },
    });
    const twoMatched = entry("two-matched", {
      labels: { en: "alphaz", ru: "Базовый знак" },
      name: "betaz",
    });
    expect(searchAssetCatalog(
      "alphas betas",
      [oneMatched, twoMatched],
      CATALOG_DIGEST,
    ).map(({ id }) => id)).toEqual(["two-matched", "one-matched"]);

    const idTie = [
      entry("z-last", { labels: { en: "needle", ru: "Базовый знак" } }),
      entry("a-first", { labels: { en: "needle", ru: "Базовый знак" } }),
    ];
    expect(searchAssetCatalog(
      "needle",
      idTie,
      CATALOG_DIGEST,
    ).map(({ id }) => id)).toEqual(["a-first", "z-last"]);
  });

  it("sorts reasons deterministically by delta, field, and terms", () => {
    const result = searchOne("beta alpha synonym keyword", entry("reasons", {
      labels: { en: "beta alpha", ru: "Базовый знак" },
      synonyms: { en: ["synonym"], ru: ["обычный"] },
      keywords: { en: ["keyword"], ru: ["база"] },
    }));

    expect(result.reasons.map((item) => [
      item.delta,
      item.field,
      item.query_term,
    ])).toEqual([
      [80, "labels.en", "alpha"],
      [80, "labels.en", "beta"],
      [70, "synonyms.en", "synonym"],
      [50, "keywords.en", "keyword"],
    ]);
    expect(result.score).toBe(
      result.reasons.reduce((sum, reason) => sum + reason.delta, 0),
    );
  });

  it("handles pack filters, defaults, limits, and invalid options explicitly", () => {
    const entries = Array.from({ length: 7 }, (_, index) => entry(
      `asset-${index}`,
      { labels: { en: "needle", ru: "Базовый знак" } },
      index % 2 === 0 ? "core" : "trading",
    ));

    expect(searchAssetCatalog("needle", entries, CATALOG_DIGEST)).toHaveLength(5);
    expect(searchAssetCatalog("needle", entries, CATALOG_DIGEST, {
      packs: "all",
      limit: 10,
    })).toHaveLength(7);
    expect(searchAssetCatalog("needle", entries, CATALOG_DIGEST, {
      packs: ["core", "core"],
      limit: 10,
    }).every(({ pack }) => pack === "core")).toBe(true);
    expect(searchAssetCatalog("---", entries, CATALOG_DIGEST)).toEqual([]);
    expect(() => searchAssetCatalog("needle", entries, CATALOG_DIGEST, {
      packs: [],
    })).toThrow(/non-empty array/);
    expect(() => searchAssetCatalog("needle", entries, CATALOG_DIGEST, {
      packs: ["unknown" as BundledAssetPack],
    })).toThrow(/Unknown asset pack 'unknown'/);
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => searchAssetCatalog(
        "needle",
        entries,
        CATALOG_DIGEST,
        { limit },
      )).toThrow(/positive integer/);
    }
  });

  it("produces byte-identical output and avoids locale-sensitive APIs", () => {
    const entries = [
      entry("deterministic-b", {
        labels: { en: "needle", ru: "Базовый знак" },
      }),
      entry("deterministic-a", {
        labels: { en: "needle", ru: "Базовый знак" },
      }),
    ];
    const outputs = Array.from({ length: 10 }, () => JSON.stringify(
      searchAssetCatalog("NEEDLE", entries, CATALOG_DIGEST),
    ));
    expect(new Set(outputs)).toEqual(new Set([outputs[0]]));

    const source = readFileSync(
      join(process.cwd(), "src", "asset-catalog.ts"),
      "utf8",
    );
    expect(source).not.toContain("localeCompare(");
    expect(source).not.toContain("Intl.");
  });

  it("computes an order-invariant but descriptor-sensitive catalog digest", () => {
    const alpha = descriptor({
      id: "fixtures_alpha_99-01",
      filename: "fixtures_alpha_99-01.svg",
    });
    const beta = descriptor({
      id: "fixtures_beta_99-02",
      filename: "fixtures_beta_99-02.svg",
      name: "beta",
      code: "99-02",
    });
    const forward = catalogSha256([alpha, beta]);
    const reverse = catalogSha256([beta, alpha]);
    const changed = catalogSha256([
      alpha,
      {
        ...beta,
        descriptions: {
          ...beta.descriptions,
          en: "Changed truthful description",
        },
      },
    ]);

    expect(forward).toMatch(/^[0-9a-f]{64}$/);
    expect(reverse).toBe(forward);
    expect(changed).not.toBe(forward);
  });
});

describe("bundled and public asset search", () => {
  it("preserves the complete legacy manifest projection for both packs", () => {
    for (const pack of ["core", "trading"] as const) {
      const baseline = JSON.parse(readFileSync(
        join(
          process.cwd(),
          "catalog-review",
          "assets",
          "v1",
          "baseline",
          `${pack}-manifest-v1.json`,
        ),
        "utf8",
      ));
      expect(bundledManifest(pack)).toEqual(baseline);
    }
  });

  it("keeps exact registry aliases while exposing descriptors and search", () => {
    const registry = AssetRegistry.bundled();
    expect(registry.resolve("robot_agent").id).toBe(
      "agents_robot_agent_01-01",
    );
    expect(registry.resolve("01-01").id).toBe(
      "agents_robot_agent_01-01",
    );

    const descriptorValue = getAssetDescriptor(
      "core",
      "agents_human_review_01-25",
    );
    expect(descriptorValue.labels.en).toBe("Human Review");
    expect(descriptorValue.labels.ru).toBeTruthy();

    const allResults = searchAssets("human approval", { limit: 3 });
    const coreResults = searchAssets("human approval", {
      packs: ["core"],
      limit: 3,
    });
    expect(allResults[0]).toEqual(expect.objectContaining({
      id: "agents_human_review_01-25",
      pack: "core",
    }));
    expect(coreResults[0]?.catalog_sha256).toBe(
      allResults[0]?.catalog_sha256,
    );
    expect(() => getAssetDescriptor("core", "missing")).toThrow(
      /Unknown asset descriptor 'core:missing'/,
    );
    expect(() => getAssetDescriptor(
      "unknown" as BundledAssetPack,
      "missing",
    )).toThrow(/Unknown pack 'unknown'/);
  });

  it("defensively clones descriptors so callers cannot mutate cached search", () => {
    const id = "agents_human_review_01-25";
    const probe = "zzqxwvutprm";
    const descriptorValue = getAssetDescriptor("core", id);
    descriptorValue.labels.en = "Mutated label";
    descriptorValue.synonyms.en.push(probe);

    const fresh = getAssetDescriptor("core", id);
    expect(fresh.labels.en).toBe("Human Review");
    expect(fresh.synonyms.en).not.toContain(probe);
    expect(searchAssets(probe, { packs: ["core"] })).toEqual([]);
  });

  it("exports the same search contracts from root and ./assets surfaces", () => {
    for (const api of [publicApi, assetsApi]) {
      expect(api.searchAssets).toBe(searchAssets);
      expect(api.getAssetDescriptor).toBe(getAssetDescriptor);
      expect(api.parseAssetManifest).toBe(parseAssetManifest);
      expect(api.validateBundledCatalog).toBe(validateBundledCatalog);
      expect(api.catalogSha256).toBe(catalogSha256);
    }
  });
});

describe("assets CLI search", () => {
  it("returns the exact result plus descriptor in JSON", () => {
    const run = runAssetsCli([
      "search",
      "human",
      "approval",
      "--pack",
      "core",
      "--limit",
      "1",
      "--json",
    ]);
    expect(run.status, run.stderr).toBe(0);
    const payload = JSON.parse(run.stdout);
    expect(payload).toHaveLength(1);
    expect(payload[0].result).toEqual(expect.objectContaining({
      id: "agents_human_review_01-25",
      pack: "core",
    }));
    expect(payload[0].descriptor.id).toBe(payload[0].result.id);
    expect(payload[0].descriptor.labels).toEqual(expect.objectContaining({
      en: expect.any(String),
      ru: expect.any(String),
    }));
  });

  it("prints both labels and selects the requested description language", () => {
    const run = runAssetsCli([
      "search",
      "стакан",
      "заявок",
      "--pack",
      "trading",
      "--limit",
      "1",
      "--lang",
      "ru",
    ]);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("trading:trading_order_book_01-15");
    expect(run.stdout).toContain("EN: Order Book");
    expect(run.stdout).toContain("RU: Книга заявок");
    expect(run.stdout).toMatch(/\n   RU: .+\n/);
  });

  it("accepts repeatable named packs and de-duplicates repeated packs", () => {
    const repeated = runAssetsCli([
      "search",
      "database",
      "--pack",
      "trading",
      "--pack",
      "core",
      "--limit",
      "10",
      "--json",
    ]);
    const duplicate = runAssetsCli([
      "search",
      "database",
      "--pack",
      "core",
      "--pack",
      "core",
      "--limit",
      "10",
      "--json",
    ]);
    const single = runAssetsCli([
      "search",
      "database",
      "--pack",
      "core",
      "--limit",
      "10",
      "--json",
    ]);

    expect(repeated.status, repeated.stderr).toBe(0);
    expect(JSON.parse(repeated.stdout).every(
      ({ result }: { result: { pack: string } }) => (
        result.pack === "core" || result.pack === "trading"
      ),
    )).toBe(true);
    expect(duplicate.status, duplicate.stderr).toBe(0);
    expect(duplicate.stdout).toBe(single.stdout);
  });

  it("rejects ambiguous packs and invalid search-only flags", () => {
    const cases = [
      {
        args: ["search", "test", "--pack", "all", "--pack", "core"],
        error: "--pack all cannot be combined",
      },
      {
        args: ["search", "test", "--limit", "0"],
        error: "--limit must be a positive integer",
      },
      {
        args: ["search", "test", "--lang", "de"],
        error: "--lang must be 'en' or 'ru'",
      },
      {
        args: ["list", "--pack", "core", "--pack", "trading"],
        error: "Existing asset commands accept exactly one --pack",
      },
    ];

    for (const item of cases) {
      const run = runAssetsCli(item.args);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(item.error);
    }
  });
});
