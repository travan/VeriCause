import { join } from "node:path";

import { readJsonFile, writeJsonFile } from "./fs";
import { SAFE_ID_RE } from "./schemas";
import { AnalysisReport } from "./types";

export class FileReportStore {
  constructor(private readonly artifactsDir: string) {}

  async save(report: AnalysisReport): Promise<AnalysisReport> {
    await writeJsonFile(this.pathFor(report.reportId), report);
    return report;
  }

  async getById(reportId: string): Promise<AnalysisReport> {
    return readJsonFile<AnalysisReport>(this.pathFor(reportId));
  }

  private pathFor(reportId: string): string {
    if (!SAFE_ID_RE.test(reportId)) {
      throw new Error(`Invalid report ID: '${reportId}'`);
    }
    return join(this.artifactsDir, "reports", `${reportId}.json`);
  }
}
