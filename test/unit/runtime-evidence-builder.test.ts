import { RuntimeEvidenceBuilder } from "../../src/core/evidence/runtime-evidence-builder";
import { ExecutionResult } from "../../src/core/types";

function retry(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    scenarioId: "scenario",
    runId: "retry-1",
    phase: "retry_run",
    status: "failed",
    durationMs: 10,
    timestamp: "2026-08-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("RuntimeEvidenceBuilder", () => {
  const builder = new RuntimeEvidenceBuilder();

  it("classifies a passing retry as flaky", () => {
    expect(builder.build(retry({ status: "passed", selectorExistsAfterRun: true })))
      .toMatchObject({ historicalPattern: "flaky", retryStatus: "passed" });
  });

  it("requires verified navigation on both attempts", () => {
    const valid = retry({ navigation: {
      succeeded: true, targetMatched: true, requestedUrl: "https://app.example/checkout",
    } });
    expect(builder.build(valid, valid).pageVerified).toBe(true);
    expect(builder.build(valid).pageVerified).toBe(false);
    expect(builder.build(valid, retry()).pageVerified).toBe(false);
    expect(builder.build(retry({ navigation: { ...valid.navigation!, succeeded: false } }), valid).pageVerified)
      .toBe(false);
    expect(builder.build(valid, retry({ navigation: { ...valid.navigation!, targetMatched: false } })).pageVerified)
      .toBe(false);
  });

  it("classifies a missing selector and timeout", () => {
    expect(builder.build(retry({
      selectorExistsAfterRun: false,
      errorMessage: "Timeout 1000ms exceeded",
    }))).toEqual({
      retryStatus: "failed",
      pageVerified: false,
      selectorExists: false,
      historicalPattern: "stable_fail",
      failureSignature: "timeout",
      observedAt: "2026-08-06T00:00:00.000Z",
    });
  });

  it("prefers detached runtime status and preserves unknown evidence", () => {
    expect(builder.build(retry({
      selectorExistsAfterRun: true,
      errorMessage: "action failed",
      statusTextAfterRun: "Element detached from DOM",
    }))).toMatchObject({
      historicalPattern: "unknown",
      failureSignature: "detached",
    });

    expect(builder.build(retry())).toMatchObject({
      selectorExists: null,
      failureSignature: "unknown",
    });
  });
});
