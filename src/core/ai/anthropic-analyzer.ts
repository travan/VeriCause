import { CoreConfig } from "../config";
import { AIDiagnosis, FailureAnalysisInput, ResolvedAiRuntimeOptions } from "../types";
import { buildFailurePrompt, buildSystemPrompt } from "./prompt";
import { resolveProviderConfig } from "./provider-config";
import { extractAnthropicContent, parseDiagnosisJson } from "./response-parser";
import { AnthropicResponse, FailureAnalyzer } from "./types";

export class AnthropicAnalyzer implements FailureAnalyzer {
  constructor(
    private readonly config: Pick<CoreConfig, "openAiApiKey" | "openAiBaseUrl">,
  ) {}

  async analyze(
    input: FailureAnalysisInput,
    runtime: ResolvedAiRuntimeOptions,
  ): Promise<AIDiagnosis> {
    const providerConfig = resolveProviderConfig(this.config, runtime.provider);
    const response = await fetch(
      `${providerConfig.baseUrl.replace(/\/$/, "")}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": providerConfig.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: runtime.model,
          max_tokens: 300,
          temperature: 0.1,
          system: buildSystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildFailurePrompt(input),
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Provider '${runtime.provider}' failed with ${response.status} ${response.statusText}.`,
      );
    }

    const payload = (await response.json()) as AnthropicResponse;
    return parseDiagnosisJson(extractAnthropicContent(payload));
  }
}
