#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [leftArg, rightArg] = process.argv.slice(2);

if (!leftArg || !rightArg) {
  console.error("Usage: node scripts/validation/compare-png-pixels.mjs LEFT.png RIGHT.png");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromRenderer = createRequire(resolve(root, "renderer/package.json"));
const { chromium } = requireFromRenderer("playwright");
const left = readFileSync(resolve(leftArg)).toString("base64");
const right = readFileSync(resolve(rightArg)).toString("base64");
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ leftPng, rightPng }) => {
    const pixels = async (base64) => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      const image = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("Canvas 2D context is unavailable");
      }
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        rgba: context.getImageData(0, 0, image.width, image.height).data,
      };
    };

    const leftImage = await pixels(leftPng);
    const rightImage = await pixels(rightPng);
    if (leftImage.width !== rightImage.width || leftImage.height !== rightImage.height) {
      return {
        equalDimensions: false,
        left: { width: leftImage.width, height: leftImage.height },
        right: { width: rightImage.width, height: rightImage.height },
        differingPixels: null,
      };
    }

    let differingPixels = 0;
    for (let offset = 0; offset < leftImage.rgba.length; offset += 4) {
      if (
        leftImage.rgba[offset] !== rightImage.rgba[offset] ||
        leftImage.rgba[offset + 1] !== rightImage.rgba[offset + 1] ||
        leftImage.rgba[offset + 2] !== rightImage.rgba[offset + 2] ||
        leftImage.rgba[offset + 3] !== rightImage.rgba[offset + 3]
      ) {
        differingPixels += 1;
      }
    }

    return {
      equalDimensions: true,
      left: { width: leftImage.width, height: leftImage.height },
      right: { width: rightImage.width, height: rightImage.height },
      differingPixels,
    };
  }, { leftPng: left, rightPng: right });

  console.log(JSON.stringify(result));
  if (!result.equalDimensions || result.differingPixels !== 0) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
