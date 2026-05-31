import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { writeExcalidrawJsArchitecture } from "./examples.js";
import { packageRoot } from "./paths.js";

export const SKILL_NAME = "excalidraw-diagrams";
export const PACKAGE_NAME = "excalidraw-diagrams";
export type AgentName = "auto" | "codex" | "claude" | "generic";

export class SetupTarget {
  constructor(
    public readonly agent: string,
    public readonly root: string,
  ) {}

  get path(): string {
    return join(this.root, SKILL_NAME);
  }
}

export function packageVersion(): string {
  try {
    const data = JSON.parse(readFileSync(join(packageRoot(import.meta.url), "package.json"), "utf8")) as { version?: string };
    return data.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function resolveSetupTarget(options: { project?: boolean; agent?: AgentName; cwd?: string; home?: string } = {}): SetupTarget {
  const project = options.project ?? false;
  const agent = options.agent ?? "auto";
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const home = options.home ? resolve(options.home) : homedir();

  if (project) {
    if (agent !== "auto") {
      throw new Error("--agent is only valid for user installs; omit it with --project");
    }
    return new SetupTarget("project", join(cwd, "skills"));
  }

  const resolvedAgent = resolveUserAgent(agent, home);
  return new SetupTarget(resolvedAgent, userSkillRoot(resolvedAgent, home));
}

export function installSkill(target: SetupTarget, options: { force?: boolean } = {}): string {
  const source = join(packageRoot(import.meta.url), "skills", SKILL_NAME);
  if (!existsSync(source)) {
    throw new Error(`Packaged skill bundle is missing: ${source}`);
  }

  const destination = target.path;
  if (existsSync(destination)) {
    if (!options.force) {
      throw new Error(`Skill already exists at ${destination}. Re-run with --force to replace it.`);
    }
    rmSync(destination, { recursive: true, force: true });
  }

  mkdirSync(target.root, { recursive: true });
  cpSync(source, destination, { recursive: true });
  return destination;
}

export function setupMain(argv = process.argv.slice(2)): number {
  const args = parseSetupArgs(argv);
  if (args.help) {
    printSetupUsage();
    return 0;
  }

  try {
    const target = resolveSetupTarget({ project: args.project, agent: args.agent });
    const destination = installSkill(target, { force: args.force });
    printSuccess(destination, target);
    return 0;
  } catch (error) {
    console.error(`excalidraw-diagrams setup failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function main(argv = process.argv.slice(2)): number {
  const [command, ...rest] = argv;
  if (command === "setup") {
    return setupMain(rest);
  }
  if (command === "example") {
    return exampleMain(rest);
  }
  printUsage();
  return command === "--help" || command === "-h" ? 0 : 2;
}

export function exampleMain(argv = process.argv.slice(2)): number {
  const args = parseExampleArgs(argv);
  if (args.help || !args.name) {
    printExampleUsage();
    return args.help ? 0 : 2;
  }
  if (args.name !== "excalidraw-js-architecture") {
    console.error(`Unknown example: ${args.name}`);
    return 2;
  }

  try {
    const result = writeExcalidrawJsArchitecture(args.outDir);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(`excalidraw-diagrams example failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

interface ParsedSetupArgs {
  project: boolean;
  agent: AgentName;
  force: boolean;
  help: boolean;
}

interface ParsedExampleArgs {
  name: string | null;
  outDir: string;
  help: boolean;
}

function parseSetupArgs(argv: string[]): ParsedSetupArgs {
  const args: ParsedSetupArgs = { project: false, agent: "auto", force: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      args.project = true;
    } else if (arg === "--agent") {
      args.agent = parseAgent(argv[++index]);
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function parseExampleArgs(argv: string[]): ParsedExampleArgs {
  const args: ParsedExampleArgs = { name: null, outDir: join("examples", "out", "baseline"), help: false };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out-dir") {
      args.outDir = argv[++index] ?? args.outDir;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      positional.push(arg);
    }
  }
  args.name = positional[0] ?? null;
  return args;
}

function parseAgent(value: string | undefined): AgentName {
  if (value === "auto" || value === "codex" || value === "claude" || value === "generic") {
    return value;
  }
  throw new Error(`Unknown agent target: ${value}`);
}

function resolveUserAgent(agent: AgentName, home: string): "codex" | "claude" | "generic" {
  if (agent !== "auto") {
    return agent;
  }
  // Generic ~/.agents is the shared default for Pi and Codex-style runners.
  // Use explicit --agent claude or --agent codex when that private target is intended.
  return "generic";
}

function userSkillRoot(agent: string, home: string): string {
  if (agent === "codex") {
    return join(home, ".codex", "skills");
  }
  if (agent === "claude") {
    return join(home, ".claude", "skills");
  }
  if (agent === "generic") {
    return join(home, ".agents", "skills");
  }
  throw new Error(`Unknown agent target: ${agent}`);
}

function printUsage(): void {
  console.log(`Usage: excalidraw-diagrams <command>

Commands:
  setup       Install the bundled agent skill
  example     Generate a bundled example diagram
`);
}

function printSetupUsage(): void {
  console.log(`Usage: excalidraw-diagrams setup [options]

Options:
  --project                      Install into ./skills/excalidraw-diagrams
  --agent auto|codex|claude|generic
  --force                        Replace an existing skill directory
`);
}

function printSuccess(destination: string, target: SetupTarget): void {
  console.log(`Installed excalidraw-diagrams skill ${packageVersion()}`);
  console.log(`Target: ${target.agent}`);
  console.log(`Path: ${destination}`);
  console.log("");
  console.log("Next steps:");
  console.log("- Restart or reload your agent if it does not discover new skills automatically.");
  console.log("- Ask the agent to use the excalidraw-diagrams skill for diagram generation.");
  console.log("- Use `npm install @kroffske/excalidraw-diagrams` in projects that run diagram scripts.");
}

function printExampleUsage(): void {
  console.log(`Usage: excalidraw-diagrams example excalidraw-js-architecture [options]

Options:
  --out-dir DIR       Output directory, default examples/out/baseline
`);
}
