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
    expect(result.claim).toMatchObject({
      subject: "browser_execution",
      predicate: "failure_cause",
      expected: "invalid_selector",
      source: "ai",
    });
    expect(result.coreVerdict).toMatchObject({
      status: "supported",
      observed: "invalid_selector",
      evidenceRefs: [
        "retry-status",
        "selector-exists",
        "historical-pattern",
        "failure-signature",
      ],
    });
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
    expect(result.coreVerdict.status).toBe("contradicted");
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

  it("returns an inconclusive core verdict when evidence cannot establish a cause", async () => {
    const result = await new ReliabilityEvaluator().validate({
      aiDiagnosis: {
        predictedCause: "timeout",
        confidence: 0.5,
        summary: "Operation timed out.",
      },
      validationEvidence: {
        retryStatus: "failed",
        selectorExists: true,
        historicalPattern: "unknown",
        failureSignature: "timeout",
      },
    });

    expect(result.coreVerdict.status).toBe("inconclusive");
    expect(result.verdict.action).toBe("needs_more_evidence");
    expect(result.verdict.actualCause).toBe("unknown");
  });
});
