import { join } from "node:path";

import { EvaluationDatasetReport } from "../domain/evaluation";
import { readJsonFile, writeJsonFile } from "../fs";
import { SAFE_ID_RE } from "../schemas";

export interface EvaluationRepository {
  save(report: EvaluationDatasetReport): Promise<EvaluationDatasetReport>;
  getById(evaluationId: string): Promise<EvaluationDatasetReport>;
}

export class FileEvaluationStore implements EvaluationRepository {
  constructor(private readonly artifactsDir: string) {}

  async save(report: EvaluationDatasetReport): Promise<EvaluationDatasetReport> {
    await writeJsonFile(this.pathFor(report.evaluationId), report);
    return report;
  }

  async getById(evaluationId: string): Promise<EvaluationDatasetReport> {
    return readJsonFile<EvaluationDatasetReport>(this.pathFor(evaluationId));
  }

  private pathFor(evaluationId: string): string {
    if (!SAFE_ID_RE.test(evaluationId)) {
      throw new Error(`Invalid evaluation ID: '${evaluationId}'`);
    }
    return join(this.artifactsDir, "evaluations", `${evaluationId}.json`);
  }
}
