import { closeSync, cpSync, existsSync, mkdirSync, openSync, readSync, rmSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { packageRoot } from "./paths.js";

export const RENDERER_VERSION = "0.1.0";

export function defaultCacheDir(): string {
  const explicit = process.env.EXCALIDRAW_DIAGRAMS_RENDERER_HOME;
  if (explicit) {
    return resolve(explicit.replace(/^~/, homedir()));
  }
  const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(cacheRoot, "excalidraw-diagrams", `renderer-${RENDERER_VERSION}`);
}

export function prepareRendererFiles(cacheDir: string | null = null): string {
  const rendererDir = cacheDir ? resolve(cacheDir) : defaultCacheDir();
  mkdirSync(rendererDir, { recursive: true });
  copyResourceTree(join(packageRoot(import.meta.url), "renderer"), rendererDir);
  return rendererDir;
}

export function setupRenderer(cacheDir: string | null = null, options: { skipBrowser?: boolean; force?: boolean } = {}): string {
  const rendererDir = cacheDir ? resolve(cacheDir) : defaultCacheDir();
  const rendererIsReady = rendererReady(rendererDir);
  if (!options.force && rendererIsReady && (options.skipBrowser || rendererBrowserReady(rendererDir))) {
    console.log(`Renderer already installed in ${rendererDir}`);
    return rendererDir;
  }

  const node = requireExecutable("node");
  if (!rendererIsReady || options.force) {
    prepareRendererFiles(rendererDir);
    const npm = requireExecutable("npm");
    const lockfile = join(rendererDir, "package-lock.json");
    const installArgs = existsSync(lockfile)
      ? ["ci", "--legacy-peer-deps", "--no-audit", "--no-fund"]
      : ["install", "--legacy-peer-deps", "--no-audit", "--no-fund"];

    run(npm, installArgs, rendererDir);
    run(node, [join(rendererDir, "node_modules", "vite", "bin", "vite.js"), "build", "--base", "./"], rendererDir);
  } else {
    console.log(`Renderer files already installed in ${rendererDir}`);
  }

  if (!options.skipBrowser && (options.force || !rendererBrowserReady(rendererDir))) {
    run(node, [join(rendererDir, "node_modules", "playwright", "cli.js"), "install", "chromium"], rendererDir);
  } else if (options.skipBrowser) {
    console.log("Skipped Playwright Chromium install.");
  } else {
    console.log("Playwright Chromium already installed.");
  }
  return rendererDir;
}

export function rendererReady(cacheDir: string | null = null): boolean {
  const rendererDir = cacheDir ? resolve(cacheDir) : defaultCacheDir();
  return (
    existsSync(join(rendererDir, "node_modules", "playwright")) &&
    existsSync(join(rendererDir, "dist", "index.html")) &&
    existsSync(join(rendererDir, "render-excalidraw.mjs"))
  );
}

export function rendererBrowserReady(cacheDir: string | null = null): boolean {
  const rendererDir = cacheDir ? resolve(cacheDir) : defaultCacheDir();
  if (!existsSync(join(rendererDir, "node_modules", "playwright"))) {
    return false;
  }
  const script = [
    "const { existsSync } = require('node:fs');",
    "const { chromium } = require('playwright');",
    "process.exit(existsSync(chromium.executablePath()) ? 0 : 1);",
  ].join(" ");
  const result = spawnSync(requireExecutable("node"), ["-e", script], { cwd: rendererDir, stdio: "ignore" });
  return result.status === 0;
}

export function setupMain(argv = process.argv.slice(2)): number {
  const args = parseSetupArgs(argv);
  if (args.help) {
    printSetupUsage();
    return 0;
  }
  try {
    const rendererDir = setupRenderer(args.cacheDir, { skipBrowser: args.skipBrowser, force: args.force });
    console.log(`Renderer ready in ${rendererDir}`);
    return 0;
  } catch (error) {
    console.error(`excalidraw-render-setup failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function renderMain(argv = process.argv.slice(2)): number {
  const args = parseRenderArgs(argv);
  if (args.help || !args.input || !args.output) {
    printRenderUsage();
    return args.help ? 0 : 2;
  }

  const rendererDir = args.cacheDir ? resolve(args.cacheDir) : defaultCacheDir();
  if (args.setup) {
    try {
      setupRenderer(rendererDir);
    } catch (error) {
      console.error(`excalidraw-render setup failed: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  if (!args.setup && (!rendererReady(rendererDir) || !rendererBrowserReady(rendererDir)) && canPrompt()) {
    if (promptForRendererSetup()) {
      try {
        setupRenderer(rendererDir);
      } catch (error) {
        console.error(`excalidraw-render setup failed: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    }
  }

  if (!rendererReady(rendererDir)) {
    console.error("Renderer is not installed. Run `excalidraw-render-setup` once, or pass `excalidraw-render --setup ...`.");
    return 1;
  }
  if (!rendererBrowserReady(rendererDir)) {
    console.error("Renderer browser is not installed. Run `excalidraw-render-setup`, or pass `excalidraw-render --setup ...`.");
    return 1;
  }

  const command = [
    join(rendererDir, "render-excalidraw.mjs"),
    args.input,
    args.output,
    "--scale",
    String(args.scale),
    "--background",
    args.background,
    "--port",
    String(args.port),
  ];
  if (args.transparent) {
    command.push("--transparent");
  }
  if (args.browserLog) {
    command.push("--browser-log");
  }

  const result = spawnSync(requireExecutable("node"), command, { stdio: "inherit" });
  return result.status ?? 1;
}

interface SetupArgs {
  cacheDir: string | null;
  skipBrowser: boolean;
  force: boolean;
  help: boolean;
}

interface RenderArgs {
  input: string | null;
  output: string | null;
  cacheDir: string | null;
  setup: boolean;
  scale: number;
  background: string;
  transparent: boolean;
  port: number;
  browserLog: boolean;
  help: boolean;
}

function parseSetupArgs(argv: string[]): SetupArgs {
  const args: SetupArgs = { cacheDir: null, skipBrowser: false, force: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cache-dir") {
      args.cacheDir = argv[++index] ?? null;
    } else if (arg === "--skip-browser") {
      args.skipBrowser = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function parseRenderArgs(argv: string[]): RenderArgs {
  const args: RenderArgs = {
    input: null,
    output: null,
    cacheDir: null,
    setup: false,
    scale: 2,
    background: "#ffffff",
    transparent: false,
    port: 0,
    browserLog: false,
    help: false,
  };
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cache-dir") {
      args.cacheDir = argv[++index] ?? null;
    } else if (arg === "--setup") {
      args.setup = true;
    } else if (arg === "--scale") {
      args.scale = Number(argv[++index]);
    } else if (arg === "--background") {
      args.background = argv[++index] ?? "#ffffff";
    } else if (arg === "--transparent") {
      args.transparent = true;
    } else if (arg === "--port") {
      args.port = Number(argv[++index]);
    } else if (arg === "--browser-log") {
      args.browserLog = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      positional.push(arg);
    }
  }

  args.input = positional[0] ?? null;
  args.output = positional[1] ?? null;
  return args;
}

function copyResourceTree(source: string, target: string): void {
  for (const name of ["node_modules", "dist"]) {
    rmSync(join(target, name), { recursive: true, force: true });
  }
  cpSync(source, target, {
    recursive: true,
    force: true,
    filter: (item) => !item.includes(`${source}/node_modules`) && !item.includes(`${source}/dist`),
  });
}

function requireExecutable(name: string): string {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Required executable not found on PATH: ${name}`);
  }
  return result.stdout.trim();
}

function run(command: string, args: string[], cwd: string): void {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${[command, ...args].join(" ")}`);
  }
}

function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function promptForRendererSetup(): boolean {
  const fd = openSync("/dev/tty", "r+");
  try {
    writeSync(fd, "PNG renderer is not ready. Install renderer dependencies and Playwright Chromium now? [y/N]: ");
    const buffer = Buffer.alloc(32);
    const bytes = readSync(fd, buffer, 0, buffer.length, null);
    const value = buffer.toString("utf8", 0, bytes).trim().toLowerCase();
    return value === "y" || value === "yes";
  } finally {
    closeSync(fd);
  }
}

function printSetupUsage(): void {
  console.log(`Usage: excalidraw-render-setup [options]

Options:
  --cache-dir DIR       Renderer install directory
  --skip-browser        Skip Playwright Chromium download
  --force               Reinstall renderer dependencies even when ready
`);
}

function printRenderUsage(): void {
  console.log(`Usage: excalidraw-render INPUT.excalidraw OUTPUT.png [options]

Options:
  --cache-dir DIR       Renderer install directory
  --setup               Ensure renderer dependencies are ready before rendering
  --scale N             Export scale, default 2
  --background COLOR    Background color, default #ffffff
  --transparent         Export without background
  --port PORT           Static server port, default random free port
  --browser-log         Print browser console messages
`);
}
