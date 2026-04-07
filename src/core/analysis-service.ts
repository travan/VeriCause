import { resolve } from "node:path";

import { RoutedAiAnalyzer } from "./ai-analyzer";
import { PlaywrightExecutionEngine } from "./execution-engine";
import { FileReportStore } from "./report-store";
import { FileAnalysisRunStore } from "./run-store";
import { ReliabilityEvaluator } from "./reliability-evaluator";
import { ScenarioLoader } from "./scenario-loader";
import {
  AiRuntimeOptions,
  AnalysisReport,
  AnalysisRun,
  AnalysisRunResults,
  ExecutionResult,
  ResolvedAiRuntimeOptions,
  RunAnalysisInput,
  ScenarioDefinition,
} from "./types";

export class AnalysisService {
  constructor(
    private readonly scenarioLoader: ScenarioLoader,
    private readonly executionEngine: PlaywrightExecutionEngine,
    private readonly aiAnalyzer: RoutedAiAnalyzer,
    private readonly reliabilityEvaluator: ReliabilityEvaluator,
    private readonly reportStore: FileReportStore,
    private readonly runStore: FileAnalysisRunStore,
    private readonly runConcurrency: number,
    private readonly defaultAiRuntime: ResolvedAiRuntimeOptions,
  ) {}

  async discoverScenarios(): Promise<ScenarioDefinition[]> {
    return this.scenarioLoader.discoverScenarios();
  }

  async run(input: RunAnalysisInput): Promise<AnalysisReport | AnalysisReport[]> {
    const aiRuntime = this.resolveAiRuntime(input.ai);

    if (input.runAll) {
      const scenarios = await this.scenarioLoader.discoverScenarios();
      return this.runWithConcurrency(scenarios, this.runConcurrency, (scenario) =>
        this.runScenario(scenario, aiRuntime),
      );
    }

    const scenario = await this.resolveScenario(input);
    return this.runScenario(scenario, aiRuntime);
  }

  async getReport(reportId: string): Promise<AnalysisReport> {
    return this.reportStore.getById(reportId);
  }

  async startRun(input: RunAnalysisInput): Promise<AnalysisRun> {
    const aiRuntime = this.resolveAiRuntime(input.ai);
    const scenarios = input.runAll
      ? await this.scenarioLoader.discoverScenarios()
      : [await this.resolveScenario(input)];
    const now = new Date().toISOString();
    const run: AnalysisRun = {
      runId: this.buildRunId(),
      status: "queued",
      aiRuntime,
      scenarioIds: scenarios.map((scenario) => scenario.id),
      total: scenarios.length,
      completed: 0,
      passed: 0,
      failed: 0,
      pending: scenarios.length,
      reportIds: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.runStore.save(run);
    void this.processRun(run, scenarios);

    return run;
  }

  async getRun(runId: string): Promise<AnalysisRun> {
    return this.runStore.getById(runId);
  }

  async getRunResults(runId: string): Promise<AnalysisRunResults> {
    const run = await this.runStore.getById(runId);
    const reports = await Promise.all(
      run.reportIds.map((reportId) => this.reportStore.getById(reportId)),
    );

    return {
      run,
      reports,
    };
  }

  async close(): Promise<void> {
    await this.executionEngine.close();
  }

  private async resolveScenario(input: RunAnalysisInput): Promise<ScenarioDefinition> {
    if (input.scenario) {
      return this.scenarioLoader.loadInline(input.scenario);
    }

    if (input.filePath) {
      return this.scenarioLoader.loadFromFile(resolve(input.filePath));
    }

    if (input.scenarioId) {
      const scenario = await this.scenarioLoader.loadById(input.scenarioId);

      if (!scenario) {
        throw new Error(`Scenario '${input.scenarioId}' was not found.`);
      }

      return scenario;
    }

    throw new Error("Provide scenarioId, filePath, scenario, or runAll=true.");
  }

  private async runScenario(
    scenario: ScenarioDefinition,
    aiRuntime: ResolvedAiRuntimeOptions,
  ): Promise<AnalysisReport> {
    const firstRun = await this.executionEngine.runFirstAttempt(scenario);

    if (firstRun.status === "passed") {
      const passedReport = this.buildPassedReport(scenario, firstRun, aiRuntime);
      return this.reportStore.save(passedReport);
    }

    const aiDiagnosis = await this.aiAnalyzer.analyze({
      scenario,
      firstRun,
    }, aiRuntime);
    const retryRun = await this.executionEngine.retry(scenario);
    const runtimeEvidence = {
      retryStatus: retryRun.status,
      selectorExists: retryRun.selectorExistsAfterRun ?? null,
      historicalPattern:
        retryRun.status === "passed"
          ? "flaky"
          : retryRun.selectorExistsAfterRun
            ? "unknown"
            : "stable_fail",
      failureSignature: this.detectFailureSignature(
        retryRun.errorMessage,
        retryRun.statusTextAfterRun,
      ),
    } as const;
    const { validationEvidence, verdict } =
      await this.reliabilityEvaluator.validate({
        aiDiagnosis,
        validationEvidence: runtimeEvidence,
      });

    const report: AnalysisReport = {
      reportId: this.buildReportId(scenario.id),
      aiRuntime,
      scenario,
      firstRun,
      retryRun,
      aiDiagnosis,
      validationEvidence,
      verdict,
      createdAt: new Date().toISOString(),
    };

    return this.reportStore.save(report);
  }

  private buildPassedReport(
    scenario: ScenarioDefinition,
    firstRun: ExecutionResult,
    aiRuntime: ResolvedAiRuntimeOptions,
  ): AnalysisReport {
    return {
      reportId: this.buildReportId(scenario.id),
      aiRuntime,
      scenario,
      firstRun,
      createdAt: new Date().toISOString(),
    };
  }

  private resolveAiRuntime(input?: AiRuntimeOptions): ResolvedAiRuntimeOptions {
    return {
      provider: input?.provider?.trim() || this.defaultAiRuntime.provider,
      model: input?.model?.trim() || this.defaultAiRuntime.model,
    };
  }

  private buildReportId(scenarioId: string): string {
    return `${scenarioId}-${Date.now()}`;
  }

  private buildRunId(): string {
    return `run-${Date.now()}`;
  }

  private async runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const normalizedConcurrency = Math.max(1, Math.floor(concurrency));
    const results = new Array<R>(items.length);
    let cursor = 0;

    const runners = Array.from(
      { length: Math.min(normalizedConcurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const currentIndex = cursor;
          cursor += 1;
          results[currentIndex] = await worker(items[currentIndex]);
        }
      },
    );

    await Promise.all(runners);
    return results;
  }

  private async processRun(
    initialRun: AnalysisRun,
    scenarios: ScenarioDefinition[],
  ): Promise<void> {
    const run: AnalysisRun = {
      ...initialRun,
      status: "running",
      updatedAt: new Date().toISOString(),
    };
    await this.runStore.save(run);
    let persistQueue = Promise.resolve();

    const queuePersist = (applyUpdate: () => void): Promise<void> => {
      persistQueue = persistQueue.then(async () => {
        applyUpdate();
        run.updatedAt = new Date().toISOString();
        await this.runStore.save({ ...run });
      });

      return persistQueue;
    };

    try {
      await this.runWithConcurrency(scenarios, this.runConcurrency, async (scenario) => {
        const report = await this.runScenario(scenario, run.aiRuntime);

        await queuePersist(() => {
          run.reportIds.push(report.reportId);
          run.completed += 1;
          run.pending = Math.max(run.total - run.completed, 0);

          if (report.firstRun.status === "passed") {
            run.passed += 1;
          } else {
            run.failed += 1;
          }
        });

        return report;
      });

      await queuePersist(() => {
        run.status = "completed";
      });
    } catch (error) {
      await queuePersist(() => {
        run.status = "failed";
        run.errors.push(error instanceof Error ? error.message : String(error));
      });
    }
  }

  private detectFailureSignature(
    errorMessage: string | undefined,
    statusText?: string,
  ): "timeout" | "detached" | "unknown" {
    const status = statusText?.toLowerCase();

    if (status?.includes("detached")) {
      return "detached";
    }

    if (!errorMessage) {
      return "unknown";
    }

    const normalized = errorMessage.toLowerCase();

    if (normalized.includes("detach")) {
      return "detached";
    }

    if (normalized.includes("timeout")) {
      return "timeout";
    }

    return "unknown";
  }
}
