import { join } from "node:path";

import { readJsonFile, writeJsonFile } from "./fs";
import { AnalysisRun } from "./types";

export class FileAnalysisRunStore {
  constructor(private readonly artifactsDir: string) {}

  async save(run: AnalysisRun): Promise<AnalysisRun> {
    await writeJsonFile(this.pathFor(run.runId), run);
    return run;
  }

  async getById(runId: string): Promise<AnalysisRun> {
    return readJsonFile<AnalysisRun>(this.pathFor(runId));
  }

  private pathFor(runId: string): string {
    return join(this.artifactsDir, "jobs", `${runId}.json`);
  }
}
