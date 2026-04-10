#!/usr/bin/env node
import { createCoreRuntime } from "../core/runtime";
import { AnalysisRunStatus, RunAnalysisInput } from "../core/types";

type AnalyzeCliArgs = {
  input: RunAnalysisInput;
  asyncMode: boolean;
};

export function printUsage(): void {
  console.log(`
ai-reliability-layer — validate AI failure analysis against runtime evidence

USAGE
  npx ai-reliability-layer <command> [options]

COMMANDS
  discover                   List all scenario files found in SCENARIO_DIR
  analyze                    Run one or more scenarios and print a report

ANALYZE OPTIONS
  --all                      Run every discovered scenario
  --scenario <id>            Run a single scenario by its ID
  --file <path>              Run a single scenario from a file path
  --async                    Start an async run and stream progress until done
  --provider <name>          Override the AI provider for this run
  --model <name>             Override the AI model for this run
  --help, -h                 Show this help message

EXAMPLES
  # Discover all scenarios
  npx ai-reliability-layer discover

  # Analyse one scenario (by ID)
  npx ai-reliability-layer analyze --scenario login-button

  # Analyse a specific file
  npx ai-reliability-layer analyze --file ./scenarios/login-button.ts

  # Analyse everything in parallel
  npx ai-reliability-layer analyze --all

  # Async mode — streams progress, prints final JSON when done
  npx ai-reliability-layer analyze --all --async

  # Override provider/model for a single run
  npx ai-reliability-layer analyze --scenario login-button --provider claude --model claude-3-7-sonnet

ENVIRONMENT VARIABLES
  AI_PROVIDER              Default provider  (default: mock)
  AI_MODEL                 Default model     (default: mock-reliability-v1)
  OPENAI_BASE_URL          Base URL for OpenAI or compatible providers
  OPENAI_API_KEY           API key for OpenAI or compatible providers
  ANTHROPIC_API_KEY        API key for Anthropic / Claude
  AI_<PROVIDER>_BASE_URL   Per-provider base URL  e.g. AI_GROK_BASE_URL
  AI_<PROVIDER>_API_KEY    Per-provider API key   e.g. AI_GROK_API_KEY
  SCENARIO_DIR             Directory scanned for scenarios  (default: scenarios)
  BASE_OUTPUT_DIR          Artifacts output root            (default: artifacts)
  RUN_CONCURRENCY          Parallel scenario limit          (default: cpus/2)
  ENABLE_TRACE             Save Playwright traces           (default: false)

SUPPORTED PROVIDERS
  mock (built-in, no key needed)
  openai · claude/anthropic · grok · gemini · deepseek · ollama · lmstudio · local

DOCS
  https://github.com/your-org/ai-reliability-layer#readme
`);
}

export function parseAnalyzeArgs(args: string[]): AnalyzeCliArgs {
  const input: RunAnalysisInput = {};
  let asyncMode = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--all") {
      input.runAll = true;
      continue;
    }

    if (arg === "--scenario") {
      input.scenarioId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--file") {
      input.filePath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider") {
      input.ai = {
        ...input.ai,
        provider: args[index + 1],
      };
      index += 1;
      continue;
    }

    if (arg === "--model") {
      input.ai = {
        ...input.ai,
        model: args[index + 1],
      };
      index += 1;
      continue;
    }

    if (arg === "--async") {
      asyncMode = true;
    }
  }

  if (input.runAll && (input.scenarioId ?? input.filePath)) {
    throw new Error("--all cannot be combined with --scenario or --file.");
  }

  if (input.scenarioId && input.filePath) {
    throw new Error("--scenario and --file cannot be combined.");
  }

  return {
    input,
    asyncMode,
  };
}

export function isTerminalRunStatus(status: AnalysisRunStatus): boolean {
  return status === "completed" || status === "failed";
}

export async function waitForRun(
  runtime: ReturnType<typeof createCoreRuntime>,
  runId: string,
): Promise<void> {
  let lastSnapshot = "";

  while (true) {
    const run = await runtime.analysisService.getRun(runId);
    const snapshot = `${run.status}:${run.completed}:${run.total}:${run.failed}:${run.passed}`;

    if (snapshot !== lastSnapshot) {
      console.error(
        `[run ${run.runId}] status=${run.status} completed=${run.completed}/${run.total} passed=${run.passed} failed=${run.failed} pending=${run.pending}`,
      );
      lastSnapshot = snapshot;
    }

    if (isTerminalRunStatus(run.status)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const runtime = createCoreRuntime();

  try {
    if (!command || command === "--help" || command === "-h") {
      printUsage();
      if (!command) process.exitCode = 1;
      return;
    }

    if (command === "discover") {
      const scenarios = await runtime.analysisService.discoverScenarios();
      console.log(JSON.stringify({ scenarios }, null, 2));
      return;
    }

    if (command === "analyze") {
      if (args.includes("--help") || args.includes("-h")) {
        printUsage();
        return;
      }

      const { input, asyncMode } = parseAnalyzeArgs(args);

      if (asyncMode) {
        const run = await runtime.analysisService.startRun(input);
        console.error(`[run ${run.runId}] queued total=${run.total}`);
        await waitForRun(runtime, run.runId);
        const result = await runtime.analysisService.getRunResults(run.runId);
        console.log(JSON.stringify({ status: result.run.status, result }, null, 2));
        return;
      }

      const result = await runtime.analysisService.run(input);
      console.log(JSON.stringify({ status: "completed", result }, null, 2));
      return;
    }

    printUsage();
    process.exitCode = 1;
  } finally {
    await runtime.close();
  }
}

/* istanbul ignore next */
if (require.main === module) {
  void main();
}
