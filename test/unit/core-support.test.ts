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
import {
  AIDiagnosisSchema,
  AiRuntimeOptionsSchema,
  InlineScenarioInputSchema,
  ScenarioDefinitionSchema,
} from "../../src/core/schemas";
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

  it("rejects unsafe AI runtime options", () => {
    // Control characters in model (HTTP header / log injection)
    expect(() =>
      AiRuntimeOptionsSchema.parse({ model: "gpt-4\r\nX-Injected: evil" }),
    ).toThrow();

    // Newline in provider
    expect(() =>
      AiRuntimeOptionsSchema.parse({ provider: "mock\ninjected" }),
    ).toThrow();

    // Provider with uppercase letters
    expect(() =>
      AiRuntimeOptionsSchema.parse({ provider: "OpenAI" }),
    ).toThrow();

    // Model exceeding max length
    expect(() =>
      AiRuntimeOptionsSchema.parse({ model: "a".repeat(201) }),
    ).toThrow();

    // Empty-ish strings are trimmed to "" and allowed (fall back to default later)
    expect(() =>
      AiRuntimeOptionsSchema.parse({ provider: "  ", model: "" }),
    ).not.toThrow();

    // Valid values pass
    expect(() =>
      AiRuntimeOptionsSchema.parse({ provider: "openai-compatible", model: "gpt-5.4" }),
    ).not.toThrow();
  });

  it("rejects unsafe inline scenario inputs", () => {
    // SSRF: file:// protocol blocked
    expect(() =>
      InlineScenarioInputSchema.parse({ url: "file:///etc/passwd", selector: "#x" }),
    ).toThrow("URL must use http:, https:, or fixture: protocol");

    // SSRF: javascript: blocked
    expect(() =>
      InlineScenarioInputSchema.parse({ url: "javascript:alert(1)", selector: "#x" }),
    ).toThrow();

    // fixture:// allowed (used in tests)
    expect(() =>
      InlineScenarioInputSchema.parse({ url: "fixture://invalid-selector", selector: "#x" }),
    ).not.toThrow();

    // Path traversal in id
    expect(() =>
      InlineScenarioInputSchema.parse({ id: "../../etc/passwd", url: "https://example.com", selector: "#x" }),
    ).toThrow("id must be alphanumeric");

    // Null byte in id
    expect(() =>
      InlineScenarioInputSchema.parse({ id: "valid\x00id", url: "https://example.com", selector: "#x" }),
    ).toThrow();
  });

  it("rejects unsafe report and run IDs in stores", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "ai-reliability-store-sec-"));

    try {
      const reportStore = new FileReportStore(artifactsDir);
      const runStore = new FileAnalysisRunStore(artifactsDir);

      // Path traversal via reportId
      await expect(reportStore.getById("../../etc/passwd")).rejects.toThrow(
        "Invalid report ID",
      );
      await expect(reportStore.save({
        reportId: "../escape",
      } as never)).rejects.toThrow("Invalid report ID");

      // Path traversal via runId
      await expect(runStore.getById("../../../root")).rejects.toThrow(
        "Invalid run ID",
      );

      // Null byte in ID
      await expect(reportStore.getById("report\x00evil")).rejects.toThrow(
        "Invalid report ID",
      );
    } finally {
      await rm(artifactsDir, { recursive: true, force: true });
    }
  });
});
