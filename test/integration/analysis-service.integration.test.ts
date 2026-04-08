import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { RoutedAiAnalyzer } from "../../src/core/ai-analyzer";
import { AnalysisService } from "../../src/core/analysis-service";
import { PlaywrightExecutionEngine } from "../../src/core/execution-engine";
import { ReliabilityEvaluator } from "../../src/core/reliability-evaluator";
import { FileReportStore } from "../../src/core/report-store";
import { FileAnalysisRunStore } from "../../src/core/run-store";
import { ScenarioLoader } from "../../src/core/scenario-loader";

async function waitForCompletion(
  service: AnalysisService,
  runId: string,
): Promise<void> {
  while (true) {
    const run = await service.getRun(runId);

    if (run.status === "completed" || run.status === "failed") {
      return;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
}

describe("AnalysisService integration", () => {
  it("processes real Playwright fixtures end to end", async () => {
    const artifactsDir = await mkdtemp(resolve(tmpdir(), "ai-reliability-artifacts-"));
    const scenarioDir = resolve(process.cwd(), "scenarios");
    const fixturesDir = resolve(process.cwd(), "fixtures/pages");

    const service = new AnalysisService(
      new ScenarioLoader(scenarioDir),
      new PlaywrightExecutionEngine(artifactsDir, fixturesDir, false, false),
      new RoutedAiAnalyzer({
        openAiApiKey: undefined,
        openAiBaseUrl: undefined,
      }),
      new ReliabilityEvaluator(),
      new FileReportStore(artifactsDir),
      new FileAnalysisRunStore(artifactsDir),
      2,
      {
        provider: "mock",
        model: "gpt-5.4",
      },
    );

    try {
      const run = await service.startRun({
        runAll: true,
        ai: {
          provider: "mock",
          model: "gpt-5.4",
        },
      });

      await waitForCompletion(service, run.runId);

      const result = await service.getRunResults(run.runId);
      const verdicts = new Map(
        result.reports.map((report) => [report.scenario.id, report.verdict?.actualCause]),
      );

      expect(result.run.status).toBe("completed");
      expect(result.run.total).toBe(3);
      expect(result.run.completed).toBe(3);
      expect(result.reports).toHaveLength(3);
      expect(verdicts.get("invalid-selector")).toBe("invalid_selector");
      expect(verdicts.get("delayed-element")).toBe("flaky_timing");
      expect(verdicts.get("loose-element")).toBe("loose_element");
    } finally {
      await service.close();
      await rm(artifactsDir, { recursive: true, force: true });
    }
  }, 20000);
});
