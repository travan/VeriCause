import { createCoreRuntime } from "../core/runtime";
import { AnalysisRunStatus, RunAnalysisInput } from "../core/types";

type AnalyzeCliArgs = {
  input: RunAnalysisInput;
  asyncMode: boolean;
};

export function printUsage(): void {
  console.log(`Usage:
  npm run cli -- discover
  npm run cli -- analyze --all
  npm run cli -- analyze --all --async
  npm run cli -- analyze --scenario <id>
  npm run cli -- analyze --file <path>
  npm run cli -- analyze --file <path> --provider mock --model gpt-5.4`);
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
    if (!command) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    if (command === "discover") {
      const scenarios = await runtime.analysisService.discoverScenarios();
      console.log(JSON.stringify({ scenarios }, null, 2));
      return;
    }

    if (command === "analyze") {
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
