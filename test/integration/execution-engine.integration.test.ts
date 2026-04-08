import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { PlaywrightExecutionEngine } from "../../src/core/execution-engine";

describe("PlaywrightExecutionEngine", () => {
  it("runs real fixtures and produces expected runtime behavior", async () => {
    const artifactsDir = await mkdtemp(resolve(tmpdir(), "ai-reliability-engine-"));
    const engine = new PlaywrightExecutionEngine(
      artifactsDir,
      resolve(process.cwd(), "fixtures/pages"),
      false,
      false,
    );

    try {
      const invalid = await engine.runFirstAttempt({
        id: "invalid-selector",
        name: "Invalid selector",
        sourceFile: "scenario.md",
        sourceType: "md",
        url: "fixture://invalid-selector",
        selector: "#wrong-button",
        timeoutMs: 1000,
      });
      const delayedFirst = await engine.runFirstAttempt({
        id: "delayed-element",
        name: "Delayed element",
        sourceFile: "scenario.ts",
        sourceType: "ts",
        url: "fixture://delayed-element",
        selector: "#submit",
        timeoutMs: 1000,
      });
      const delayedRetry = await engine.retry({
        id: "delayed-element",
        name: "Delayed element",
        sourceFile: "scenario.ts",
        sourceType: "ts",
        url: "fixture://delayed-element",
        selector: "#submit",
        timeoutMs: 1000,
      });

      expect(invalid.status).toBe("failed");
      expect(invalid.selectorExistsAfterRun).toBe(false);
      expect(delayedFirst.status).toBe("failed");
      expect(delayedRetry.status).toBe("passed");
      expect(delayedRetry.selectorExistsAfterRun).toBe(true);
    } finally {
      await engine.close();
      await rm(artifactsDir, { recursive: true, force: true });
    }
  }, 20000);
});
