import { EvaluationService } from "../../src/core/application/evaluation-service";
import {
  EvaluationDatasetReport,
  EvaluationMetrics,
} from "../../src/core/domain/evaluation";

const baseMetrics: EvaluationMetrics = {
  total: 10,
  claimAccuracy: 0.8,
  verifierAccuracy: 0.9,
  decisionAccuracy: 0.9,
  falseAcceptRate: 0.05,
  falseOverrideRate: 0.05,
  inconclusiveRate: 0,
  averageConfidence: 0.8,
  brierScore: 0.15,
  counts: {
    claimCorrect: 8,
    verifierCorrect: 9,
    decisionCorrect: 9,
    falseAccepts: 1,
    falseOverrides: 1,
    inconclusive: 0,
  },
};

function dataset(
  evaluationId: string,
  metrics: EvaluationMetrics,
  model: string,
): EvaluationDatasetReport {
  return {
    evaluationId,
    results: [{
      caseId: "case-1",
      reportId: `${evaluationId}-report`,
      aiRuntime: { provider: "mock", model },
      claim: {
        id: "claim-1",
        subject: "browser_execution",
        predicate: "failure_cause",
        expected: "invalid_selector",
        confidence: metrics.averageConfidence,
        rationale: "test",
        source: "ai",
      },
      coreVerdict: {
        claimId: "claim-1",
        status: "supported",
        score: 1,
        expected: "invalid_selector",
        observed: "invalid_selector",
        reasons: [],
        evidenceRefs: [],
      },
      groundTruth: { value: "invalid_selector", source: "fixture" },
      claimCorrect: true,
      verifierCorrect: true,
      decisionCorrect: true,
    }],
    metrics,
    qualityGate: { status: "passed", thresholds: {}, violations: [] },
    createdAt: "2026-08-06T00:00:00.000Z",
  };
}

describe("EvaluationService comparison", () => {
  it("detects direction-aware regressions and includes runtime identities", async () => {
    const reports = new Map([
      ["baseline", dataset("baseline", baseMetrics, "model-a")],
      ["candidate", dataset("candidate", {
        ...baseMetrics,
        decisionAccuracy: 0.8,
        falseAcceptRate: 0.1,
        brierScore: 0.1,
        averageConfidence: 0.7,
      }, "model-b")],
    ]);
    const service = new EvaluationService(
      { run: jest.fn() },
      () => new Date("2026-08-06T12:00:00.000Z"),
      undefined,
      {
        save: jest.fn(async (report) => report),
        getById: jest.fn(async (id) => reports.get(id)!),
      },
    );

    await expect(service.compare("baseline", "candidate")).resolves.toMatchObject({
      status: "regressed",
      regressions: ["decisionAccuracy", "falseAcceptRate"],
      baselineRuntimes: [{ provider: "mock", model: "model-a" }],
      candidateRuntimes: [{ provider: "mock", model: "model-b" }],
      metrics: expect.arrayContaining([
        expect.objectContaining({
          metric: "decisionAccuracy", delta: -0.1, outcome: "regressed",
        }),
        expect.objectContaining({
          metric: "falseAcceptRate", delta: 0.05, outcome: "regressed",
        }),
        expect.objectContaining({
          metric: "brierScore", delta: -0.05, outcome: "improved",
        }),
        expect.objectContaining({
          metric: "averageConfidence", delta: -0.1, outcome: "informational",
        }),
      ]),
    });
  });

  it("requires persistence for comparisons", async () => {
    await expect(new EvaluationService({ run: jest.fn() }).compare("a", "b"))
      .rejects.toThrow("Evaluation persistence is not configured");
  });
});
