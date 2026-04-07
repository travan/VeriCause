export type ScenarioSourceType = "md" | "ts" | "js" | "http";
export type ScenarioMode = "deterministic_fail" | "flaky" | "loose_element";
export type ExecutionStatus = "passed" | "failed";
export type AnalysisRunStatus = "queued" | "running" | "completed" | "failed";
export type AiRuntimeOptions = {
  provider?: string;
  model?: string;
};

export type ResolvedAiRuntimeOptions = {
  provider: string;
  model: string;
};

export type AnalysisCause =
  | "invalid_selector"
  | "timeout"
  | "flaky_timing"
  | "loose_element"
  | "unknown";

export type ScenarioDefinition = {
  id: string;
  name: string;
  sourceFile: string;
  sourceType: ScenarioSourceType;
  url: string;
  selector: string;
  expectedMode?: ScenarioMode;
  timeoutMs?: number;
};

export type InlineScenarioInput = {
  id?: string;
  name?: string;
  url: string;
  selector: string;
  expectedMode?: ScenarioMode;
  timeoutMs?: number;
};

export type RunAnalysisInput = {
  scenarioId?: string;
  filePath?: string;
  runAll?: boolean;
  scenario?: InlineScenarioInput;
  ai?: AiRuntimeOptions;
};

export type ExecutionResult = {
  scenarioId: string;
  runId: string;
  phase: "first_run" | "retry_run";
  status: ExecutionStatus;
  errorMessage?: string;
  durationMs: number;
  screenshotPath?: string;
  tracePath?: string;
  selectorExistsAfterRun?: boolean;
  statusTextAfterRun?: string;
  timingMs?: {
    getBrowser?: number;
    newContext?: number;
    preparePage?: number;
    goto?: number;
    waitFor?: number;
    click?: number;
    observe?: number;
    screenshot?: number;
  };
  timestamp: string;
};

export type AIDiagnosis = {
  predictedCause: AnalysisCause;
  confidence: number;
  summary: string;
};

export type ValidationEvidence = {
  retryStatus: ExecutionStatus;
  selectorExists: boolean | null;
  historicalPattern: "stable_fail" | "flaky" | "unknown";
  failureSignature: "timeout" | "detached" | "unknown";
};

export type SelectorProbeResult = {
  selectorExists: boolean;
  observedAt: string;
  probeUrl: string;
  statusText?: string;
};

export type ReliabilityVerdict = {
  actualCause: Exclude<AnalysisCause, "timeout">;
  aiCorrect: boolean;
  action: "accept_ai" | "override_ai" | "needs_more_evidence";
  explanation: string;
};

export type AnalysisReport = {
  reportId: string;
  aiRuntime: ResolvedAiRuntimeOptions;
  scenario: ScenarioDefinition;
  firstRun: ExecutionResult;
  retryRun?: ExecutionResult;
  aiDiagnosis?: AIDiagnosis;
  validationEvidence?: ValidationEvidence;
  verdict?: ReliabilityVerdict;
  createdAt: string;
};

export type AnalysisRun = {
  runId: string;
  status: AnalysisRunStatus;
  aiRuntime: ResolvedAiRuntimeOptions;
  scenarioIds: string[];
  total: number;
  completed: number;
  passed: number;
  failed: number;
  pending: number;
  reportIds: string[];
  errors: string[];
  createdAt: string;
  updatedAt: string;
};

export type AnalysisRunResults = {
  run: AnalysisRun;
  reports: AnalysisReport[];
};

export type FailureAnalysisInput = {
  scenario: ScenarioDefinition;
  firstRun: ExecutionResult;
};

export type ReliabilityValidationInput = {
  aiDiagnosis: AIDiagnosis;
  validationEvidence: ValidationEvidence;
};

export type ReliabilityValidationOutput = {
  validationEvidence: ValidationEvidence;
  verdict: ReliabilityVerdict;
};
