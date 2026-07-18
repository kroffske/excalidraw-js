import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  validateDistributionReport,
} from "../scripts/check-asset-search-distribution.mjs";

describe("asset-search distribution proof", () => {
  it("requires zero guarded network attempts and an embedded selected asset", () => {
    expect(() =>
      validateDistributionReport({
        schema_version: 1,
        network: { attempt_count: 0 },
        consumer: {
          english_top: { id: "agents_robot_agent_01-01" },
          russian_top: { id: "trading_order_book_01-15" },
          scene_files: 1,
        },
      }),
    ).not.toThrow();

    expect(() =>
      validateDistributionReport({
        schema_version: 1,
        network: { attempt_count: 1 },
        consumer: {
          english_top: { id: "agents_robot_agent_01-01" },
          russian_top: { id: "trading_order_book_01-15" },
          scene_files: 1,
        },
      }),
    ).toThrow(/1 blocked attempts/);
  });

  it("keeps the benchmark outside the package and documents explicit choice", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const docs = readFileSync(
      "skills/excalidraw-diagrams/references/assets.md",
      "utf8",
    );

    expect(packageJson.files).not.toContain("tests");
    expect(packageJson.files).not.toContain("evals");
    expect(packageJson.files).not.toContain("catalog-review");
    expect(packageJson.dependencies ?? {}).toEqual({});
    expect(packageJson.scripts["verify:asset-search"]).toContain(
      "distribution:asset-search",
    );
    expect(docs).toMatch(/Never place rank 1 automatically/);
    expect(docs).toMatch(/canonical v2 `manifest\.json`/);
    expect(docs).toMatch(/`PROVENANCE\.md`/);
  });
});
