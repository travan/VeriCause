import { RoutedAiAnalyzer } from "./ai-analyzer";
import { AnalysisService } from "./analysis-service";
import { EvaluationService } from "./application/evaluation-service";
import { FileEvaluationStore } from "./evaluation/evaluation-store";
import { GuardrailService } from "./application/guardrail-service";
import { FileGuardrailDecisionStore } from "./guardrail/decision-store";
import { RuntimeVerificationService } from "./application/runtime-verification-service";
import { resolveCoreConfig } from "./config";
import { PlaywrightExecutionEngine } from "./execution-engine";
import { ReliabilityEvaluator } from "./reliability-evaluator";
import { FileReportStore } from "./report-store";
import { FileAnalysisRunStore } from "./run-store";
import { ScenarioLoader } from "./scenario-loader";

export type {
  ClaimSource,
  ClaimOperator,
  ClaimVerifier,
  CoreVerdict,
  EvidenceBundle,
  EvidenceItem,
  VerdictStatus,
  VerificationClaim,
} from "./domain/verification";
export type {
  JsonValue,
  RuntimeTarget,
  RuntimeVerificationInput,
  RuntimeVerificationResult,
} from "./domain/runtime-verification";
export {
  AnalysisPipelineError,
  isAnalysisPipelineError,
} from "./domain/pipeline";
export type {
  PipelineErrorCategory,
  PipelineStage,
  StageEvent,
  StructuredPipelineError,
} from "./domain/pipeline";
export type {
  EvaluationCase,
  EvaluationComparison,
  EvaluationDatasetReport,
  EvaluationMetrics,
  EvaluationResult,
  EvaluationThresholds,
  GroundTruth,
  ComparableMetric,
  MetricComparison,
  KnownAnalysisCause,
  QualityGateResult,
} from "./domain/evaluation";
export type {
  GuardReportInput,
  GuardrailAction,
  GuardrailDecision,
  GuardrailPolicy,
  GuardrailPolicyOverrides,
  ProposedAction,
  RiskLevel,
} from "./domain/guardrail";
export { DEFAULT_GUARDRAIL_POLICY, GuardrailPolicyEngine } from "./guardrail/policy-engine";

export type CoreRuntime = {
  analysisService: AnalysisService;
  evaluationService: EvaluationService;
  guardrailService: GuardrailService;
  runtimeVerificationService: RuntimeVerificationService;
  scenarioLoader: ScenarioLoader;
  reportStore: FileReportStore;
  runStore: FileAnalysisRunStore;
  evaluationStore: FileEvaluationStore;
  guardrailDecisionStore: FileGuardrailDecisionStore;
  close: () => Promise<void>;
};

export function createCoreRuntime(): CoreRuntime {
  const config = resolveCoreConfig();
  const scenarioLoader = new ScenarioLoader(config.scenarioDir);
  const reportStore = new FileReportStore(config.artifactsDir);
  const runStore = new FileAnalysisRunStore(config.artifactsDir);
  const executionEngine = new PlaywrightExecutionEngine(
    config.artifactsDir,
    config.fixturesDir,
    config.traceEnabled,
    config.successScreenshotEnabled,
  );
  const aiAnalyzer = new RoutedAiAnalyzer(config);
  const reliabilityEvaluator = new ReliabilityEvaluator();
  const analysisService = new AnalysisService(
    scenarioLoader,
    executionEngine,
    aiAnalyzer,
    reliabilityEvaluator,
    reportStore,
    runStore,
    config.runConcurrency,
    {
      provider: config.defaultAiProvider,
      model: config.defaultAiModel,
    },
  );
  const evaluationStore = new FileEvaluationStore(config.artifactsDir);
  const evaluationService = new EvaluationService(
    analysisService,
    () => new Date(),
    undefined,
    evaluationStore,
  );
  const guardrailDecisionStore = new FileGuardrailDecisionStore(config.artifactsDir);
  const guardrailService = new GuardrailService(reportStore, guardrailDecisionStore);
  const runtimeVerificationService = new RuntimeVerificationService();

  return {
    analysisService,
    evaluationService,
    guardrailService,
    runtimeVerificationService,
    scenarioLoader,
    reportStore,
    runStore,
    evaluationStore,
    guardrailDecisionStore,
    close: () => analysisService.close(),
  };
}
