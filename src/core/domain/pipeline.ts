export type PipelineStage =
  | "first_execution"
  | "ai_analysis"
  | "retry_execution"
  | "evidence_collection"
  | "claim_verification"
  | "report_persistence";

export type PipelineErrorCategory = "target" | "analysis" | "system";

export type StructuredPipelineError = {
  code: string;
  category: PipelineErrorCategory;
  stage: PipelineStage;
  message: string;
  retryable: boolean;
  cause?: string;
};

export type StageEvent = {
  stage: PipelineStage;
  status: "started" | "completed" | "failed";
  timestamp: string;
  durationMs?: number;
  details?: Record<string, string | number | boolean | null>;
  error?: StructuredPipelineError;
};

export class AnalysisPipelineError extends Error {
  constructor(
    readonly details: StructuredPipelineError,
    readonly stageEvents: StageEvent[],
    cause?: unknown,
  ) {
    super(details.message, { cause });
    this.name = "AnalysisPipelineError";
  }
}

export function isAnalysisPipelineError(error: unknown): error is AnalysisPipelineError {
  return error instanceof AnalysisPipelineError;
}
