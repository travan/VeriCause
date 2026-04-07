import { FailureAnalysisInput } from "../types";

const SYSTEM_PROMPT =
  "You analyze Playwright failures. Return strict JSON only with predictedCause, confidence, summary. predictedCause must be one of invalid_selector, timeout, flaky_timing, loose_element, unknown.";

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildFailurePrompt(input: FailureAnalysisInput): string {
  return JSON.stringify({
    scenario: {
      id: input.scenario.id,
      name: input.scenario.name,
      url: input.scenario.url,
      selector: input.scenario.selector,
      timeoutMs: input.scenario.timeoutMs ?? 1000,
    },
    firstRun: {
      status: input.firstRun.status,
      errorMessage: input.firstRun.errorMessage,
      durationMs: input.firstRun.durationMs,
      selectorExistsAfterRun: input.firstRun.selectorExistsAfterRun,
      statusTextAfterRun: input.firstRun.statusTextAfterRun,
    },
  });
}
