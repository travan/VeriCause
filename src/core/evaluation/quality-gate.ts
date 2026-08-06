import {
  EvaluationMetrics,
  EvaluationThresholds,
  QualityGateResult,
} from "../domain/evaluation";

type ThresholdRule = {
  key: keyof EvaluationThresholds;
  metric: keyof EvaluationMetrics;
  passes: (actual: number, expected: number) => boolean;
};

const RULES: ThresholdRule[] = [
  { key: "minClaimAccuracy", metric: "claimAccuracy", passes: (a, e) => a >= e },
  { key: "minVerifierAccuracy", metric: "verifierAccuracy", passes: (a, e) => a >= e },
  { key: "minDecisionAccuracy", metric: "decisionAccuracy", passes: (a, e) => a >= e },
  { key: "maxFalseAcceptRate", metric: "falseAcceptRate", passes: (a, e) => a <= e },
  { key: "maxFalseOverrideRate", metric: "falseOverrideRate", passes: (a, e) => a <= e },
  { key: "maxInconclusiveRate", metric: "inconclusiveRate", passes: (a, e) => a <= e },
  { key: "maxBrierScore", metric: "brierScore", passes: (a, e) => a <= e },
];

export class EvaluationQualityGate {
  evaluate(
    metrics: EvaluationMetrics,
    thresholds: EvaluationThresholds = {},
  ): QualityGateResult {
    const violations = RULES.flatMap((rule) => {
      const expected = thresholds[rule.key];
      if (expected === undefined) return [];
      const actual = metrics[rule.metric];
      if (typeof actual !== "number" || rule.passes(actual, expected)) return [];
      return [{ metric: rule.key, expected, actual }];
    });

    return {
      status: violations.length === 0 ? "passed" : "failed",
      thresholds,
      violations,
    };
  }
}
