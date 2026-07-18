import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const REVIEW_ROOT = join(ROOT, "catalog-review", "assets", "v1");
const PACKS = ["core", "trading"] as const;

interface CaptureRecord {
  html: string;
  html_sha256: string;
  png: string;
  png_sha256: string;
  pixel_width: number;
  pixel_height: number;
  cards: number;
  loaded_images: number;
  blank_cards: number;
  horizontal_overflow: boolean;
}

interface VisualProvenance {
  schema_version: number;
  catalog_sha256: string;
  captures: Record<(typeof PACKS)[number], CaptureRecord>;
  direct_review: {
    verdict: string;
    reviewed_cards: number;
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("asset catalog visual evidence", () => {
  const provenance = JSON.parse(
    readFileSync(join(REVIEW_ROOT, "visual-provenance.json"), "utf8"),
  ) as VisualProvenance;

  it("binds every manifest id to exactly one rendered contact-sheet card", () => {
    for (const pack of PACKS) {
      const manifest = JSON.parse(
        readFileSync(join(ROOT, "assets", pack, "manifest.json"), "utf8"),
      ) as { assets: Array<{ id: string }> };
      const html = readFileSync(join(REVIEW_ROOT, pack, "index.html"), "utf8");
      const renderedIds = [...html.matchAll(/data-asset-id="([^"]+)"/gu)]
        .map((match) => match[1]);

      expect(renderedIds).toEqual(manifest.assets.map(({ id }) => id));
      expect(new Set(renderedIds).size).toBe(64);
    }
  });

  it("pins reviewed PNG bytes and dimensions to renderer provenance", () => {
    expect(provenance.schema_version).toBe(1);
    expect(provenance.catalog_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(provenance.direct_review).toEqual(expect.objectContaining({
      verdict: "pass",
      reviewed_cards: 128,
    }));

    for (const pack of PACKS) {
      const capture = provenance.captures[pack];
      const html = readFileSync(join(REVIEW_ROOT, capture.html));
      const png = readFileSync(join(REVIEW_ROOT, capture.png));

      expect(sha256(html)).toBe(capture.html_sha256);
      expect(sha256(png)).toBe(capture.png_sha256);
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(capture.pixel_width);
      expect(png.readUInt32BE(20)).toBe(capture.pixel_height);
      expect(capture).toEqual(expect.objectContaining({
        cards: 64,
        loaded_images: 64,
        blank_cards: 0,
        horizontal_overflow: false,
      }));
    }
  });
});
