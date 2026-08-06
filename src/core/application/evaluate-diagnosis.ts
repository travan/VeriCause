import { EvidenceBuilder } from "../evidence/runtime-evidence-builder";
import {
  AiAnalyzer,
  ExecutionEngine,
  ReportRepository,
  VerdictEvaluator,
} from "../ports";
import {
  AnalysisReport,
  ResolvedAiRuntimeOptions,
  ScenarioDefinition,
} from "../types";
import {
  AnalysisPipelineError,
  PipelineErrorCategory,
  PipelineStage,
  StageEvent,
  StructuredPipelineError,
} from "../domain/pipeline";

export class EvaluateDiagnosis {
  constructor(
    private readonly executionEngine: ExecutionEngine,
    private readonly aiAnalyzer: AiAnalyzer,
    private readonly evidenceBuilder: EvidenceBuilder,
    private readonly verdictEvaluator: VerdictEvaluator,
    private readonly reportRepository: ReportRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    scenario: ScenarioDefinition,
    aiRuntime: ResolvedAiRuntimeOptions,
  ): Promise<AnalysisReport> {
    const stageEvents: StageEvent[] = [];
    const firstRun = await this.runStage(
      stageEvents,
      "first_execution",
      "system",
      () => this.executionEngine.runFirstAttempt(scenario),
      (result) => ({
        executionStatus: result.status,
        targetFailure: result.status === "failed",
        failureCategory: result.status === "failed" ? "target" : "none",
      }),
    );

    if (firstRun.status === "passed") {
      const report: AnalysisReport = {
        reportId: this.buildReportId(scenario.id),
        aiRuntime,
        scenario,
        firstRun,
        stageEvents,
        createdAt: this.now().toISOString(),
      };
      return this.persist(stageEvents, report);
    }

    const aiDiagnosis = await this.runStage(
      stageEvents,
      "ai_analysis",
      "analysis",
      () => this.aiAnalyzer.analyze({ scenario, firstRun }, aiRuntime),
    );
    const retryRun = await this.runStage(
      stageEvents,
      "retry_execution",
      "system",
      () => this.executionEngine.retry(scenario),
      (result) => ({
        executionStatus: result.status,
        targetFailure: result.status === "failed",
        failureCategory: result.status === "failed" ? "target" : "none",
      }),
    );
    const runtimeEvidence = await this.runStage(
      stageEvents,
      "evidence_collection",
      "analysis",
      () => this.evidenceBuilder.build(retryRun),
    );
    const { validationEvidence, verdict, claim, evidence, coreVerdict } =
      await this.runStage(
        stageEvents,
        "claim_verification",
        "analysis",
        () => this.verdictEvaluator.validate({
          aiDiagnosis,
          validationEvidence: runtimeEvidence,
        }),
      );

    const report: AnalysisReport = {
      reportId: this.buildReportId(scenario.id),
      aiRuntime,
      scenario,
      firstRun,
      retryRun,
      aiDiagnosis,
      validationEvidence,
      verdict,
      claim,
      evidence,
      coreVerdict,
      stageEvents,
      createdAt: this.now().toISOString(),
    };
    return this.persist(stageEvents, report);
  }

  private async persist(
    stageEvents: StageEvent[],
    report: AnalysisReport,
  ): Promise<AnalysisReport> {
    try {
      return await this.reportRepository.save(report);
    } catch (error) {
      throw this.buildPipelineError(
        "report_persistence",
        "system",
        error,
        stageEvents,
      );
    }
  }

  private async runStage<T>(
    events: StageEvent[],
    stage: PipelineStage,
    category: PipelineErrorCategory,
    operation: () => T | Promise<T>,
    details?: (result: T) => StageEvent["details"],
  ): Promise<T> {
    const startedAt = this.now();
    events.push({ stage, status: "started", timestamp: startedAt.toISOString() });

    try {
      const result = await operation();
      events.push({
        stage,
        status: "completed",
        timestamp: this.now().toISOString(),
        durationMs: Math.max(this.now().getTime() - startedAt.getTime(), 0),
        details: details?.(result),
      });
      return result;
    } catch (error) {
      throw this.buildPipelineError(stage, category, error, events, startedAt);
    }
  }

  private buildPipelineError(
    stage: PipelineStage,
    category: PipelineErrorCategory,
    cause: unknown,
    events: StageEvent[],
    startedAt = this.now(),
  ): AnalysisPipelineError {
    const message = cause instanceof Error ? cause.message : String(cause);
    const details: StructuredPipelineError = {
      code: `${stage.toUpperCase()}_FAILED`,
      category,
      stage,
      message: `Pipeline stage '${stage}' failed: ${message}`,
      retryable: stage === "ai_analysis" || stage === "report_persistence",
      cause: message,
    };
    events.push({
      stage,
      status: "failed",
      timestamp: this.now().toISOString(),
      durationMs: Math.max(this.now().getTime() - startedAt.getTime(), 0),
      error: details,
    });
    return new AnalysisPipelineError(details, [...events], cause);
  }

  private buildReportId(scenarioId: string): string {
    return `${scenarioId}-${this.now().getTime()}`;
  }
}
