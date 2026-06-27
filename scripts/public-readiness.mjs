#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const repo = "kroffske/excalidraw-js";
const repoUrl = `https://github.com/${repo}`;
const localUserPath = ["/Users", "ravius"].join("/") + "/";
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

let failed = false;

function mark(name, ok, detail = "") {
  const status = ok ? "ok" : "fail";
  console.log(`[${status}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) {
    failed = true;
  }
}

function capture(command, args) {
  return spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
}

function run(name, command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    ...options,
  });

  if (result.error?.code === "ENOENT") {
    mark(name, false, `${command} is not installed`);
    return;
  }

  mark(name, result.status === 0, `exit ${result.status}`);
}

mark("repository metadata", pkg.repository?.type === "git" && pkg.repository?.url === `git+${repoUrl}.git`);
mark("bugs metadata", pkg.bugs?.url === `${repoUrl}/issues`);
mark("homepage metadata", pkg.homepage === `${repoUrl}#readme`);

const trackedLocus = capture("git", ["ls-files", ".locus"]);
mark("local .locus utility files are untracked", trackedLocus.status === 0 && trackedLocus.stdout.trim() === "", trackedLocus.stdout.trim());

const localPaths = capture("git", ["grep", "-n", localUserPath, "--", "."]);
if (localPaths.status === 0) {
  mark("tracked files do not contain local user-home paths", false, localPaths.stdout.trim());
} else {
  mark("tracked files do not contain local user-home paths", localPaths.status === 1);
}

run("gitleaks secret scan", "gitleaks", ["git", "--redact", "--no-banner", "."]);
run("npm package boundary", "npm", ["run", "pack:check"]);

console.log("\n$ git status --short --ignored");
spawnSync("git", ["status", "--short", "--ignored"], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
});

if (failed) {
  process.exit(1);
}
