jest.mock("../../src/core/runtime", () => ({
  createCoreRuntime: jest.fn(),
}));

import { ModuleMetadata } from "@nestjs/common/interfaces";
import { MODULE_METADATA } from "@nestjs/common/constants";

import { AnalysisController } from "../../src/server/controllers/analysis.controller";
import { ScenariosController } from "../../src/server/controllers/scenarios.controller";
import { CORE_RUNTIME, CoreRuntimeProvider } from "../../src/server/core-runtime.provider";
import { ServerModule } from "../../src/server/server.module";
import { createCoreRuntime } from "../../src/core/runtime";
import { isTerminalRunStatus, main, parseAnalyzeArgs, printUsage, waitForRun } from "../../src/cli/main";

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

  it("prints usage", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    printUsage();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("npm run cli -- discover"));
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

    expect(controllers).toEqual([ScenariosController, AnalysisController]);
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
      close: jest.fn(async () => undefined),
    };
    (createCoreRuntime as jest.Mock).mockReturnValue(runtime);
    const argv = process.argv;

    try {
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
    }

    expect(logSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(runtime.analysisService.run).toHaveBeenCalledWith({ filePath: "./scenario.md" });
    expect(runtime.close).toHaveBeenCalled();
  });
});
