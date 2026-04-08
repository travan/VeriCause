import { ReliabilityEvaluator } from "../../src/core/reliability-evaluator";

describe("ReliabilityEvaluator", () => {
  it("accepts AI when selector failure is stable", async () => {
    const evaluator = new ReliabilityEvaluator();

    const result = await evaluator.validate({
      aiDiagnosis: {
        predictedCause: "invalid_selector",
        confidence: 0.91,
        summary: "Selector is invalid.",
      },
      validationEvidence: {
        retryStatus: "failed",
        selectorExists: false,
        historicalPattern: "stable_fail",
        failureSignature: "timeout",
      },
    });

    expect(result.verdict.actualCause).toBe("invalid_selector");
    expect(result.verdict.aiCorrect).toBe(true);
    expect(result.verdict.action).toBe("accept_ai");
  });

  it("overrides AI for flaky timing", async () => {
    const evaluator = new ReliabilityEvaluator();

    const result = await evaluator.validate({
      aiDiagnosis: {
        predictedCause: "invalid_selector",
        confidence: 0.78,
        summary: "Looks like selector not found.",
      },
      validationEvidence: {
        retryStatus: "passed",
        selectorExists: true,
        historicalPattern: "flaky",
        failureSignature: "unknown",
      },
    });

    expect(result.verdict.actualCause).toBe("flaky_timing");
    expect(result.verdict.aiCorrect).toBe(false);
    expect(result.verdict.action).toBe("override_ai");
  });

  it("detects loose element from detached signature", async () => {
    const evaluator = new ReliabilityEvaluator();

    const result = await evaluator.validate({
      aiDiagnosis: {
        predictedCause: "invalid_selector",
        confidence: 0.66,
        summary: "Target could not be acted on reliably.",
      },
      validationEvidence: {
        retryStatus: "failed",
        selectorExists: true,
        historicalPattern: "unknown",
        failureSignature: "detached",
      },
    });

    expect(result.verdict.actualCause).toBe("loose_element");
    expect(result.verdict.aiCorrect).toBe(false);
    expect(result.verdict.action).toBe("override_ai");
  });
});
