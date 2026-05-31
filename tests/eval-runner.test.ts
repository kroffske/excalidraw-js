import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("agent evaluation runner", () => {
  it("generates scenario Excalidraw files and an HTML report without rendering", () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "excalidraw-agent-evals-"));
    const result = spawnSync(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      ["evals/run-agent-scenarios.ts", "--skip-render", "--artifact-root", artifactRoot],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    for (const id of [
      "basic-service-flow",
      "rag-answer-trace",
      "trading-risk-gate",
      "model-training-feedback-loop",
      "agent-evaluation-harness",
    ]) {
      const scene = JSON.parse(readFileSync(join(artifactRoot, `${id}.excalidraw`), "utf8"));
      expect(scene.type).toBe("excalidraw");
      expect(scene.elements.length).toBeGreaterThan(0);
      expect(Object.keys(scene.files).length).toBeGreaterThan(0);
    }

    const reportPath = join(artifactRoot, "report.html");
    expect(existsSync(reportPath)).toBe(true);
    expect(readFileSync(reportPath, "utf8")).toContain("Excalidraw Diagrams Agent Evaluation Report");
  });
});
