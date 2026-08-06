import {
  AIDiagnosis,
  AnalysisReport,
  AnalysisRun,
  FailureAnalysisInput,
  InlineScenarioInput,
  ReliabilityValidationInput,
  ReliabilityValidationOutput,
  ResolvedAiRuntimeOptions,
  ScenarioDefinition,
  ExecutionResult,
} from "./types";

export interface ScenarioRepository {
  discoverScenarios(): Promise<ScenarioDefinition[]>;
  loadById(id: string): Promise<ScenarioDefinition | null>;
  loadFromFile(filePath: string): Promise<ScenarioDefinition>;
  loadInline(input: InlineScenarioInput): ScenarioDefinition;
}

export interface ExecutionEngine {
  runFirstAttempt(scenario: ScenarioDefinition): Promise<ExecutionResult>;
  retry(scenario: ScenarioDefinition): Promise<ExecutionResult>;
  close(): Promise<void>;
}

export interface AiAnalyzer {
  analyze(
    input: FailureAnalysisInput,
    runtime: ResolvedAiRuntimeOptions,
  ): Promise<AIDiagnosis>;
}

export interface VerdictEvaluator {
  validate(input: ReliabilityValidationInput): Promise<ReliabilityValidationOutput>;
}

export interface ReportRepository {
  save(report: AnalysisReport): Promise<AnalysisReport>;
  getById(reportId: string): Promise<AnalysisReport>;
}

export interface AnalysisRunRepository {
  save(run: AnalysisRun): Promise<AnalysisRun>;
  getById(runId: string): Promise<AnalysisRun>;
}
