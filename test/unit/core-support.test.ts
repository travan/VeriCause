import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  ensureDir,
  readJsonFile,
  readTextFile,
  walkFiles,
  writeJsonFile,
} from "../../src/core/fs";
import { FileReportStore } from "../../src/core/report-store";
import { FileAnalysisRunStore } from "../../src/core/run-store";
import { AIDiagnosisSchema, InlineScenarioInputSchema, ScenarioDefinitionSchema } from "../../src/core/schemas";
import { resolveCoreConfig } from "../../src/core/config";

describe("core support modules", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves config from environment", () => {
    process.env.SCENARIO_DIR = "custom-scenarios";
    process.env.BASE_OUTPUT_DIR = "custom-artifacts";
    process.env.RUN_CONCURRENCY = "4";
    process.env.ENABLE_TRACE = "true";
    process.env.ENABLE_SUCCESS_SCREENSHOT = "true";
    process.env.AI_PROVIDER = "mock";
    process.env.AI_MODEL = "gpt-5.4";

    const config = resolveCoreConfig();

    expect(config.scenarioDir).toBe(resolve(process.cwd(), "custom-scenarios"));
    expect(config.artifactsDir).toBe(resolve(process.cwd(), "custom-artifacts"));
    expect(config.runConcurrency).toBe(4);
    expect(config.traceEnabled).toBe(true);
    expect(config.successScreenshotEnabled).toBe(true);
    expect(config.defaultAiProvider).toBe("mock");
    expect(config.defaultAiModel).toBe("gpt-5.4");
  });

  it("reads and writes files atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-reliability-fs-"));

    try {
      const targetDir = join(root, "nested");
      const targetFile = join(targetDir, "value.json");

      await ensureDir(targetDir);
      await writeJsonFile(targetFile, { ok: true });

      expect(await readJsonFile<{ ok: boolean }>(targetFile)).toEqual({ ok: true });
      expect(await readTextFile(targetFile)).toContain('"ok": true');
      expect(await walkFiles(root)).toContain(targetFile);

      const temporaryArtifacts = (await walkFiles(root)).filter((file) => file.includes(".tmp-"));
      expect(temporaryArtifacts).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists reports and runs", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "ai-reliability-store-"));

    try {
      const reportStore = new FileReportStore(artifactsDir);
      const runStore = new FileAnalysisRunStore(artifactsDir);

      const report = await reportStore.save({
        reportId: "report-1",
        aiRuntime: { provider: "mock", model: "gpt-5.4" },
        scenario: {
          id: "invalid-selector",
          name: "Invalid selector",
          sourceFile: "scenario.md",
          sourceType: "md",
          url: "https://example.com",
          selector: "#missing",
        },
        firstRun: {
          scenarioId: "invalid-selector",
          runId: "run-1",
          phase: "first_run",
          status: "failed",
          durationMs: 1000,
          timestamp: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      });

      const run = await runStore.save({
        runId: "job-1",
        status: "queued",
        aiRuntime: { provider: "mock", model: "gpt-5.4" },
        scenarioIds: ["invalid-selector"],
        total: 1,
        completed: 0,
        passed: 0,
        failed: 0,
        pending: 1,
        reportIds: [],
        errors: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(await reportStore.getById(report.reportId)).toEqual(report);
      expect(await runStore.getById(run.runId)).toEqual(run);
    } finally {
      await rm(artifactsDir, { recursive: true, force: true });
    }
  });

  it("validates schemas", () => {
    expect(() =>
      ScenarioDefinitionSchema.parse({
        id: "id",
        name: "name",
        sourceFile: "file",
        sourceType: "md",
        url: "https://example.com",
        selector: "#item",
      }),
    ).not.toThrow();

    expect(() => InlineScenarioInputSchema.parse({
      url: "https://example.com",
      selector: "#item",
    })).not.toThrow();

    expect(() =>
      AIDiagnosisSchema.parse({
        predictedCause: "invalid_selector",
        confidence: 0.9,
        summary: "ok",
      }),
    ).not.toThrow();

    expect(() =>
      AIDiagnosisSchema.parse({
        predictedCause: "invalid_selector",
        confidence: 2,
        summary: "bad",
      }),
    ).toThrow();
  });
});
