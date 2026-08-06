import { EvaluationQualityGate } from "../../src/core/evaluation/quality-gate";
import { EvaluationMetrics } from "../../src/core/domain/evaluation";

const metrics: EvaluationMetrics = {
  total: 10,
  claimAccuracy: 0.7,
  verifierAccuracy: 0.9,
  decisionAccuracy: 0.8,
  falseAcceptRate: 0.1,
  falseOverrideRate: 0,
  inconclusiveRate: 0.2,
  averageConfidence: 0.85,
  brierScore: 0.18,
  counts: {
    claimCorrect: 7,
    verifierCorrect: 7,
    decisionCorrect: 6,
    falseAccepts: 1,
    falseOverrides: 0,
    inconclusive: 2,
  },
};

describe("EvaluationQualityGate", () => {
  it("passes without thresholds and reports all failed thresholds", () => {
    const gate = new EvaluationQualityGate();

    expect(gate.evaluate(metrics)).toEqual({
      status: "passed",
      thresholds: {},
      violations: [],
    });
    expect(gate.evaluate(metrics, {
      minDecisionAccuracy: 0.9,
      maxFalseAcceptRate: 0.05,
      maxBrierScore: 0.2,
    })).toMatchObject({
      status: "failed",
      violations: [
        { metric: "minDecisionAccuracy", expected: 0.9, actual: 0.8 },
        { metric: "maxFalseAcceptRate", expected: 0.05, actual: 0.1 },
      ],
    });
  });
});
