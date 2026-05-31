import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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

export function setupRenderer(cacheDir: string | null = null, options: { skipBrowser?: boolean } = {}): string {
  const node = requireExecutable("node");
  const npm = requireExecutable("npm");
  const rendererDir = prepareRendererFiles(cacheDir);
  const lockfile = join(rendererDir, "package-lock.json");
  const installArgs = existsSync(lockfile)
    ? ["ci", "--legacy-peer-deps", "--no-audit", "--no-fund"]
    : ["install", "--legacy-peer-deps", "--no-audit", "--no-fund"];

  run(npm, installArgs, rendererDir);
  run(node, [join(rendererDir, "node_modules", "vite", "bin", "vite.js"), "build", "--base", "./"], rendererDir);
  if (!options.skipBrowser) {
    run(node, [join(rendererDir, "node_modules", "playwright", "cli.js"), "install", "chromium"], rendererDir);
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

export function setupMain(argv = process.argv.slice(2)): number {
  const args = parseSetupArgs(argv);
  if (args.help) {
    printSetupUsage();
    return 0;
  }
  try {
    const rendererDir = setupRenderer(args.cacheDir, { skipBrowser: args.skipBrowser });
    console.log(`Renderer installed in ${rendererDir}`);
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

  if (!rendererReady(rendererDir)) {
    console.error("Renderer is not installed. Run `excalidraw-render-setup` once, or pass `excalidraw-render --setup ...`.");
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
  const args: SetupArgs = { cacheDir: null, skipBrowser: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cache-dir") {
      args.cacheDir = argv[++index] ?? null;
    } else if (arg === "--skip-browser") {
      args.skipBrowser = true;
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

function printSetupUsage(): void {
  console.log(`Usage: excalidraw-render-setup [options]

Options:
  --cache-dir DIR       Renderer install directory
  --skip-browser        Skip Playwright Chromium download
`);
}

function printRenderUsage(): void {
  console.log(`Usage: excalidraw-render INPUT.excalidraw OUTPUT.png [options]

Options:
  --cache-dir DIR       Renderer install directory
  --setup               Install/update renderer dependencies before rendering
  --scale N             Export scale, default 2
  --background COLOR    Background color, default #ffffff
  --transparent         Export without background
  --port PORT           Static server port, default random free port
  --browser-log         Print browser console messages
`);
}
