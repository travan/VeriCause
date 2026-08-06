import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileEvaluationStore } from "../../src/core/evaluation/evaluation-store";
import { EvaluationDatasetReport } from "../../src/core/domain/evaluation";

describe("FileEvaluationStore", () => {
  it("persists evaluation reports and rejects unsafe IDs", async () => {
    const root = await mkdtemp(join(tmpdir(), "evaluation-store-"));
    const store = new FileEvaluationStore(root);
    const report: EvaluationDatasetReport = {
      evaluationId: "evaluation-1",
      results: [],
      metrics: {
        total: 0,
        claimAccuracy: 0,
        verifierAccuracy: 0,
        decisionAccuracy: 0,
        falseAcceptRate: 0,
        falseOverrideRate: 0,
        inconclusiveRate: 0,
        averageConfidence: 0,
        brierScore: 0,
        counts: {
          claimCorrect: 0,
          verifierCorrect: 0,
          decisionCorrect: 0,
          falseAccepts: 0,
          falseOverrides: 0,
          inconclusive: 0,
        },
      },
      qualityGate: { status: "passed", thresholds: {}, violations: [] },
      createdAt: "2026-08-06T00:00:00.000Z",
    };

    try {
      await expect(store.save(report)).resolves.toEqual(report);
      await expect(store.getById(report.evaluationId)).resolves.toEqual(report);
      await expect(store.getById("../unsafe")).rejects.toThrow("Invalid evaluation ID");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
