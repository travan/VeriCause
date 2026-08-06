import {
  EvaluatedAnalysisReport,
  EvaluationCase,
  EvaluationComparison,
  EvaluationDatasetReport,
  EvaluationMetrics,
  EvaluationResult,
  EvaluationThresholds,
  GroundTruth,
  KnownAnalysisCause,
  ComparableMetric,
  MetricComparison,
} from "../domain/evaluation";
import { EvaluationRepository } from "../evaluation/evaluation-store";
import { EvaluationQualityGate } from "../evaluation/quality-gate";
import { AnalysisCause, AnalysisReport, RunAnalysisInput } from "../types";

export interface AnalysisRunner {
  run(input: RunAnalysisInput): Promise<AnalysisReport | AnalysisReport[]>;
}

export class EvaluationService {
  constructor(
    private readonly analysisRunner: AnalysisRunner,
    private readonly now: () => Date = () => new Date(),
    private readonly qualityGate = new EvaluationQualityGate(),
    private readonly repository?: EvaluationRepository,
  ) {}

  evaluateReport(
    caseId: string,
    report: EvaluatedAnalysisReport,
    groundTruth: GroundTruth<KnownAnalysisCause>,
  ): EvaluationResult {
    if (!report.claim || !report.coreVerdict) {
      throw new Error(
        `Report '${report.reportId}' does not contain shared-core verification fields.`,
      );
    }

    const claim = report.claim;
    const coreVerdict = report.coreVerdict;
    const claimCorrect = claim.expected === groundTruth.value;
    const inconclusive = coreVerdict.status === "inconclusive";
    const verifierCorrect = inconclusive
      ? null
      : coreVerdict.observed === groundTruth.value;
    const decisionCorrect = inconclusive
      ? null
      : claimCorrect
        ? coreVerdict.status === "supported"
        : coreVerdict.status === "contradicted";

    return {
      caseId,
      reportId: report.reportId,
      aiRuntime: report.aiRuntime,
      claim,
      coreVerdict,
      groundTruth,
      claimCorrect,
      verifierCorrect,
      decisionCorrect,
    };
  }

  summarize(results: EvaluationResult[]): EvaluationMetrics {
    const total = results.length;
    const count = (predicate: (result: EvaluationResult) => boolean) =>
      results.filter(predicate).length;
    const claimCorrect = count((result) => result.claimCorrect);
    const verifierCorrect = count((result) => result.verifierCorrect === true);
    const decisionCorrect = count((result) => result.decisionCorrect === true);
    const inconclusive = count((result) => result.coreVerdict.status === "inconclusive");
    const conclusive = total - inconclusive;
    const falseAccepts = count(
      (result) => result.coreVerdict.status === "supported" && !result.claimCorrect,
    );
    const falseOverrides = count(
      (result) => result.coreVerdict.status === "contradicted" && result.claimCorrect,
    );
    const rate = (numerator: number, denominator: number) =>
      denominator === 0 ? 0 : numerator / denominator;
    const averageConfidence = rate(
      results.reduce((sum, result) => sum + result.claim.confidence, 0),
      total,
    );
    const brierScore = rate(
      results.reduce((sum, result) => {
        const outcome = result.claimCorrect ? 1 : 0;
        return sum + (result.claim.confidence - outcome) ** 2;
      }, 0),
      total,
    );

    return {
      total,
      claimAccuracy: rate(claimCorrect, total),
      verifierAccuracy: rate(verifierCorrect, conclusive),
      decisionAccuracy: rate(decisionCorrect, conclusive),
      falseAcceptRate: rate(falseAccepts, conclusive),
      falseOverrideRate: rate(falseOverrides, conclusive),
      inconclusiveRate: rate(inconclusive, total),
      averageConfidence,
      brierScore,
      counts: {
        claimCorrect,
        verifierCorrect,
        decisionCorrect,
        falseAccepts,
        falseOverrides,
        inconclusive,
      },
    };
  }

  async run(
    cases: EvaluationCase[],
    thresholds: EvaluationThresholds = {},
  ): Promise<EvaluationDatasetReport> {
    this.assertUniqueCaseIds(cases);
    const results: EvaluationResult[] = [];

    for (const evaluationCase of cases) {
      const report = await this.analysisRunner.run(evaluationCase.input);

      if (Array.isArray(report)) {
        throw new Error(`Evaluation case '${evaluationCase.id}' produced multiple reports.`);
      }

      results.push(
        this.evaluateReport(evaluationCase.id, report, evaluationCase.groundTruth),
      );
    }

    const createdAt = this.now();
    const metrics = this.summarize(results);
    const report: EvaluationDatasetReport = {
      evaluationId: `evaluation-${createdAt.getTime()}`,
      results,
      metrics,
      qualityGate: this.qualityGate.evaluate(metrics, thresholds),
      createdAt: createdAt.toISOString(),
    };

    return this.repository?.save(report) ?? report;
  }

  async getById(evaluationId: string): Promise<EvaluationDatasetReport> {
    if (!this.repository) {
      throw new Error("Evaluation persistence is not configured.");
    }
    return this.repository.getById(evaluationId);
  }

  async compare(
    baselineEvaluationId: string,
    candidateEvaluationId: string,
  ): Promise<EvaluationComparison> {
    if (!this.repository) {
      throw new Error("Evaluation persistence is not configured.");
    }
    const [baseline, candidate] = await Promise.all([
      this.repository.getById(baselineEvaluationId),
      this.repository.getById(candidateEvaluationId),
    ]);
    const higherIsBetter = new Set<ComparableMetric>([
      "claimAccuracy",
      "verifierAccuracy",
      "decisionAccuracy",
    ]);
    const lowerIsBetter = new Set<ComparableMetric>([
      "falseAcceptRate",
      "falseOverrideRate",
      "inconclusiveRate",
      "brierScore",
    ]);
    const metricNames: ComparableMetric[] = [
      "claimAccuracy",
      "verifierAccuracy",
      "decisionAccuracy",
      "falseAcceptRate",
      "falseOverrideRate",
      "inconclusiveRate",
      "averageConfidence",
      "brierScore",
    ];
    const metrics: MetricComparison[] = metricNames.map((metric) => {
      const baselineValue = baseline.metrics[metric];
      const candidateValue = candidate.metrics[metric];
      const delta = Number((candidateValue - baselineValue).toFixed(12));
      let outcome: MetricComparison["outcome"] = "unchanged";

      if (metric === "averageConfidence" && delta !== 0) {
        outcome = "informational";
      } else if (delta !== 0) {
        const improved = higherIsBetter.has(metric) ? delta > 0 : lowerIsBetter.has(metric) && delta < 0;
        outcome = improved ? "improved" : "regressed";
      }

      return { metric, baseline: baselineValue, candidate: candidateValue, delta, outcome };
    });
    const regressions = metrics
      .filter((metric) => metric.outcome === "regressed")
      .map((metric) => metric.metric);
    const improvements = metrics.filter((metric) => metric.outcome === "improved");

    return {
      baselineEvaluationId,
      candidateEvaluationId,
      baselineRuntimes: this.uniqueRuntimes(baseline),
      candidateRuntimes: this.uniqueRuntimes(candidate),
      metrics,
      regressions,
      status: regressions.length > 0
        ? "regressed"
        : improvements.length > 0
          ? "improved"
          : "unchanged",
      createdAt: this.now().toISOString(),
    };
  }

  private uniqueRuntimes(report: EvaluationDatasetReport) {
    const runtimes = new Map<string, { provider: string; model: string }>();
    for (const result of report.results) {
      const key = `${result.aiRuntime.provider}\u0000${result.aiRuntime.model}`;
      runtimes.set(key, result.aiRuntime);
    }
    return [...runtimes.values()];
  }

  private assertUniqueCaseIds(cases: EvaluationCase[]): void {
    const seen = new Set<string>();

    for (const evaluationCase of cases) {
      if (seen.has(evaluationCase.id)) {
        throw new Error(`Duplicate evaluation case ID '${evaluationCase.id}'.`);
      }
      seen.add(evaluationCase.id);
    }
  }
}
