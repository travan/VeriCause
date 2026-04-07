import { resolve } from "node:path";
import { cpus } from "node:os";

export type CoreConfig = {
  projectRoot: string;
  scenarioDir: string;
  artifactsDir: string;
  fixturesDir: string;
  runConcurrency: number;
  traceEnabled: boolean;
  successScreenshotEnabled: boolean;
  defaultAiProvider: string;
  defaultAiModel: string;
  openAiBaseUrl?: string;
  openAiApiKey?: string;
};

export function resolveCoreConfig(): CoreConfig {
  const projectRoot = process.cwd();

  return {
    projectRoot,
    scenarioDir: resolve(projectRoot, process.env.SCENARIO_DIR ?? "scenarios"),
    artifactsDir: resolve(projectRoot, process.env.BASE_OUTPUT_DIR ?? "artifacts"),
    fixturesDir: resolve(projectRoot, "fixtures/pages"),
    runConcurrency: Number(
      process.env.RUN_CONCURRENCY ?? Math.min(Math.max(cpus().length / 2, 1), 2),
    ),
    traceEnabled: process.env.ENABLE_TRACE === "true",
    successScreenshotEnabled: process.env.ENABLE_SUCCESS_SCREENSHOT === "true",
    defaultAiProvider: process.env.AI_PROVIDER ?? "mock",
    defaultAiModel: process.env.AI_MODEL ?? "mock-reliability-v1",
    openAiBaseUrl: process.env.OPENAI_BASE_URL,
    openAiApiKey: process.env.OPENAI_API_KEY,
  };
}
