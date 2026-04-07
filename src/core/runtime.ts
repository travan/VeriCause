import { RoutedAiAnalyzer } from "./ai-analyzer";
import { AnalysisService } from "./analysis-service";
import { resolveCoreConfig } from "./config";
import { PlaywrightExecutionEngine } from "./execution-engine";
import { ReliabilityEvaluator } from "./reliability-evaluator";
import { FileReportStore } from "./report-store";
import { FileAnalysisRunStore } from "./run-store";
import { ScenarioLoader } from "./scenario-loader";

export type CoreRuntime = {
  analysisService: AnalysisService;
  scenarioLoader: ScenarioLoader;
  reportStore: FileReportStore;
  runStore: FileAnalysisRunStore;
  close: () => Promise<void>;
};

export function createCoreRuntime(): CoreRuntime {
  const config = resolveCoreConfig();
  const scenarioLoader = new ScenarioLoader(config.scenarioDir);
  const reportStore = new FileReportStore(config.artifactsDir);
  const runStore = new FileAnalysisRunStore(config.artifactsDir);
  const executionEngine = new PlaywrightExecutionEngine(
    config.artifactsDir,
    config.fixturesDir,
    config.traceEnabled,
    config.successScreenshotEnabled,
  );
  const aiAnalyzer = new RoutedAiAnalyzer(config);
  const reliabilityEvaluator = new ReliabilityEvaluator();
  const analysisService = new AnalysisService(
    scenarioLoader,
    executionEngine,
    aiAnalyzer,
    reliabilityEvaluator,
    reportStore,
    runStore,
    config.runConcurrency,
    {
      provider: config.defaultAiProvider,
      model: config.defaultAiModel,
    },
  );

  return {
    analysisService,
    scenarioLoader,
    reportStore,
    runStore,
    close: () => analysisService.close(),
  };
}
