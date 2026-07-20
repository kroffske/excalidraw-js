import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { writeArchitectureSemanticRedraw, writeExcalidrawJsArchitecture } from "./examples.js";
import { packageRoot } from "./paths.js";
import { renderMain, setupRenderer } from "./render.js";
import { readSemanticRedrawSpec, writeSemanticRedrawDiagram } from "./semantic-redraw-spec.js";
import { readTreeSpec, writeTreeSpecDiagram } from "./tree-spec.js";
import type { TreeLayoutRequest } from "./layout.js";

export const SKILL_NAME = "excalidraw-diagrams";
export const BUNDLED_SKILL_NAMES = [SKILL_NAME] as const;
/**
 * Skills this package used to install and no longer ships. Setup never deletes
 * them - an agent skill root is the user's directory and a copy may be edited -
 * but it reports them so a stale skill does not keep competing for routing.
 */
export const LEGACY_SKILL_NAMES = ["plan-excalidraw-graph"] as const;
export const PACKAGE_NAME = "excalidraw-diagrams";
export const NPM_PACKAGE_NAME = "@kroffske/excalidraw-diagrams";
export type AgentName = "auto" | "agents" | "codex" | "claude" | "generic";
type SetupAgentName = AgentName | "all";
type ResolvedAgentName = "agents" | "codex" | "claude";
type ExampleName = "architecture-semantic-redraw" | "excalidraw-js-architecture";

const EXAMPLE_WRITERS: Record<ExampleName, (outDir?: string) => { excalidrawPath: string; elements: number; files: number }> = {
  "architecture-semantic-redraw": writeArchitectureSemanticRedraw,
  "excalidraw-js-architecture": writeExcalidrawJsArchitecture,
};

const EXAMPLE_DEFAULT_OUT_DIRS: Record<ExampleName, string> = {
  "architecture-semantic-redraw": join("examples", "out", "architecture-semantic-redraw"),
  "excalidraw-js-architecture": join("examples", "out", "baseline"),
};

export class SetupTarget {
  constructor(
    public readonly agent: string,
    public readonly root: string,
  ) {}

  get path(): string {
    return join(this.root, SKILL_NAME);
  }

  skillPath(skillName: string): string {
    return join(this.root, skillName);
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

export function installSkill(target: SetupTarget, options: { force?: boolean; skillName?: string } = {}): string {
  return installSkills(target, {
    force: options.force,
    skillNames: [options.skillName ?? SKILL_NAME],
  })[0].destination;
}

export function installSkills(
  target: SetupTarget,
  options: { force?: boolean; skillNames?: readonly string[] } = {},
): Array<{ skillName: string; destination: string }> {
  const skillNames = options.skillNames ?? BUNDLED_SKILL_NAMES;
  const sourceRoot = join(packageRoot(import.meta.url), "skills");
  const plan = skillNames.map((skillName) => ({
    skillName,
    source: join(sourceRoot, skillName),
    destination: target.skillPath(skillName),
  }));

  for (const item of plan) {
    if (!existsSync(item.source)) {
      throw new Error(`Packaged skill bundle is missing: ${item.source}`);
    }
    if (existsSync(item.destination) && !options.force) {
      throw new Error(`Skill already exists at ${item.destination}. Re-run with --force to replace it.`);
    }
  }

  mkdirSync(target.root, { recursive: true });
  for (const item of plan) {
    if (existsSync(item.destination)) {
      rmSync(item.destination, { recursive: true, force: true });
    }
    cpSync(item.source, item.destination, { recursive: true, filter: (sourcePath) => !sourcePath.endsWith(".DS_Store") });
  }
  return plan.map((item) => ({ skillName: item.skillName, destination: item.destination }));
}

export function setupMain(argv = process.argv.slice(2)): number {
  try {
    const args = parseSetupArgs(argv);
    if (args.help) {
      printSetupUsage();
      return 0;
    }
    return runSetup(args, "setup");
  } catch (error) {
    console.error(`excalidraw-diagrams setup failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function installMain(argv = process.argv.slice(2)): number {
  try {
    const args = parseSetupArgs(argv, { allowInstallCompatibilityOptions: true });
    if (args.help) {
      printInstallUsage();
      return 0;
    }
    console.error("`excalidraw-diagrams install` is deprecated. Use `npm install -g @kroffske/excalidraw-diagrams`, then `excalidraw-diagrams setup`.");
    return runSetup(args, "install");
  } catch (error) {
    console.error(`excalidraw-diagrams install failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function main(argv = process.argv.slice(2)): number {
  const [command, ...rest] = argv;
  if (command === "install") {
    return installMain(rest);
  }
  if (command === "setup") {
    return setupMain(rest);
  }
  if (command === "example") {
    return exampleMain(rest);
  }
  if (command === "tree-spec") {
    return treeSpecMain(rest);
  }
  if (command === "semantic-redraw-spec") {
    return semanticRedrawSpecMain(rest);
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
  if (!isExampleName(args.name)) {
    console.error(`Unknown example: ${args.name}`);
    return 2;
  }

  try {
    const result = EXAMPLE_WRITERS[args.name](args.outDir ?? EXAMPLE_DEFAULT_OUT_DIRS[args.name]);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(`excalidraw-diagrams example failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function treeSpecMain(argv = process.argv.slice(2)): number {
  const args = parseTreeSpecArgs(argv);
  if (args.help || !args.specPath || !args.outPath) {
    printTreeSpecUsage();
    return args.help ? 0 : 2;
  }

  try {
    const spec = readTreeSpec(args.specPath);
    if (args.layout) {
      spec.layout = args.layout;
    }
    const result = writeTreeSpecDiagram(spec, args.outPath);
    const output: Record<string, unknown> = { ...result };
    if (args.pngPath) {
      const renderStatus = renderMain([args.outPath, args.pngPath]);
      if (renderStatus !== 0) {
        throw new Error(`Rendering failed for ${args.outPath}`);
      }
      output.pngPath = args.pngPath;
    }
    console.log(JSON.stringify(output, null, 2));
    return 0;
  } catch (error) {
    console.error(`excalidraw-diagrams tree-spec failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

export function semanticRedrawSpecMain(argv = process.argv.slice(2)): number {
  const args = parseSemanticRedrawSpecArgs(argv);
  if (args.help || !args.specPath || !args.outPath) {
    printSemanticRedrawSpecUsage();
    return args.help ? 0 : 2;
  }

  try {
    const spec = readSemanticRedrawSpec(args.specPath);
    const result = writeSemanticRedrawDiagram(spec, args.outPath, {
      failOnDirectionMismatch: args.strictEdgeDirections,
    });
    const output: Record<string, unknown> = { ...result };
    if (args.pngPath) {
      const renderStatus = renderMain([args.outPath, args.pngPath]);
      if (renderStatus !== 0) {
        throw new Error(`Rendering failed for ${args.outPath}`);
      }
      output.pngPath = args.pngPath;
    }
    console.log(JSON.stringify(output, null, 2));
    return 0;
  } catch (error) {
    console.error(`excalidraw-diagrams semantic-redraw-spec failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

interface ParsedSetupArgs {
  project: boolean;
  agent: AgentName;
  agents: SetupAgentName[];
  agentProvided: boolean;
  yes: boolean;
  force: boolean;
  png: boolean | null;
  skipBrowser: boolean;
  forceRenderer: boolean;
  dryRun: boolean;
  help: boolean;
}

interface ParsedTreeSpecArgs {
  specPath: string | null;
  outPath: string | null;
  pngPath: string | null;
  layout: TreeLayoutRequest | null;
  help: boolean;
}

interface ParsedSemanticRedrawSpecArgs {
  specPath: string | null;
  outPath: string | null;
  pngPath: string | null;
  strictEdgeDirections: boolean;
  help: boolean;
}

interface ParsedExampleArgs {
  name: string | null;
  outDir: string | null;
  help: boolean;
}

function parseSetupArgs(argv: string[], options: { allowInstallCompatibilityOptions?: boolean } = {}): ParsedSetupArgs {
  const args: ParsedSetupArgs = {
    project: false,
    agent: "auto",
    agents: [],
    agentProvided: false,
    yes: false,
    force: false,
    png: null,
    skipBrowser: false,
    forceRenderer: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      args.project = true;
    } else if (arg === "--agent" || arg === "--provider" || arg === "--agents" || arg === "--providers") {
      const parsedAgents = parseSetupAgents(argv[++index]);
      args.agents.push(...parsedAgents);
      const lastAgent = parsedAgents[parsedAgents.length - 1];
      args.agent = !lastAgent || lastAgent === "all" ? "auto" : lastAgent;
      args.agentProvided = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--force-renderer") {
      args.forceRenderer = true;
    } else if (arg === "--yes" || arg === "-y") {
      args.yes = true;
    } else if (arg === "--png" || arg === "--with-png" || arg === "--renderer" || arg === "--with-renderer") {
      args.png = true;
    } else if (arg === "--no-png" || arg === "--skip-renderer") {
      args.png = false;
    } else if (arg === "--skip-browser") {
      args.skipBrowser = true;
      args.png = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (options.allowInstallCompatibilityOptions && arg === "--skip-global") {
      // Historical no-op: package installation is owned by `npm install -g`.
    } else if (options.allowInstallCompatibilityOptions && arg === "--force-global") {
      // Historical no-op: package installation is owned by `npm install -g`.
    } else if (options.allowInstallCompatibilityOptions && arg === "--package") {
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown setup option: ${arg}`);
    }
  }

  return args;
}

function parseExampleArgs(argv: string[]): ParsedExampleArgs {
  const args: ParsedExampleArgs = { name: null, outDir: null, help: false };
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

function isExampleName(value: string | null): value is ExampleName {
  return value === "architecture-semantic-redraw" || value === "excalidraw-js-architecture";
}

function parseTreeSpecArgs(argv: string[]): ParsedTreeSpecArgs {
  const args: ParsedTreeSpecArgs = { specPath: null, outPath: null, pngPath: null, layout: null, help: false };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      args.outPath = argv[++index] ?? args.outPath;
    } else if (arg === "--png") {
      args.pngPath = argv[++index] ?? args.pngPath;
    } else if (arg === "--layout") {
      args.layout = parseTreeSpecLayout(argv[++index]);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      positional.push(arg);
    }
  }
  args.specPath = positional[0] ?? null;
  return args;
}

function parseSemanticRedrawSpecArgs(argv: string[]): ParsedSemanticRedrawSpecArgs {
  const args: ParsedSemanticRedrawSpecArgs = {
    specPath: null,
    outPath: null,
    pngPath: null,
    strictEdgeDirections: false,
    help: false,
  };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      args.outPath = argv[++index] ?? args.outPath;
    } else if (arg === "--png") {
      args.pngPath = argv[++index] ?? args.pngPath;
    } else if (arg === "--strict-edge-directions") {
      args.strictEdgeDirections = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      positional.push(arg);
    }
  }
  args.specPath = positional[0] ?? null;
  return args;
}

function parseTreeSpecLayout(value: string | undefined): ParsedTreeSpecArgs["layout"] {
  if (
    value === "auto"
    || value === "tree"
    || value === "wide-tree"
    || value === "process-flow"
    || value === "horizontal-tree"
    || value === "left-right-tree"
  ) {
    return value;
  }
  throw new Error(`Unknown tree-spec layout: ${value}`);
}

function parseAgent(value: string | undefined): AgentName {
  if (value === "auto" || value === "agents" || value === "codex" || value === "claude" || value === "generic") {
    return value;
  }
  throw new Error(`Unknown agent target: ${value}`);
}

function parseSetupAgents(value: string | undefined): SetupAgentName[] {
  if (!value) {
    throw new Error("Missing agent target");
  }
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
    .flatMap((item): SetupAgentName[] => {
      if (item === "all") {
        return ["all"];
      }
      return [parseAgent(item)];
    });
}

function resolveUserAgent(agent: AgentName, home: string): ResolvedAgentName {
  if (agent !== "auto") {
    return agent === "generic" ? "agents" : agent;
  }
  // ~/.agents is the shared default for Pi and Codex-style runners.
  // Use explicit --agent claude or --agent codex when that private target is intended.
  void home;
  return "agents";
}

function userSkillRoot(agent: string, home: string): string {
  if (agent === "codex") {
    return join(home, ".codex", "skills");
  }
  if (agent === "claude") {
    return join(home, ".claude", "skills");
  }
  if (agent === "agents") {
    return join(home, ".agents", "skills");
  }
  throw new Error(`Unknown agent target: ${agent}`);
}

function runSetup(args: ParsedSetupArgs, commandName: "setup" | "install"): number {
  const targets = resolveSetupTargets(args);

  if (args.dryRun) {
    printSetupPlan(args, targets);
    return 0;
  }

  const installed = targets.flatMap((target) => installSkills(target, { force: args.force }).map((skill) => ({
    target,
    ...skill,
  })));
  printSetupSuccess(installed);
  printLegacySkillWarnings(findLegacySkills(targets));

  if (chooseSetupPng(args)) {
    const rendererDir = setupRenderer(null, { skipBrowser: args.skipBrowser, force: args.forceRenderer });
    console.log(`PNG renderer ready in ${rendererDir}`);
  } else {
    console.log("Skipped PNG renderer setup.");
  }

  if (commandName === "install") {
    console.log("Next time, run `excalidraw-diagrams setup` directly.");
  }

  return 0;
}

function resolveSetupTargets(args: ParsedSetupArgs): SetupTarget[] {
  if (args.project) {
    if (args.agentProvided) {
      throw new Error("--agent/--agents is only valid for user installs; omit it with --project");
    }
    return [resolveSetupTarget({ project: true })];
  }

  const agents = chooseSetupAgents(args);
  const seen = new Set<string>();
  const targets: SetupTarget[] = [];
  for (const agent of agents) {
    const expandedAgents: AgentName[] = agent === "all" ? ["agents", "codex", "claude"] : [agent];
    for (const expandedAgent of expandedAgents) {
      const target = resolveSetupTarget({ agent: expandedAgent });
      if (!seen.has(target.path)) {
        seen.add(target.path);
        targets.push(target);
      }
    }
  }
  return targets;
}

function chooseSetupAgents(args: ParsedSetupArgs): SetupAgentName[] {
  if (args.agentProvided) {
    return args.agents.length > 0 ? args.agents : [args.agent];
  }
  if (args.yes || !process.stdin.isTTY || !process.stdout.isTTY) {
    return [args.agent];
  }
  return promptForAgents();
}

function chooseSetupPng(args: ParsedSetupArgs): boolean {
  if (args.png !== null) {
    return args.png;
  }
  if (args.yes || !process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  return promptForRenderer();
}

function promptForAgents(): SetupAgentName[] {
  const value = promptLine([
    "Choose agent skill targets. Use comma-separated numbers or names:",
    "  1. agents  ~/.agents/skills  [default]",
    "  2. codex   ~/.codex/skills",
    "  3. claude  ~/.claude/skills",
    "  4. all     all user targets",
    "Targets [agents]: ",
  ].join("\n"));
  if (value === "") {
    return ["agents"];
  }
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
    .flatMap((item): SetupAgentName[] => {
      if (item === "1" || item === "agents" || item === "generic") {
        return ["agents"];
      }
      if (item === "2" || item === "codex") {
        return ["codex"];
      }
      if (item === "3" || item === "claude") {
        return ["claude"];
      }
      if (item === "4" || item === "all") {
        return ["all"];
      }
      throw new Error(`Unknown agent target: ${item}`);
    });
}

function promptForRenderer(): boolean {
  const value = promptLine([
    "Install PNG renderer now? It downloads Playwright Chromium.",
    "Renderer [y/N]: ",
  ].join("\n")).toLowerCase();
  return value === "y" || value === "yes";
}

function promptLine(prompt: string): string {
  const fd = openSync("/dev/tty", "r+");
  try {
    writeSync(fd, prompt);
    const buffer = Buffer.alloc(256);
    const bytes = readSync(fd, buffer, 0, buffer.length, null);
    return buffer.toString("utf8", 0, bytes).trim();
  } finally {
    closeSync(fd);
  }
}

function printSetupPlan(args: ParsedSetupArgs, targets: SetupTarget[]): void {
  console.log(`Setup plan for ${NPM_PACKAGE_NAME}`);
  console.log("Global package: already handled by npm install -g");
  console.log("Skill targets:");
  for (const target of targets) {
    console.log(`- ${target.agent}: ${target.root} (${BUNDLED_SKILL_NAMES.join(", ")})`);
  }
  const pngPlan = args.png === null
    ? "ask"
    : args.png
      ? args.skipBrowser ? "setup without browser install" : "setup with Chromium"
      : "skip";
  console.log(`PNG renderer: ${pngPlan}`);
}

function printUsage(): void {
  console.log(`Usage: excalidraw-diagrams <command>

Commands:
  setup       Configure bundled agent skill targets and optional PNG rendering
  install     Deprecated alias for setup
  example     Generate a bundled example diagram
  tree-spec   Render a data-only tree spec JSON
  semantic-redraw-spec
              Render a data-only semantic redraw JSON
`);
}

function printInstallUsage(): void {
  console.log(`Usage: excalidraw-diagrams install [options]

Deprecated alias for:
  excalidraw-diagrams setup [options]

Install the package itself with:
  npm install -g ${NPM_PACKAGE_NAME}

Options:
  --agent agents|codex|claude|generic|auto|all
  --agents agents,codex,claude|all           Install multiple user skill targets
  --provider agents|codex|claude|generic|auto|all
  --providers agents,codex,claude|all        Aliases for --agent/--agents
  --project                                  Install bundled skills into ./skills/
  --force                                    Replace an existing skill directory
  --force-renderer                           Reinstall renderer dependencies even when ready
  --yes, -y                                  Use defaults without prompting
  --png, --with-png                          Prepare PNG renderer dependencies
  --no-png                                   Do not prepare PNG renderer dependencies
  --renderer, --with-renderer                Deprecated aliases for --with-png
  --skip-renderer                            Deprecated alias for --no-png
  --skip-browser                             Prepare renderer but skip Playwright Chromium install
  --dry-run                                  Print the plan without changing the system
`);
}

function printSetupUsage(): void {
  console.log(`Usage: excalidraw-diagrams setup [options]

Run after:
  npm install -g ${NPM_PACKAGE_NAME}

Options:
  --agent auto|agents|codex|claude|generic|all
  --agents agents,codex,claude|all           Install multiple user skill targets
  --provider agents|codex|claude|generic|auto|all
  --providers agents,codex,claude|all        Aliases for --agent/--agents
  --project                                  Install bundled skills into ./skills/
  --force                                    Replace an existing skill directory
  --force-renderer                           Reinstall renderer dependencies even when ready
  --yes, -y                                  Use defaults without prompting
  --png, --with-png                          Prepare PNG renderer dependencies
  --no-png                                   Do not prepare PNG renderer dependencies
  --renderer, --with-renderer                Deprecated aliases for --with-png
  --skip-renderer                            Deprecated alias for --no-png
  --skip-browser                             Prepare renderer but skip Playwright Chromium install
  --dry-run                                  Print the plan without changing the system
`);
}

export function findLegacySkills(targets: readonly SetupTarget[]): Array<{ skillName: string; path: string }> {
  return targets.flatMap((target) => LEGACY_SKILL_NAMES
    .map((skillName) => ({ skillName, path: target.skillPath(skillName) }))
    .filter((item) => existsSync(item.path)));
}

function printLegacySkillWarnings(legacy: Array<{ skillName: string; path: string }>): void {
  if (legacy.length === 0) {
    return;
  }
  console.log("");
  console.log("Warning: skill directories this package no longer ships are still installed.");
  console.log(`\`${LEGACY_SKILL_NAMES.join("`, `")}\` merged into \`${SKILL_NAME}\`; the planning phase now lives in its references/plan-graph.md.`);
  console.log("Your agent still discovers the stale copy, so remove it yourself:");
  for (const item of legacy) {
    console.log(`- rm -rf ${item.path}`);
  }
}

function printSetupSuccess(installed: Array<{ target: SetupTarget; skillName: string; destination: string }>): void {
  console.log(`Installed excalidraw-diagrams skills ${packageVersion()}`);
  console.log("Targets:");
  for (const item of installed) {
    console.log(`- ${item.target.agent}/${item.skillName}: ${item.destination}`);
  }
  console.log("");
  console.log("Next steps:");
  console.log("- Restart or reload your agent if it does not discover new skills automatically.");
  console.log("- Ask the agent to use excalidraw-diagrams for diagram planning and generation.");
  console.log("- Use `npm install @kroffske/excalidraw-diagrams` in projects that run diagram scripts.");
}

function printExampleUsage(): void {
  console.log(`Usage: excalidraw-diagrams example <name> [options]

Examples:
  architecture-semantic-redraw
  excalidraw-js-architecture

Options:
  --out-dir DIR       Output directory, defaults to the selected example path
`);
}

function printTreeSpecUsage(): void {
  console.log(`Usage: excalidraw-diagrams tree-spec spec.json --out output.excalidraw [--png output.png] [--layout auto|tree|wide-tree|process-flow|horizontal-tree]

The JSON spec uses { title, subtitle, layout, root, secondaryEdges, sidecars, options }.
Use this command when a weak/local model should fill data instead of writing a full script.
The default layout is auto: long linear specs render as wrapped process flows, while branching hierarchies stay as measured trees.
`);
}

function printSemanticRedrawSpecUsage(): void {
  console.log(`Usage: excalidraw-diagrams semantic-redraw-spec spec.json --out output.excalidraw [--png output.png] [--strict-edge-directions]

The JSON spec uses { title, subtitle, layout, sections, edges }.
Use this command when a weak/local model should identify architecture sections, finite semantic figures, legacy icon cards, and edges without writing TypeScript.
Explicit figures are card, bullets, badge, actor, store, queue, decision, or note; the renderer owns their presentation.
The renderer validates recipe content, connectable endpoints, decision outcomes, legacy bullets/icons, duplicate section order, and repeated one-icon output before writing.
Declared edge directions are advisory by default; the renderer infers geometry and reports mismatches as warnings. Use --strict-edge-directions to fail on mismatches.
`);
}
