import { CoreConfig } from "../config";
import { AIDiagnosis, FailureAnalysisInput, ResolvedAiRuntimeOptions } from "../types";
import { buildFailurePrompt, buildSystemPrompt } from "./prompt";
import { resolveProviderConfig } from "./provider-config";
import { extractOpenAiContent, parseDiagnosisJson } from "./response-parser";
import { FailureAnalyzer, OpenAiCompatibleResponse } from "./types";

export class OpenAiCompatibleAnalyzer implements FailureAnalyzer {
  constructor(
    private readonly config: Pick<CoreConfig, "openAiApiKey" | "openAiBaseUrl">,
  ) {}

  async analyze(
    input: FailureAnalysisInput,
    runtime: ResolvedAiRuntimeOptions,
  ): Promise<AIDiagnosis> {
    const providerConfig = resolveProviderConfig(this.config, runtime.provider);
    const response = await fetch(
      `${providerConfig.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: runtime.model,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(),
            },
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

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    return parseDiagnosisJson(extractOpenAiContent(payload));
  }
}
