import { CoreVerdict, VerificationClaim } from "./verification";
import { AnalysisCause, AnalysisReport, RunAnalysisInput } from "../types";

export type KnownAnalysisCause = Exclude<AnalysisCause, "unknown">;

export type GroundTruth<TValue = unknown> = {
  value: TValue;
  source: string;
  notes?: string;
};

export type EvaluationCase = {
  id: string;
  input: Omit<RunAnalysisInput, "runAll"> & { runAll?: false };
  groundTruth: GroundTruth<KnownAnalysisCause>;
};

export type EvaluationResult = {
  caseId: string;
  reportId: string;
  aiRuntime: AnalysisReport["aiRuntime"];
  claim: VerificationClaim<AnalysisCause>;
  coreVerdict: CoreVerdict<AnalysisCause>;
  groundTruth: GroundTruth<KnownAnalysisCause>;
  claimCorrect: boolean;
  verifierCorrect: boolean | null;
  decisionCorrect: boolean | null;
};

export type EvaluationMetrics = {
  total: number;
  claimAccuracy: number;
  verifierAccuracy: number;
  decisionAccuracy: number;
  falseAcceptRate: number;
  falseOverrideRate: number;
  inconclusiveRate: number;
  averageConfidence: number;
  brierScore: number;
  counts: {
    claimCorrect: number;
    verifierCorrect: number;
    decisionCorrect: number;
    falseAccepts: number;
    falseOverrides: number;
    inconclusive: number;
  };
};

export type EvaluationThresholds = {
  minClaimAccuracy?: number;
  minVerifierAccuracy?: number;
  minDecisionAccuracy?: number;
  maxFalseAcceptRate?: number;
  maxFalseOverrideRate?: number;
  maxInconclusiveRate?: number;
  maxBrierScore?: number;
};

export type QualityGateResult = {
  status: "passed" | "failed";
  thresholds: EvaluationThresholds;
  violations: Array<{
    metric: keyof EvaluationThresholds;
    expected: number;
    actual: number;
  }>;
};

export type EvaluationDatasetReport = {
  evaluationId: string;
  results: EvaluationResult[];
  metrics: EvaluationMetrics;
  qualityGate: QualityGateResult;
  createdAt: string;
};

export type ComparableMetric =
  | "claimAccuracy"
  | "verifierAccuracy"
  | "decisionAccuracy"
  | "falseAcceptRate"
  | "falseOverrideRate"
  | "inconclusiveRate"
  | "averageConfidence"
  | "brierScore";

export type MetricComparison = {
  metric: ComparableMetric;
  baseline: number;
  candidate: number;
  delta: number;
  outcome: "improved" | "regressed" | "unchanged" | "informational";
};

export type EvaluationComparison = {
  baselineEvaluationId: string;
  candidateEvaluationId: string;
  baselineRuntimes: Array<{ provider: string; model: string }>;
  candidateRuntimes: Array<{ provider: string; model: string }>;
  metrics: MetricComparison[];
  regressions: ComparableMetric[];
  status: "improved" | "regressed" | "unchanged";
  createdAt: string;
};

export type EvaluatedAnalysisReport = Pick<
  AnalysisReport,
  "reportId" | "aiRuntime" | "claim" | "coreVerdict"
>;
