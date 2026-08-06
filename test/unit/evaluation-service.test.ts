import { EvaluationService } from "../../src/core/application/evaluation-service";
import { AnalysisCause, AnalysisReport } from "../../src/core/types";
import { CoreVerdict, VerificationClaim } from "../../src/core/domain/verification";

function report(
  id: string,
  expected: AnalysisCause,
  status: CoreVerdict<AnalysisCause>["status"],
  observed: AnalysisCause,
): AnalysisReport {
  const claim: VerificationClaim<AnalysisCause> = {
    id: `${id}-claim`,
    subject: "browser_execution",
    predicate: "failure_cause",
    expected,
    confidence: 0.9,
    rationale: "test",
    source: "ai",
  };
  return {
    reportId: id,
    aiRuntime: { provider: "mock", model: "mock-v1" },
    scenario: {
      id,
      name: id,
      sourceFile: `${id}.md`,
      sourceType: "md",
      url: "fixture://invalid-selector",
      selector: "#missing",
    },
    firstRun: {
      scenarioId: id,
      runId: `${id}-run`,
      phase: "first_run",
      status: "failed",
      durationMs: 1,
      timestamp: "2026-08-06T00:00:00.000Z",
    },
    claim,
    coreVerdict: {
      claimId: claim.id,
      status,
      score: status === "supported" ? 1 : status === "contradicted" ? 0 : 0.5,
      expected,
      observed,
      reasons: ["test"],
      evidenceRefs: [],
    },
    createdAt: "2026-08-06T00:00:00.000Z",
  };
}

describe("EvaluationService", () => {
  const fixedNow = () => new Date("2026-08-06T12:00:00.000Z");

  it("evaluates claim, verifier, and decision correctness independently", () => {
    const service = new EvaluationService({ run: jest.fn() }, fixedNow);

    const correct = service.evaluateReport(
      "correct",
      report("correct", "invalid_selector", "supported", "invalid_selector"),
      { value: "invalid_selector", source: "fixture" },
    );
    const falseAccept = service.evaluateReport(
      "false-accept",
      report("false-accept", "flaky_timing", "supported", "flaky_timing"),
      { value: "invalid_selector", source: "fixture" },
    );

    expect(correct).toMatchObject({
      claimCorrect: true,
      verifierCorrect: true,
      decisionCorrect: true,
    });
    expect(falseAccept).toMatchObject({
      claimCorrect: false,
      verifierCorrect: false,
      decisionCorrect: false,
    });
  });

  it("summarizes accuracy, unsafe decisions, and inconclusive outcomes", () => {
    const service = new EvaluationService({ run: jest.fn() }, fixedNow);
    const groundTruth = { value: "invalid_selector" as const, source: "fixture" };
    const results = [
      service.evaluateReport(
        "correct",
        report("correct", "invalid_selector", "supported", "invalid_selector"),
        groundTruth,
      ),
      service.evaluateReport(
        "false-accept",
        report("false-accept", "flaky_timing", "supported", "flaky_timing"),
        groundTruth,
      ),
      service.evaluateReport(
        "inconclusive",
        report("inconclusive", "invalid_selector", "inconclusive", "unknown"),
        groundTruth,
      ),
    ];

    expect(service.summarize(results)).toMatchObject({
      total: 3,
      claimAccuracy: 2 / 3,
      verifierAccuracy: 1 / 2,
      decisionAccuracy: 1 / 2,
      falseAcceptRate: 1 / 2,
      falseOverrideRate: 0,
      inconclusiveRate: 1 / 3,
      averageConfidence: 0.9,
      brierScore: (0.01 + 0.81 + 0.01) / 3,
      counts: { falseAccepts: 1, inconclusive: 1 },
    });
  });

  it("runs a dataset and rejects invalid evaluation inputs", async () => {
    const analysisRunner = {
      run: jest.fn(async () =>
        report("report-1", "invalid_selector", "supported", "invalid_selector")),
    };
    const service = new EvaluationService(analysisRunner, fixedNow);
    const evaluationCase = {
      id: "case-1",
      input: { scenarioId: "invalid-selector" },
      groundTruth: { value: "invalid_selector" as const, source: "fixture" },
    };

    await expect(service.run([evaluationCase])).resolves.toMatchObject({
      evaluationId: "evaluation-1786017600000",
      metrics: { total: 1, claimAccuracy: 1, decisionAccuracy: 1 },
    });
    await expect(service.run([evaluationCase, evaluationCase])).rejects.toThrow(
      "Duplicate evaluation case ID",
    );
    expect(() => service.evaluateReport(
      "legacy",
      { reportId: "legacy", aiRuntime: { provider: "mock", model: "mock-v1" } },
      evaluationCase.groundTruth,
    )).toThrow("does not contain shared-core verification fields");
  });
});
