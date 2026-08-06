#!/usr/bin/env node
import { resolve } from "node:path";

import { createCoreRuntime } from "../core/runtime";
import { AnalysisRunStatus, RunAnalysisInput } from "../core/types";
import { EvaluationThresholds } from "../core/domain/evaluation";
import { readJsonFile } from "../core/fs";
import {
  EvaluationDatasetSchema,
  EvaluationThresholdsSchema,
  GuardReportInputSchema,
  RuntimeVerificationInputSchema,
} from "../core/schemas";

type AnalyzeCliArgs = {
  input: RunAnalysisInput;
  asyncMode: boolean;
};

export function parseEvaluateArgs(args: string[]): {
  datasetPath: string;
  thresholds: EvaluationThresholds;
} {
  const datasetIndex = args.indexOf("--dataset");
  const datasetPath = datasetIndex >= 0 ? args[datasetIndex + 1] : undefined;

  if (!datasetPath) {
    throw new Error("evaluate requires --dataset <path>.");
  }

  const thresholdFlags: Record<string, keyof EvaluationThresholds> = {
    "--min-claim-accuracy": "minClaimAccuracy",
    "--min-verifier-accuracy": "minVerifierAccuracy",
    "--min-decision-accuracy": "minDecisionAccuracy",
    "--max-false-accept-rate": "maxFalseAcceptRate",
    "--max-false-override-rate": "maxFalseOverrideRate",
    "--max-inconclusive-rate": "maxInconclusiveRate",
    "--max-brier-score": "maxBrierScore",
  };
  const thresholds: EvaluationThresholds = {};

  for (const [flag, key] of Object.entries(thresholdFlags)) {
    const index = args.indexOf(flag);
    if (index >= 0) thresholds[key] = Number(args[index + 1]);
  }

  return {
    datasetPath,
    thresholds: EvaluationThresholdsSchema.parse(thresholds),
  };
}

export function parseCompareArgs(args: string[]): {
  baselineEvaluationId: string;
  candidateEvaluationId: string;
} {
  const baselineIndex = args.indexOf("--baseline");
  const candidateIndex = args.indexOf("--candidate");
  const baselineEvaluationId = baselineIndex >= 0 ? args[baselineIndex + 1] : undefined;
  const candidateEvaluationId = candidateIndex >= 0 ? args[candidateIndex + 1] : undefined;

  if (!baselineEvaluationId || !candidateEvaluationId) {
    throw new Error("compare requires --baseline <id> and --candidate <id>.");
  }
  return { baselineEvaluationId, candidateEvaluationId };
}

export function parseGuardArgs(args: string[]) {
  const reportIndex = args.indexOf("--report");
  const riskIndex = args.indexOf("--risk");
  return GuardReportInputSchema.parse({
    reportId: reportIndex >= 0 ? args[reportIndex + 1] : undefined,
    risk: riskIndex >= 0 ? args[riskIndex + 1] : undefined,
  });
}

export function parseVerifyArgs(args: string[]): { inputPath: string } {
  const inputIndex = args.indexOf("--input");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  if (!inputPath) throw new Error("verify requires --input <path>.");
  return { inputPath };
}

export function printUsage(): void {
  console.log(`
ai-reliability-layer — validate AI failure analysis against runtime evidence

USAGE
  npx ai-reliability-layer <command> [options]

COMMANDS
  discover                   List all scenario files found in SCENARIO_DIR
  analyze                    Run one or more scenarios and print a report
  evaluate                   Run a ground-truth evaluation dataset
  compare                    Compare two persisted evaluation runs
  guard                      Apply a runtime policy to an analysis report
  verify                     Verify API, shell, database, or tool evidence

ANALYZE OPTIONS
  --all                      Run every discovered scenario
  --scenario <id>            Run a single scenario by its ID
  --file <path>              Run a single scenario from a file path
  --async                    Start an async run and stream progress until done
  --provider <name>          Override the AI provider for this run
  --model <name>             Override the AI model for this run
  --help, -h                 Show this help message

EVALUATE OPTIONS
  --dataset <path>           JSON file containing evaluation cases and ground truth
  --min-decision-accuracy N  Fail the quality gate below this accuracy (0..1)
  --max-false-accept-rate N  Fail the quality gate above this rate (0..1)
  --max-inconclusive-rate N  Fail the quality gate above this rate (0..1)

COMPARE OPTIONS
  --baseline <id>            Baseline evaluation ID
  --candidate <id>           Candidate evaluation ID

GUARD OPTIONS
  --report <id>              Analysis report containing a CoreVerdict
  --risk <level>             low | medium | high | critical

VERIFY OPTIONS
  --input <path>             JSON claim and runtime evidence bundle

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

  # Evaluate a ground-truth dataset
  npx ai-reliability-layer evaluate --dataset ./evaluation/dataset.json

  # Compare a candidate evaluation against a baseline
  npx ai-reliability-layer compare --baseline evaluation-1 --candidate evaluation-2

  # Apply the default runtime guardrail policy
  npx ai-reliability-layer guard --report report-1 --risk high

  # Verify evidence collected by a non-browser executor
  npx ai-reliability-layer verify --input ./verification/api-status.json

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

    if (command === "evaluate") {
      if (args.includes("--help") || args.includes("-h")) {
        printUsage();
        return;
      }

      const { datasetPath, thresholds } = parseEvaluateArgs(args);
      const dataset = EvaluationDatasetSchema.parse(
        await readJsonFile<unknown>(resolve(datasetPath)),
      );
      const result = await runtime.evaluationService.run(dataset, thresholds);
      console.log(JSON.stringify({ status: "completed", result }, null, 2));
      if (result.qualityGate.status === "failed") process.exitCode = 2;
      return;
    }

    if (command === "compare") {
      const { baselineEvaluationId, candidateEvaluationId } = parseCompareArgs(args);
      const result = await runtime.evaluationService.compare(
        baselineEvaluationId,
        candidateEvaluationId,
      );
      console.log(JSON.stringify({ status: "completed", result }, null, 2));
      if (result.status === "regressed") process.exitCode = 2;
      return;
    }

    if (command === "guard") {
      const decision = await runtime.guardrailService.decide(parseGuardArgs(args));
      console.log(JSON.stringify({ status: "completed", decision }, null, 2));
      if (decision.action === "block" || decision.action === "escalate") {
        process.exitCode = 2;
      }
      return;
    }

    if (command === "verify") {
      const { inputPath } = parseVerifyArgs(args);
      const input = RuntimeVerificationInputSchema.parse(
        await readJsonFile<unknown>(resolve(inputPath)),
      );
      const result = runtime.runtimeVerificationService.verify(input);
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
