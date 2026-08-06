import { resolve, sep } from "node:path";

import {
  AiAnalyzer,
  AnalysisRunRepository,
  ExecutionEngine,
  ReportRepository,
  ScenarioRepository,
  VerdictEvaluator,
} from "./ports";
import {
  EvidenceBuilder,
  RuntimeEvidenceBuilder,
} from "./evidence/runtime-evidence-builder";
import { EvaluateDiagnosis } from "./application/evaluate-diagnosis";
import { isAnalysisPipelineError } from "./domain/pipeline";
import {
  AiRuntimeOptions,
  AnalysisReport,
  AnalysisRun,
  AnalysisRunResults,
  ResolvedAiRuntimeOptions,
  RunAnalysisInput,
  ScenarioDefinition,
} from "./types";
import { AiRuntimeOptionsSchema } from "./schemas";

export class AnalysisService {
  private readonly evaluateDiagnosis: EvaluateDiagnosis;

  constructor(
    private readonly scenarioLoader: ScenarioRepository,
    private readonly executionEngine: ExecutionEngine,
    private readonly aiAnalyzer: AiAnalyzer,
    private readonly reliabilityEvaluator: VerdictEvaluator,
    private readonly reportStore: ReportRepository,
    private readonly runStore: AnalysisRunRepository,
    private readonly runConcurrency: number,
    private readonly defaultAiRuntime: ResolvedAiRuntimeOptions,
    private readonly evidenceBuilder: EvidenceBuilder = new RuntimeEvidenceBuilder(),
  ) {
    this.evaluateDiagnosis = new EvaluateDiagnosis(
      executionEngine,
      aiAnalyzer,
      evidenceBuilder,
      reliabilityEvaluator,
      reportStore,
    );
  }

  async discoverScenarios(): Promise<ScenarioDefinition[]> {
    return this.scenarioLoader.discoverScenarios();
  }

  async run(input: RunAnalysisInput): Promise<AnalysisReport | AnalysisReport[]> {
    const aiRuntime = this.resolveAiRuntime(input.ai);

    if (input.runAll) {
      const scenarios = await this.scenarioLoader.discoverScenarios();
      return this.runWithConcurrency(scenarios, this.runConcurrency, (scenario) =>
        this.evaluateDiagnosis.execute(scenario, aiRuntime),
      );
    }

    const scenario = await this.resolveScenario(input);
    return this.evaluateDiagnosis.execute(scenario, aiRuntime);
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
      structuredErrors: [],
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
      const absolutePath = resolve(input.filePath);
      const projectRoot = resolve(process.cwd());
      if (!absolutePath.startsWith(projectRoot + sep)) {
        throw new Error("filePath must be within the project directory.");
      }
      return this.scenarioLoader.loadFromFile(absolutePath);
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

  private resolveAiRuntime(input?: AiRuntimeOptions): ResolvedAiRuntimeOptions {
    const validated = AiRuntimeOptionsSchema.parse(input ?? {});
    return {
      provider: validated.provider || this.defaultAiRuntime.provider,
      model: validated.model || this.defaultAiRuntime.model,
    };
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
      persistQueue = persistQueue
        .then(async () => {
          applyUpdate();
          run.updatedAt = new Date().toISOString();
          await this.runStore.save({ ...run });
        })
        .catch(() => undefined);

      return persistQueue;
    };

    try {
      await this.runWithConcurrency(scenarios, this.runConcurrency, async (scenario) => {
        const report = await this.evaluateDiagnosis.execute(scenario, run.aiRuntime);

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
        if (isAnalysisPipelineError(error)) {
          run.structuredErrors?.push(error.details);
        }
      });
    }
  }

}
