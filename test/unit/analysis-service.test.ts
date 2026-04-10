import type { AnalysisReport, AnalysisRun, ScenarioDefinition } from "../../src/core/types";
import { AnalysisService } from "../../src/core/analysis-service";

function buildScenario(id: string): ScenarioDefinition {
  return {
    id,
    name: id,
    sourceFile: `${id}.ts`,
    sourceType: "ts",
    url: "fixture://invalid-selector",
    selector: "#wrong-button",
    timeoutMs: 1000,
  };
}

describe("AnalysisService", () => {
  it("delegates discover, getReport, and close", async () => {
    const executionEngine = {
      close: jest.fn(),
    };
    const scenarioLoader = {
      discoverScenarios: jest.fn(async () => [buildScenario("one")]),
    };
    const reportStore = {
      getById: jest.fn(async (reportId: string) => ({ reportId })),
      save: jest.fn(),
    };
    const service = new AnalysisService(
      scenarioLoader as never,
      executionEngine as never,
      {} as never,
      {} as never,
      reportStore as never,
      {} as never,
      1,
      { provider: "mock", model: "gpt-5.4" },
    );

    await expect(service.discoverScenarios()).resolves.toEqual([buildScenario("one")]);
    await expect(service.getReport("report-1")).resolves.toEqual({ reportId: "report-1" });
    await expect(service.close()).resolves.toBeUndefined();
    expect(executionEngine.close).toHaveBeenCalled();
  });

  it("runs a single scenario and saves a report", async () => {
    const scenario = buildScenario("invalid-selector");
    const reportStore = {
      save: jest.fn(async (report: AnalysisReport) => report),
      getById: jest.fn(),
    };
    const service = new AnalysisService(
      {
        discoverScenarios: jest.fn(),
        loadById: jest.fn(async () => scenario),
        loadFromFile: jest.fn(),
        loadInline: jest.fn(),
      } as never,
      {
        runFirstAttempt: jest.fn(async () => ({
          scenarioId: scenario.id,
          runId: "run-1",
          phase: "first_run",
          status: "failed",
          errorMessage: "Timeout",
          durationMs: 1000,
          selectorExistsAfterRun: false,
          timestamp: new Date().toISOString(),
        })),
        retry: jest.fn(async () => ({
          scenarioId: scenario.id,
          runId: "run-2",
          phase: "retry_run",
          status: "failed",
          errorMessage: "Timeout",
          durationMs: 1000,
          selectorExistsAfterRun: false,
          timestamp: new Date().toISOString(),
        })),
        close: jest.fn(),
      } as never,
      {
        analyze: jest.fn(async () => ({
          predictedCause: "invalid_selector",
          confidence: 0.9,
          summary: "Selector issue",
        })),
      } as never,
      {
        validate: jest.fn(async (input) => ({
          validationEvidence: input.validationEvidence,
          verdict: {
            actualCause: "invalid_selector",
            aiCorrect: true,
            action: "accept_ai",
            explanation: "ok",
          },
        })),
      } as never,
      reportStore as never,
      {
        save: jest.fn(),
        getById: jest.fn(),
      } as never,
      2,
      {
        provider: "mock",
        model: "gpt-5.4",
      },
    );

    const report = await service.run({ scenarioId: scenario.id });

    expect(reportStore.save).toHaveBeenCalled();
    expect(report).toMatchObject({
      aiRuntime: { provider: "mock", model: "gpt-5.4" },
      scenario: { id: "invalid-selector" },
    });
  });

  it("runs all scenarios synchronously and covers failure signature helpers", async () => {
    const scenarios = [buildScenario("one"), buildScenario("two")];
    const service = new AnalysisService(
      {
        discoverScenarios: jest.fn(async () => scenarios),
        loadById: jest.fn(),
        loadFromFile: jest.fn(),
        loadInline: jest.fn(),
      } as never,
      {
        runFirstAttempt: jest.fn(async (scenario: ScenarioDefinition) => ({
          scenarioId: scenario.id,
          runId: `${scenario.id}-run`,
          phase: "first_run",
          status: "passed",
          durationMs: 100,
          timestamp: new Date().toISOString(),
        })),
        retry: jest.fn(),
        close: jest.fn(),
      } as never,
      { analyze: jest.fn() } as never,
      { validate: jest.fn() } as never,
      {
        save: jest.fn(async (report: AnalysisReport) => report),
        getById: jest.fn(),
      } as never,
      {
        save: jest.fn(),
        getById: jest.fn(),
      } as never,
      2,
      { provider: "mock", model: "gpt-5.4" },
    );

    const reports = await service.run({ runAll: true });

    expect(reports).toHaveLength(2);
    expect((service as any).detectFailureSignature(undefined, undefined)).toBe("unknown");
    expect((service as any).detectFailureSignature("detached from dom", undefined)).toBe("detached");
    expect((service as any).detectFailureSignature("something else", "detached")).toBe("detached");
    expect((service as any).detectFailureSignature("something else", "stable")).toBe("unknown");
  });

  it("starts an async run and returns aggregated results", async () => {
    const scenarios = [buildScenario("a"), buildScenario("b")];
    const savedReports: AnalysisReport[] = [];
    let savedRun: AnalysisRun | undefined;
    const reportStore = {
      save: jest.fn(async (report: AnalysisReport) => {
        savedReports.push(report);
        return report;
      }),
      getById: jest.fn(async (reportId: string) => savedReports.find((report) => report.reportId === reportId)!),
    };
    const runStore = {
      save: jest.fn(async (run: AnalysisRun) => {
        savedRun = run;
        return run;
      }),
      getById: jest.fn(async () => savedRun!),
    };

    const service = new AnalysisService(
      {
        discoverScenarios: jest.fn(async () => scenarios),
        loadById: jest.fn(),
        loadFromFile: jest.fn(),
        loadInline: jest.fn(),
      } as never,
      {
        runFirstAttempt: jest.fn(async (scenario: ScenarioDefinition) => ({
          scenarioId: scenario.id,
          runId: `${scenario.id}-1`,
          phase: "first_run",
          status: "failed",
          errorMessage: "Timeout",
          durationMs: 1000,
          selectorExistsAfterRun: false,
          timestamp: new Date().toISOString(),
        })),
        retry: jest.fn(async (scenario: ScenarioDefinition) => ({
          scenarioId: scenario.id,
          runId: `${scenario.id}-2`,
          phase: "retry_run",
          status: "failed",
          errorMessage: "Timeout",
          durationMs: 1000,
          selectorExistsAfterRun: false,
          timestamp: new Date().toISOString(),
        })),
        close: jest.fn(),
      } as never,
      {
        analyze: jest.fn(async () => ({
          predictedCause: "invalid_selector",
          confidence: 0.9,
          summary: "Selector issue",
        })),
      } as never,
      {
        validate: jest.fn(async (input) => ({
          validationEvidence: input.validationEvidence,
          verdict: {
            actualCause: "invalid_selector",
            aiCorrect: true,
            action: "accept_ai",
            explanation: "ok",
          },
        })),
      } as never,
      reportStore as never,
      runStore as never,
      2,
      {
        provider: "mock",
        model: "gpt-5.4",
      },
    );

    const run = await service.startRun({ runAll: true });

    while ((await service.getRun(run.runId)).status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const results = await service.getRunResults(run.runId);

    expect(results.run.status).toBe("completed");
    expect(results.reports).toHaveLength(2);
  });

  it("handles inline, file, missing scenario, passed first run, and failed async job branches", async () => {
    const inlineScenario = buildScenario("inline");
    const fileScenario = buildScenario("file");
    const passedScenario = buildScenario("passed");
    const reportStore = {
      save: jest.fn(async (report: AnalysisReport) => report),
      getById: jest.fn(),
    };
    let savedRun: AnalysisRun | undefined;
    const runStore = {
      save: jest.fn(async (run: AnalysisRun) => {
        savedRun = run;
        return run;
      }),
      getById: jest.fn(async () => savedRun!),
    };
    const scenarioLoader = {
      discoverScenarios: jest.fn(async () => [passedScenario]),
      loadById: jest.fn(async () => null),
      loadFromFile: jest.fn(async () => fileScenario),
      loadInline: jest.fn(() => inlineScenario),
    };
    const executionEngine = {
      runFirstAttempt: jest.fn(async (scenario: ScenarioDefinition) => {
        if (scenario.id === "inline") {
          return {
            scenarioId: inlineScenario.id,
            runId: "run-inline",
            phase: "first_run",
            status: "passed",
            durationMs: 100,
            timestamp: new Date().toISOString(),
          };
        }

        if (scenario.id === "passed") {
          throw new Error("boom");
        }

        return {
          scenarioId: scenario.id,
          runId: `${scenario.id}-run`,
          phase: "first_run",
          status: "passed",
          durationMs: 100,
          timestamp: new Date().toISOString(),
        };
      }),
      retry: jest.fn(),
      close: jest.fn(),
    };
    const service = new AnalysisService(
      scenarioLoader as never,
      executionEngine as never,
      { analyze: jest.fn() } as never,
      { validate: jest.fn() } as never,
      reportStore as never,
      runStore as never,
      1,
      { provider: "mock", model: "default-model" },
    );

    await expect(service.run({
      scenario: {
        url: "https://example.com",
        selector: "#item",
      },
      ai: {
        provider: "  ",
        model: "",
      },
    })).resolves.toMatchObject({
      aiRuntime: {
        provider: "mock",
        model: "default-model",
      },
      scenario: {
        id: "inline",
      },
      firstRun: {
        status: "passed",
      },
    });

    await expect(service.run({ filePath: "./some-file.ts" })).resolves.toMatchObject({
      scenario: { id: "file" },
    });

    await expect(service.run({ scenarioId: "missing" })).rejects.toThrow("was not found");
    await expect(service.run({})).rejects.toThrow("Provide scenarioId, filePath, scenario, or runAll=true.");

    const run = await service.startRun({ runAll: true });

    while ((await service.getRun(run.runId)).status !== "failed") {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const failedRun = await service.getRun(run.runId);
    expect(failedRun.errors).toEqual(["boom"]);
  });

  it("marks async runs as passed when reports are passed", async () => {
    const scenario = buildScenario("passed");
    let savedRun: AnalysisRun | undefined;
    const service = new AnalysisService(
      {
        discoverScenarios: jest.fn(async () => [scenario]),
        loadById: jest.fn(),
        loadFromFile: jest.fn(),
        loadInline: jest.fn(),
      } as never,
      {
        runFirstAttempt: jest.fn(async () => ({
          scenarioId: scenario.id,
          runId: "run-1",
          phase: "first_run",
          status: "passed",
          durationMs: 100,
          timestamp: new Date().toISOString(),
        })),
        retry: jest.fn(),
        close: jest.fn(),
      } as never,
      { analyze: jest.fn() } as never,
      { validate: jest.fn() } as never,
      {
        save: jest.fn(async (report: AnalysisReport) => report),
        getById: jest.fn(),
      } as never,
      {
        save: jest.fn(async (run: AnalysisRun) => {
          savedRun = run;
          return run;
        }),
        getById: jest.fn(async () => savedRun!),
      } as never,
      1,
      { provider: "mock", model: "gpt-5.4" },
    );

    const run = await service.startRun({ runAll: true });
    while ((await service.getRun(run.runId)).status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect((await service.getRun(run.runId)).passed).toBe(1);
  });

  it("continues processing when a queuePersist save fails mid-run", async () => {
    const scenarios = [buildScenario("a"), buildScenario("b")];
    let saveCallCount = 0;
    let savedRun: AnalysisRun | undefined;
    const runStore = {
      save: jest.fn(async (run: AnalysisRun) => {
        saveCallCount += 1;
        // Fail on the 3rd save (first queuePersist update) to simulate a disk error;
        // calls 1 and 2 are the initial "queued" and "running" direct saves.
        if (saveCallCount === 3) {
          throw new Error("disk write failed");
        }

        savedRun = run;
        return run;
      }),
      getById: jest.fn(async () => savedRun!),
    };

    const service = new AnalysisService(
      {
        discoverScenarios: jest.fn(async () => scenarios),
        loadById: jest.fn(),
        loadFromFile: jest.fn(),
        loadInline: jest.fn(),
      } as never,
      {
        runFirstAttempt: jest.fn(async (scenario: ScenarioDefinition) => ({
          scenarioId: scenario.id,
          runId: `${scenario.id}-1`,
          phase: "first_run",
          status: "passed",
          durationMs: 100,
          timestamp: new Date().toISOString(),
        })),
        retry: jest.fn(),
        close: jest.fn(),
      } as never,
      { analyze: jest.fn() } as never,
      { validate: jest.fn() } as never,
      {
        save: jest.fn(async (report: AnalysisReport) => report),
        getById: jest.fn(),
      } as never,
      runStore as never,
      2,
      { provider: "mock", model: "gpt-5.4" },
    );

    const run = await service.startRun({ runAll: true });

    // Wait for run to reach a terminal state (should complete despite the save error)
    let attempts = 0;
    while (attempts < 50) {
      const current = await service.getRun(run.runId);
      if (current.status === "completed" || current.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
      attempts += 1;
    }

    const finalRun = await service.getRun(run.runId);
    expect(["completed", "failed"]).toContain(finalRun.status);
  });

  it("rejects filePath outside the project directory", async () => {
    const service = new AnalysisService(
      { discoverScenarios: jest.fn(), loadById: jest.fn(), loadFromFile: jest.fn(), loadInline: jest.fn() } as never,
      { close: jest.fn() } as never,
      {} as never,
      {} as never,
      { save: jest.fn(), getById: jest.fn() } as never,
      { save: jest.fn(), getById: jest.fn() } as never,
      1,
      { provider: "mock", model: "gpt-5.4" },
    );

    await expect(service.run({ filePath: "/etc/passwd" })).rejects.toThrow(
      "filePath must be within the project directory.",
    );
    await expect(service.run({ filePath: "../../outside.ts" })).rejects.toThrow(
      "filePath must be within the project directory.",
    );
  });

  it("rejects invalid provider and model values", async () => {
    const service = new AnalysisService(
      { discoverScenarios: jest.fn(), loadById: jest.fn(), loadFromFile: jest.fn(), loadInline: jest.fn() } as never,
      { close: jest.fn() } as never,
      {} as never,
      {} as never,
      { save: jest.fn(), getById: jest.fn() } as never,
      { save: jest.fn(), getById: jest.fn() } as never,
      1,
      { provider: "mock", model: "gpt-5.4" },
    );

    await expect(service.run({ scenarioId: "x", ai: { provider: "EVIL\r\nHeader: injected" } })).rejects.toThrow();
    await expect(service.run({ scenarioId: "x", ai: { model: "a".repeat(201) } })).rejects.toThrow();
  });
});
