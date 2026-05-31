import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../src/index.js";

interface ScenarioSet {
  artifact_root: string;
  scenarios: Array<{
    id: string;
    prompt: string;
    expected_output: {
      required_asset_aliases: {
        core: string[];
        trading: string[];
      };
    };
  }>;
}

describe("agent diagram scenarios", () => {
  const data = JSON.parse(readFileSync(join(process.cwd(), "evals", "agent-diagram-scenarios.json"), "utf8")) as ScenarioSet;

  it("defines runnable artifact targets and prompts", () => {
    expect(data.artifact_root).toBe("examples/out/agent-evals");
    expect(data.scenarios.length).toBeGreaterThanOrEqual(5);

    for (const scenario of data.scenarios) {
      expect(scenario.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(scenario.prompt).toContain(`examples/out/agent-evals/${scenario.id}`);
      expect(scenario.expected_output.required_asset_aliases.core.length + scenario.expected_output.required_asset_aliases.trading.length).toBeGreaterThan(0);
    }
  });

  it("references bundled asset aliases that exist", () => {
    const core = AssetRegistry.bundled();
    const trading = AssetRegistry.bundled("trading");

    for (const scenario of data.scenarios) {
      for (const alias of scenario.expected_output.required_asset_aliases.core) {
        expect(core.resolve(alias), `${scenario.id}: core/${alias}`).toBeTruthy();
      }
      for (const alias of scenario.expected_output.required_asset_aliases.trading) {
        expect(trading.resolve(alias), `${scenario.id}: trading/${alias}`).toBeTruthy();
      }
    }
  });
});
