import { CoreConfig } from "../config";
import { AIDiagnosis, FailureAnalysisInput, ResolvedAiRuntimeOptions } from "../types";
import { AnthropicAnalyzer } from "./anthropic-analyzer";
import { MockAiAnalyzer } from "./mock-analyzer";
import { OpenAiCompatibleAnalyzer } from "./openai-compatible-analyzer";
import { resolveProviderDefinition } from "./provider-registry";

export class RoutedAiAnalyzer {
  private readonly mockAnalyzer = new MockAiAnalyzer();

  private readonly openAiCompatibleAnalyzer: OpenAiCompatibleAnalyzer;

  private readonly anthropicAnalyzer: AnthropicAnalyzer;

  constructor(
    config: Pick<CoreConfig, "openAiApiKey" | "openAiBaseUrl">,
  ) {
    this.openAiCompatibleAnalyzer = new OpenAiCompatibleAnalyzer(config);
    this.anthropicAnalyzer = new AnthropicAnalyzer(config);
  }

  async analyze(
    input: FailureAnalysisInput,
    runtime: ResolvedAiRuntimeOptions,
  ): Promise<AIDiagnosis> {
    const provider = resolveProviderDefinition(runtime.provider);

    if (provider.protocol === "mock") {
      return this.mockAnalyzer.analyze(input, runtime);
    }

    if (provider.protocol === "openai-compatible") {
      return this.openAiCompatibleAnalyzer.analyze(input, runtime);
    }

    if (provider.protocol === "anthropic-messages") {
      return this.anthropicAnalyzer.analyze(input, runtime);
    }

    throw new Error(`Unsupported AI provider '${runtime.provider}'.`);
  }
}
