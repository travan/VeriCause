import { CoreConfig } from "../config";
import { ProviderConfig } from "./types";

export function resolveProviderConfig(
  config: Pick<CoreConfig, "openAiApiKey" | "openAiBaseUrl">,
  provider: string,
): ProviderConfig {
  const normalizedProvider = provider.trim().toLowerCase();
  const envKey = normalizedProvider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const explicitBaseUrl =
    process.env[`AI_${envKey}_BASE_URL`] ??
    process.env[`${envKey}_BASE_URL`];
  const explicitApiKey =
    process.env[`AI_${envKey}_API_KEY`] ??
    process.env[`${envKey}_API_KEY`];

  if (explicitBaseUrl && explicitApiKey) {
    return {
      baseUrl: explicitBaseUrl,
      apiKey: explicitApiKey,
    };
  }

  if (
    (normalizedProvider === "openai" || normalizedProvider === "openai-compatible") &&
    config.openAiBaseUrl &&
    config.openAiApiKey
  ) {
    return {
      baseUrl: config.openAiBaseUrl,
      apiKey: config.openAiApiKey,
    };
  }

  if (normalizedProvider === "anthropic" || normalizedProvider === "claude") {
    const anthropicApiKey =
      explicitApiKey ??
      process.env.ANTHROPIC_API_KEY ??
      process.env.CLAUDE_API_KEY;
    const anthropicBaseUrl =
      explicitBaseUrl ??
      process.env.ANTHROPIC_BASE_URL ??
      "https://api.anthropic.com/v1";

    if (anthropicApiKey) {
      return {
        baseUrl: anthropicBaseUrl,
        apiKey: anthropicApiKey,
      };
    }
  }

  throw new Error(
    [
      `Provider '${provider}' is not configured.`,
      `Expected env like AI_${envKey}_BASE_URL and AI_${envKey}_API_KEY.`,
      "For Anthropic/Claude you can also use ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY.",
    ].join(" "),
  );
}
