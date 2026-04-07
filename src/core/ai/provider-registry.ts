export type ProviderProtocol =
  | "mock"
  | "openai-compatible"
  | "anthropic-messages";

export type ProviderDefinition = {
  name: string;
  protocol: ProviderProtocol;
};

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  { name: "mock", protocol: "mock" },
  { name: "openai", protocol: "openai-compatible" },
  { name: "openai-compatible", protocol: "openai-compatible" },
  { name: "grok", protocol: "openai-compatible" },
  { name: "qwen", protocol: "openai-compatible" },
  { name: "deepseek", protocol: "openai-compatible" },
  { name: "ollama", protocol: "openai-compatible" },
  { name: "lmstudio", protocol: "openai-compatible" },
  { name: "local", protocol: "openai-compatible" },
  { name: "gemini", protocol: "openai-compatible" },
  { name: "anthropic", protocol: "anthropic-messages" },
  { name: "claude", protocol: "anthropic-messages" },
];

const PROVIDER_BY_NAME = new Map(
  PROVIDER_DEFINITIONS.map((provider) => [provider.name, provider]),
);

export function resolveProviderDefinition(name: string): ProviderDefinition {
  const normalizedName = name.trim().toLowerCase();
  const definition = PROVIDER_BY_NAME.get(normalizedName);

  if (!definition) {
    throw new Error(
      `Unsupported AI provider '${name}'. Add it to src/core/ai/provider-registry.ts.`,
    );
  }

  return definition;
}

export function listSupportedProviders(): string[] {
  return PROVIDER_DEFINITIONS.map((provider) => provider.name);
}
