jest.mock("../../src/core/runtime", () => ({
  createCoreRuntime: jest.fn(),
}));

import { ModuleMetadata } from "@nestjs/common/interfaces";
import { MODULE_METADATA } from "@nestjs/common/constants";

import { AnalysisController } from "../../src/server/controllers/analysis.controller";
import { EvaluationController } from "../../src/server/controllers/evaluation.controller";
import { GuardrailController } from "../../src/server/controllers/guardrail.controller";
import { VerificationController } from "../../src/server/controllers/verification.controller";
import { ScenariosController } from "../../src/server/controllers/scenarios.controller";
import { CORE_RUNTIME, CoreRuntimeProvider } from "../../src/server/core-runtime.provider";
import { ServerModule } from "../../src/server/server.module";
import { createCoreRuntime } from "../../src/core/runtime";
import {
  isTerminalRunStatus,
  main,
  parseAnalyzeArgs,
  parseCompareArgs,
  parseEvaluateArgs,
  parseGuardArgs,
  parseVerifyArgs,
  printUsage,
  waitForRun,
} from "../../src/cli/main";

const actualRuntimeModule = jest.requireActual("../../src/core/runtime") as typeof import("../../src/core/runtime");

jest.mock("@nestjs/core", () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

describe("adapter and entrypoint modules", () => {
  it("parses CLI analyze arguments", () => {
    expect(parseAnalyzeArgs(["--all", "--async", "--provider", "mock", "--model", "gpt-5.4"]))
      .toEqual({
        input: {
          runAll: true,
          ai: {
            provider: "mock",
            model: "gpt-5.4",
          },
        },
        asyncMode: true,
      });
    expect(parseAnalyzeArgs(["--file", "./scenario.md"])).toEqual({
      input: {
        filePath: "./scenario.md",
      },
      asyncMode: false,
    });
    expect(isTerminalRunStatus("completed")).toBe(true);
    expect(isTerminalRunStatus("running")).toBe(false);
  });

  it("rejects mutually exclusive CLI flag combinations", () => {
    expect(() => parseAnalyzeArgs(["--all", "--scenario", "x"])).toThrow(
      "--all cannot be combined with --scenario or --file.",
    );
    expect(() => parseAnalyzeArgs(["--all", "--file", "./x"])).toThrow(
      "--all cannot be combined with --scenario or --file.",
    );
    expect(() => parseAnalyzeArgs(["--scenario", "x", "--file", "./y"])).toThrow(
      "--scenario and --file cannot be combined.",
    );
    expect(parseEvaluateArgs(["--dataset", "./dataset.json"])).toEqual({
      datasetPath: "./dataset.json",
      thresholds: {},
    });
    expect(parseEvaluateArgs([
      "--dataset", "./dataset.json",
      "--min-decision-accuracy", "0.95",
      "--max-false-accept-rate", "0.01",
    ])).toEqual({
      datasetPath: "./dataset.json",
      thresholds: { minDecisionAccuracy: 0.95, maxFalseAcceptRate: 0.01 },
    });
    expect(() => parseEvaluateArgs([])).toThrow("evaluate requires --dataset <path>.");
    expect(() => parseEvaluateArgs([
      "--dataset", "./dataset.json", "--max-inconclusive-rate", "2",
    ])).toThrow();
    expect(parseCompareArgs([
      "--baseline", "evaluation-1", "--candidate", "evaluation-2",
    ])).toEqual({
      baselineEvaluationId: "evaluation-1",
      candidateEvaluationId: "evaluation-2",
    });
    expect(() => parseCompareArgs(["--baseline", "evaluation-1"])).toThrow(
      "compare requires",
    );
    expect(parseGuardArgs(["--report", "report-1", "--risk", "high"])).toEqual({
      reportId: "report-1",
      risk: "high",
    });
    expect(() => parseGuardArgs(["--report", "report-1", "--risk", "unsafe"]))
      .toThrow();
    expect(parseVerifyArgs(["--input", "./verification/api-status.json"])).toEqual({
      inputPath: "./verification/api-status.json",
    });
    expect(() => parseVerifyArgs([])).toThrow("verify requires --input <path>");
  });

  it("prints usage", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    printUsage();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("npx ai-reliability-layer"));
  });

  it("waits for runs until completion", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = {
      analysisService: {
        getRun: jest
          .fn()
          .mockResolvedValueOnce({
            runId: "run-1",
            status: "running",
            completed: 0,
            total: 1,
            failed: 0,
            passed: 0,
            pending: 1,
          })
          .mockResolvedValueOnce({
            runId: "run-1",
            status: "completed",
            completed: 1,
            total: 1,
            failed: 0,
            passed: 1,
            pending: 0,
          }),
      },
    };
    const timeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(((
      cb: TimerHandler,
    ) => {
      if (typeof cb === "function") {
        cb();
      }
      return 0 as never;
    }) as unknown as typeof setTimeout);

    await waitForRun(runtime as never, "run-1");

    expect(errorSpy).toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });

  it("creates a runtime composition object", async () => {
    const runtime = actualRuntimeModule.createCoreRuntime();

    expect(runtime.analysisService).toBeDefined();
    expect(runtime.scenarioLoader).toBeDefined();
    expect(runtime.reportStore).toBeDefined();
    expect(runtime.runStore).toBeDefined();

    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it("exposes Nest provider and module metadata", () => {
    const provider = CoreRuntimeProvider as {
      provide: symbol;
      useFactory: () => unknown;
    };

    expect(CORE_RUNTIME).toBeDefined();
    (createCoreRuntime as jest.Mock).mockReturnValue(actualRuntimeModule.createCoreRuntime());

    expect(provider.provide).toBe(CORE_RUNTIME);
    expect(typeof provider.useFactory).toBe("function");
    expect(provider.useFactory()).toMatchObject({
      analysisService: expect.anything(),
    });

    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ServerModule,
    ) as ModuleMetadata["controllers"];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ServerModule,
    ) as ModuleMetadata["providers"];

    expect(controllers).toEqual([
      ScenariosController,
      AnalysisController,
      EvaluationController,
      GuardrailController,
      VerificationController,
    ]);
    expect(providers).toEqual([CoreRuntimeProvider]);
  });

  it("calls analysis controller methods with merged AI headers", async () => {
    const runtime = {
      analysisService: {
        run: jest.fn(async (input) => input),
        startRun: jest.fn(async (input) => ({ runId: "run-1", ...input })),
        getReport: jest.fn(async (reportId) => ({ reportId })),
        getRun: jest.fn(async (runId) => ({ runId })),
        getRunResults: jest.fn(async (runId) => ({ runId, reports: [] })),
      },
    };
    const controller = new AnalysisController(runtime as never);

    await expect(
      controller.run({ scenarioId: "invalid-selector" }, "mock", "gpt-5.4"),
    ).resolves.toEqual({
      status: "completed",
      result: {
        scenarioId: "invalid-selector",
        ai: {
          provider: "mock",
          model: "gpt-5.4",
        },
      },
    });

    await expect(
      controller.startRun({ runAll: true }, "mock", "gpt-5.4"),
    ).resolves.toEqual({
      status: "queued",
      run: expect.objectContaining({
        runId: "run-1",
      }),
    });

    await expect(
      controller.run({ scenarioId: "invalid-selector", ai: { provider: "body", model: "body-model" } }, undefined, undefined),
    ).resolves.toEqual({
      status: "completed",
      result: {
        scenarioId: "invalid-selector",
        ai: {
          provider: "body",
          model: "body-model",
        },
      },
    });

    await expect(controller.getReport("report-1")).resolves.toEqual({
      report: { reportId: "report-1" },
    });
    await expect(controller.getRun("run-1")).resolves.toEqual({
      run: { runId: "run-1" },
    });
    await expect(controller.getRunResults("run-1")).resolves.toEqual({
      runId: "run-1",
      reports: [],
    });
  });

  it("calls scenarios controller discover", async () => {
    const controller = new ScenariosController({
      analysisService: {
        discoverScenarios: jest.fn(async () => [{ id: "invalid-selector" }]),
      },
    } as never);

    await expect(controller.discover()).resolves.toEqual({
      scenarios: [{ id: "invalid-selector" }],
    });
  });

  it("runs evaluation datasets through the evaluation controller", async () => {
    const evaluationService = {
      run: jest.fn(async (cases, thresholds) => ({ cases, thresholds })),
      getById: jest.fn(async (evaluationId) => ({ evaluationId })),
      compare: jest.fn(async (baselineEvaluationId, candidateEvaluationId) => ({
        baselineEvaluationId,
        candidateEvaluationId,
      })),
    };
    const controller = new EvaluationController({ evaluationService } as never);
    const cases = [{
      id: "case-1",
      input: { scenarioId: "invalid-selector" },
      groundTruth: { value: "invalid_selector" as const, source: "fixture" },
    }];

    await expect(controller.run({ cases })).resolves.toEqual({
      status: "completed",
      result: { cases, thresholds: {} },
    });
    await expect(controller.getById("evaluation-1")).resolves.toEqual({
      result: { evaluationId: "evaluation-1" },
    });
    await expect(controller.compare({
      baselineEvaluationId: "evaluation-1",
      candidateEvaluationId: "evaluation-2",
    })).resolves.toEqual({
      result: {
        baselineEvaluationId: "evaluation-1",
        candidateEvaluationId: "evaluation-2",
      },
    });
  });

  it("applies and reads guardrail decisions through the controller", async () => {
    const guardrailService = {
      decide: jest.fn(async (input) => ({ decisionId: "decision-1", ...input })),
      getById: jest.fn(async (decisionId) => ({ decisionId })),
    };
    const controller = new GuardrailController({ guardrailService } as never);

    await expect(controller.decide({ reportId: "report-1", risk: "high" }))
      .resolves.toEqual({
        decision: { decisionId: "decision-1", reportId: "report-1", risk: "high" },
      });
    await expect(controller.getById("decision-1")).resolves.toEqual({
      decision: { decisionId: "decision-1" },
    });
  });

  it("verifies structured runtime evidence through the controller", () => {
    const runtimeVerificationService = { verify: jest.fn((input) => ({ input })) };
    const controller = new VerificationController({ runtimeVerificationService } as never);
    const input = {
      target: "api" as const,
      claim: {
        id: "claim-1",
        subject: "api",
        predicate: "status_code",
        expected: 200,
        confidence: 0.9,
        rationale: "test",
        source: "ai" as const,
      },
      evidence: {
        items: [{
          id: "observation-1",
          type: "api.status_code",
          value: 200,
          source: "test",
          observedAt: "2026-08-06T00:00:00.000Z",
        }],
      },
    };

    expect(controller.run(input)).toEqual({ result: { input } });
  });

  it("runs CLI main branches", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = {
      analysisService: {
        discoverScenarios: jest.fn(async () => [{ id: "one" }]),
        run: jest.fn(async () => ({ ok: true })),
        startRun: jest.fn(async () => ({ runId: "run-1", total: 1 })),
        getRunResults: jest.fn(async () => ({ run: { status: "completed" }, result: [] })),
        getRun: jest.fn(async () => ({
          runId: "run-1",
          status: "completed",
          completed: 1,
          total: 1,
          failed: 0,
          passed: 1,
          pending: 0,
        })),
      },
      evaluationService: {
        run: jest.fn(async () => ({ evaluationId: "evaluation-1" })),
      },
      guardrailService: {
        decide: jest.fn(async () => ({ action: "allow" })),
      },
      runtimeVerificationService: {
        verify: jest.fn(() => ({ coreVerdict: { status: "supported" } })),
      },
      close: jest.fn(async () => undefined),
    };
    (createCoreRuntime as jest.Mock).mockReturnValue(runtime);
    const argv = process.argv;
    const exitCode = process.exitCode;

    try {
      process.exitCode = 0;
      process.argv = ["node", "cli", "discover"];
      await main();

      process.argv = ["node", "cli", "analyze", "--scenario", "invalid-selector"];
      await main();

      process.argv = ["node", "cli", "analyze", "--file", "./scenario.md"];
      await main();

      process.argv = ["node", "cli", "analyze", "--all", "--async"];
      await main();

      process.argv = ["node", "cli"];
      await main();

      process.argv = ["node", "cli", "unknown"];
      await main();
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
    }

    expect(logSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(runtime.analysisService.run).toHaveBeenCalledWith({ filePath: "./scenario.md" });
    expect(runtime.close).toHaveBeenCalled();
  });
});
