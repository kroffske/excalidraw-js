#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = resolve(
  REPO_ROOT,
  "evals/asset-search/v1/distribution-report.json",
);
const FORBIDDEN_PACKAGE_PATH = /(^|\/)(?:tests|evals|catalog-review|models?|embeddings?|cache)(?:\/|$)|benchmark|task\.md$|\.(?:onnx|gguf|safetensors)$/iu;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}:\n${result.stderr}`,
    );
  }
  return result;
}

function assertPackageContents(files) {
  const paths = files.map((file) => file.path);
  const required = [
    "package.json",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/assets.js",
    "dist/assets.d.ts",
    "assets/PROVENANCE.md",
    "assets/core/manifest.json",
    "assets/core/manifest.csv",
    "assets/trading/manifest.json",
    "assets/trading/manifest.csv",
    "skills/excalidraw-diagrams/references/assets.md",
  ];
  for (const path of required) {
    if (!paths.includes(path)) {
      throw new Error(`Packed artifact is missing '${path}'.`);
    }
  }
  const svgPaths = paths.filter((path) =>
    /^assets\/(?:core|trading)\/svg\/[^/]+\.svg$/u.test(path),
  );
  if (svgPaths.length !== 128) {
    throw new Error(`Packed artifact has ${svgPaths.length} SVGs, expected 128.`);
  }
  const forbidden = paths.filter((path) => FORBIDDEN_PACKAGE_PATH.test(path));
  if (forbidden.length > 0) {
    throw new Error(
      `Packed artifact contains forbidden benchmark/model/review paths:\n${forbidden.join("\n")}`,
    );
  }
}

function consumerSource(packageName) {
  return `
import { writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";

const require = createRequire(import.meta.url);
const attempts = [];
const blocked = (surface) => (...args) => {
  attempts.push({ surface, target: typeof args[0] === "string" ? args[0] : null });
  throw new Error("Network or child process blocked: " + surface);
};

globalThis.fetch = blocked("fetch");
for (const [moduleName, methods] of [
  ["node:http", ["request", "get"]],
  ["node:https", ["request", "get"]],
  ["node:net", ["connect", "createConnection"]],
  ["node:tls", ["connect"]],
  ["node:child_process", ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]],
]) {
  const module = require(moduleName);
  for (const method of methods) {
    module[method] = blocked(moduleName + "." + method);
  }
}
syncBuiltinESMExports();

const root = await import(${JSON.stringify(packageName)});
const assets = await import(${JSON.stringify(`${packageName}/assets`)});
if (typeof root.searchAssets !== "function" || typeof assets.searchAssets !== "function") {
  throw new Error("Both public entrypoints must export searchAssets.");
}
if (typeof assets.getAssetDescriptor !== "function") {
  throw new Error("The ./assets entrypoint must export getAssetDescriptor.");
}

const english = root.searchAssets("autonomous AI worker", { packs: ["core"], limit: 5 });
const russian = assets.searchAssets("стакан заявок", { packs: ["trading"], limit: 5 });
const englishReplay = root.searchAssets("autonomous AI worker", { packs: ["core"], limit: 5 });
const russianReplay = assets.searchAssets("стакан заявок", { packs: ["trading"], limit: 5 });
if (JSON.stringify(english) !== JSON.stringify(englishReplay) || JSON.stringify(russian) !== JSON.stringify(russianReplay)) {
  throw new Error("Installed-package ranking is not deterministic.");
}
if (english[0]?.id !== "agents_robot_agent_01-01" || english[0]?.pack !== "core") {
  throw new Error("Installed-package English search did not select the accepted canonical id.");
}
if (russian[0]?.id !== "trading_order_book_01-15" || russian[0]?.pack !== "trading") {
  throw new Error("Installed-package Russian search did not select the accepted canonical id.");
}

const chosen = english[0];
const descriptor = assets.getAssetDescriptor(chosen.pack, chosen.id);
if (descriptor.id !== chosen.id) {
  throw new Error("Descriptor lookup did not preserve canonical identity.");
}
const registry = root.AssetRegistry.bundled(chosen.pack);
if (registry.resolve(chosen.id).id !== chosen.id) {
  throw new Error("Exact registry resolution failed for selected canonical id.");
}
const scene = new root.Scene({ seed: 123, assetRegistry: registry });
scene.placeAsset(chosen.id, 20, 30, 64);
scene.write("consumer-scene.excalidraw");

writeFileSync("consumer-proof.json", JSON.stringify({
  attempts,
  english_top: { pack: english[0].pack, id: english[0].id },
  russian_top: { pack: russian[0].pack, id: russian[0].id },
  descriptor_id: descriptor.id,
  scene_files: Object.keys(scene.files).length,
}, null, 2) + "\\n");
`;
}

export function validateDistributionReport(report) {
  if (report.schema_version !== 1) {
    throw new Error("Distribution report schema must be v1.");
  }
  if (report.network.attempt_count !== 0) {
    throw new Error(
      `Fresh consumer made ${report.network.attempt_count} blocked attempts.`,
    );
  }
  if (
    report.consumer.english_top.id !== "agents_robot_agent_01-01" ||
    report.consumer.russian_top.id !== "trading_order_book_01-15" ||
    report.consumer.scene_files !== 1
  ) {
    throw new Error("Fresh consumer proof is incomplete.");
  }
  return report;
}

export function runDistributionCheck() {
  const packageJson = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
  );
  if (
    packageJson.dependencies &&
    Object.keys(packageJson.dependencies).length > 0
  ) {
    throw new Error("Asset search package must keep zero production dependencies.");
  }

  const root = mkdtempSync(resolve(tmpdir(), "asset-search-distribution-"));
  try {
    const packed = run("npm", [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      root,
    ]);
    const [packReport] = JSON.parse(packed.stdout);
    assertPackageContents(packReport.files);
    const tarballPath = resolve(root, packReport.filename);
    const tarballSha256 = sha256(readFileSync(tarballPath));

    writeFileSync(
      resolve(root, "package.json"),
      `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
      "utf8",
    );
    run(
      "npm",
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        tarballPath,
      ],
      { cwd: root },
    );
    writeFileSync(
      resolve(root, "consumer.mjs"),
      consumerSource(packageJson.name),
      "utf8",
    );
    run("node", [resolve(root, "consumer.mjs")], { cwd: root });
    const consumer = JSON.parse(
      readFileSync(resolve(root, "consumer-proof.json"), "utf8"),
    );
    const scene = JSON.parse(
      readFileSync(resolve(root, "consumer-scene.excalidraw"), "utf8"),
    );
    if (
      scene.type !== "excalidraw" ||
      !Array.isArray(scene.elements) ||
      scene.elements.length === 0
    ) {
      throw new Error("Fresh consumer did not write a valid Excalidraw scene.");
    }

    const report = validateDistributionReport({
      schema_version: 1,
      package: {
        name: packageJson.name,
        version: packageJson.version,
        tarball: basename(tarballPath),
        tarball_sha256: tarballSha256,
        packed_file_count: packReport.entryCount,
        packed_svg_count: packReport.files.filter((file) =>
          /^assets\/(?:core|trading)\/svg\/[^/]+\.svg$/u.test(file.path),
        ).length,
        production_dependency_count: Object.keys(
          packageJson.dependencies ?? {},
        ).length,
        forbidden_paths: [],
      },
      network: {
        guarded_surfaces: [
          "fetch",
          "http",
          "https",
          "net",
          "tls",
          "child_process",
        ],
        attempt_count: consumer.attempts.length,
        attempts: consumer.attempts,
      },
      consumer: {
        english_top: consumer.english_top,
        russian_top: consumer.russian_top,
        descriptor_id: consumer.descriptor_id,
        scene_files: consumer.scene_files,
        imported_entrypoints: [".", "./assets"],
      },
      passed: true,
    });
    writeFileSync(
      REPORT_PATH,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    return report;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const report = runDistributionCheck();
    console.log(
      `asset-search distribution PASS: ${report.package.packed_file_count} files, ${report.package.packed_svg_count} SVGs, ${report.network.attempt_count} network attempts`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
