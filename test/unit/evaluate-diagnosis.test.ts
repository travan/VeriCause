import { EvaluateDiagnosis } from "../../src/core/application/evaluate-diagnosis";
import { AnalysisPipelineError } from "../../src/core/domain/pipeline";
import { AnalysisReport, ExecutionResult, ScenarioDefinition } from "../../src/core/types";

const scenario: ScenarioDefinition = {
  id: "invalid-selector",
  name: "Invalid selector",
  sourceFile: "invalid-selector.md",
  sourceType: "md",
  url: "fixture://invalid-selector",
  selector: "#wrong-button",
};

const runtime = { provider: "mock", model: "mock-v1" };
const fixedNow = () => new Date("2026-08-06T12:00:00.000Z");

function execution(status: ExecutionResult["status"], phase: ExecutionResult["phase"]): ExecutionResult {
  return {
    scenarioId: scenario.id,
    runId: `${scenario.id}-${phase}`,
    phase,
    status,
    durationMs: 10,
    timestamp: fixedNow().toISOString(),
  };
}

describe("EvaluateDiagnosis", () => {
  it("stores a passing report without invoking AI or retry", async () => {
    const reportRepository = {
      save: jest.fn(async (report: AnalysisReport) => report),
      getById: jest.fn(),
    };
    const executionEngine = {
      runFirstAttempt: jest.fn(async () => execution("passed", "first_run")),
      retry: jest.fn(),
      close: jest.fn(),
    };
    const aiAnalyzer = { analyze: jest.fn() };
    const useCase = new EvaluateDiagnosis(
      executionEngine,
      aiAnalyzer,
      { build: jest.fn() },
      { validate: jest.fn() },
      reportRepository,
      fixedNow,
    );

    await expect(useCase.execute(scenario, runtime)).resolves.toMatchObject({
      reportId: "invalid-selector-1786017600000",
      firstRun: { status: "passed" },
    });
    expect(aiAnalyzer.analyze).not.toHaveBeenCalled();
    expect(executionEngine.retry).not.toHaveBeenCalled();
  });

  it("runs diagnosis, evidence, and verdict stages in order for a failure", async () => {
    const calls: string[] = [];
    const firstRun = execution("failed", "first_run");
    const retryRun = execution("failed", "retry_run");
    const diagnosis = {
      predictedCause: "invalid_selector" as const,
      confidence: 0.9,
      summary: "Selector is missing",
    };
    const evidence = {
      retryStatus: "failed" as const,
      selectorExists: false,
      historicalPattern: "stable_fail" as const,
      failureSignature: "timeout" as const,
    };
    const verdict = {
      actualCause: "invalid_selector" as const,
      aiCorrect: true,
      action: "accept_ai" as const,
      explanation: "confirmed",
    };
    const claim = {
      id: "browser.failure_cause",
      subject: "browser_execution",
      predicate: "failure_cause",
      expected: "invalid_selector" as const,
      confidence: 0.9,
      rationale: "Selector is missing",
      source: "ai" as const,
    };
    const evidenceBundle = { items: [] };
    const coreVerdict = {
      claimId: claim.id,
      status: "supported" as const,
      score: 1,
      expected: "invalid_selector" as const,
      observed: "invalid_selector" as const,
      reasons: ["confirmed"],
      evidenceRefs: [],
    };
    const useCase = new EvaluateDiagnosis(
      {
        runFirstAttempt: jest.fn(async () => { calls.push("first"); return firstRun; }),
        retry: jest.fn(async () => { calls.push("retry"); return retryRun; }),
        close: jest.fn(),
      },
      { analyze: jest.fn(async () => { calls.push("analyze"); return diagnosis; }) },
      { build: jest.fn(() => { calls.push("evidence"); return evidence; }) },
      {
        validate: jest.fn(async () => {
          calls.push("verdict");
          return {
            validationEvidence: evidence,
            verdict,
            claim,
            evidence: evidenceBundle,
            coreVerdict,
          };
        }),
      },
      {
        save: jest.fn(async (report) => { calls.push("save"); return report; }),
        getById: jest.fn(),
      },
      fixedNow,
    );

    const report = await useCase.execute(scenario, runtime);

    expect(calls).toEqual(["first", "analyze", "retry", "evidence", "verdict", "save"]);
    expect(report).toMatchObject({
      aiDiagnosis: diagnosis,
      validationEvidence: evidence,
      verdict,
      claim,
      evidence: evidenceBundle,
      coreVerdict,
    });
    expect(report.stageEvents?.filter((event) => event.status === "completed"))
      .toMatchObject([
        {
          stage: "first_execution",
          details: {
            executionStatus: "failed",
            targetFailure: true,
            failureCategory: "target",
          },
        },
        { stage: "ai_analysis" },
        {
          stage: "retry_execution",
          details: {
            executionStatus: "failed",
            targetFailure: true,
            failureCategory: "target",
          },
        },
        { stage: "evidence_collection" },
        { stage: "claim_verification" },
      ]);
  });

  it("wraps analyzer failures with structured stage context", async () => {
    const retry = jest.fn();
    const useCase = new EvaluateDiagnosis(
      {
        runFirstAttempt: jest.fn(async () => execution("failed", "first_run")),
        retry,
        close: jest.fn(),
      },
      { analyze: jest.fn(async () => { throw new Error("provider unavailable"); }) },
      { build: jest.fn() },
      { validate: jest.fn() },
      { save: jest.fn(), getById: jest.fn() },
      fixedNow,
    );

    const error = await useCase.execute(scenario, runtime).catch((caught) => caught);

    expect(error).toBeInstanceOf(AnalysisPipelineError);
    expect(error.details).toEqual({
      code: "AI_ANALYSIS_FAILED",
      category: "analysis",
      stage: "ai_analysis",
      message: "Pipeline stage 'ai_analysis' failed: provider unavailable",
      retryable: true,
      cause: "provider unavailable",
    });
    expect(error.stageEvents.at(-1)).toMatchObject({
      stage: "ai_analysis",
      status: "failed",
      error: { code: "AI_ANALYSIS_FAILED" },
    });
    expect(retry).not.toHaveBeenCalled();
  });

  it("classifies thrown execution and persistence failures as system errors", async () => {
    const executionFailure = new EvaluateDiagnosis(
      {
        runFirstAttempt: jest.fn(async () => { throw new Error("browser crashed"); }),
        retry: jest.fn(),
        close: jest.fn(),
      },
      { analyze: jest.fn() },
      { build: jest.fn() },
      { validate: jest.fn() },
      { save: jest.fn(), getById: jest.fn() },
      fixedNow,
    );
    const persistenceFailure = new EvaluateDiagnosis(
      {
        runFirstAttempt: jest.fn(async () => execution("passed", "first_run")),
        retry: jest.fn(),
        close: jest.fn(),
      },
      { analyze: jest.fn() },
      { build: jest.fn() },
      { validate: jest.fn() },
      {
        save: jest.fn(async () => { throw new Error("disk full"); }),
        getById: jest.fn(),
      },
      fixedNow,
    );

    await expect(executionFailure.execute(scenario, runtime)).rejects.toMatchObject({
      details: { stage: "first_execution", category: "system", retryable: false },
    });
    await expect(persistenceFailure.execute(scenario, runtime)).rejects.toMatchObject({
      details: { stage: "report_persistence", category: "system", retryable: true },
    });
  });
});
