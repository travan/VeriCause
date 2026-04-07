import { AIDiagnosis, FailureAnalysisInput, ResolvedAiRuntimeOptions } from "../types";

export type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
};

export type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type FailureAnalyzer = {
  analyze(
    input: FailureAnalysisInput,
    runtime: ResolvedAiRuntimeOptions,
  ): Promise<AIDiagnosis>;
};
