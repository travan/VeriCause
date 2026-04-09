import type { FailureAnalysisInput, ResolvedAiRuntimeOptions } from "../../src/core/types";
import { buildFailurePrompt, buildSystemPrompt } from "../../src/core/ai/prompt";
import {
  extractAnthropicContent,
  extractOpenAiContent,
  parseDiagnosisJson,
} from "../../src/core/ai/response-parser";
import {
  listSupportedProviders,
  resolveProviderDefinition,
} from "../../src/core/ai/provider-registry";
import { resolveProviderConfig } from "../../src/core/ai/provider-config";
import { MockAiAnalyzer } from "../../src/core/ai/mock-analyzer";
import { OpenAiCompatibleAnalyzer } from "../../src/core/ai/openai-compatible-analyzer";
import { AnthropicAnalyzer } from "../../src/core/ai/anthropic-analyzer";
import { RoutedAiAnalyzer } from "../../src/core/ai-analyzer";
import { fetchWithRetry } from "../../src/core/ai/fetch-with-retry";

const baseInput: FailureAnalysisInput = {
  scenario: {
    id: "invalid-selector",
    name: "Invalid selector",
    sourceFile: "scenario.md",
    sourceType: "md",
    url: "fixture://invalid-selector",
    selector: "#wrong-button",
    expectedMode: "deterministic_fail",
    timeoutMs: 1000,
  },
  firstRun: {
    scenarioId: "invalid-selector",
    runId: "run-1",
    phase: "first_run",
    status: "failed",
    errorMessage: "Timeout 1000ms exceeded.",
    durationMs: 1000,
    selectorExistsAfterRun: false,
    timestamp: new Date().toISOString(),
  },
};

const openAiRuntime: ResolvedAiRuntimeOptions = {
  provider: "grok",
  model: "grok-3-mini",
};

describe("AI layer", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("builds prompts", () => {
    expect(buildSystemPrompt()).toContain("Return strict JSON only");
    expect(buildFailurePrompt(baseInput)).toContain('"selector":"#wrong-button"');
  });

  it("parses JSON responses", () => {
    expect(parseDiagnosisJson('{"predictedCause":"invalid_selector","confidence":0.9,"summary":"ok"}'))
      .toEqual({
        predictedCause: "invalid_selector",
        confidence: 0.9,
        summary: "ok",
      });

    expect(parseDiagnosisJson("```json\n{\"predictedCause\":\"unknown\",\"confidence\":0.2,\"summary\":\"x\"}\n```"))
      .toEqual({
        predictedCause: "unknown",
        confidence: 0.2,
        summary: "x",
      });

    expect(parseDiagnosisJson("prefix {\"predictedCause\":\"timeout\",\"confidence\":0.4,\"summary\":\"fallback\"} suffix"))
      .toEqual({
        predictedCause: "timeout",
        confidence: 0.4,
        summary: "fallback",
      });

    expect(extractOpenAiContent({
      choices: [{ message: { content: "hello" } }],
    })).toBe("hello");

    expect(extractOpenAiContent({
      choices: [{ message: { content: [{ text: "he" }, { text: "llo" }] } }],
    })).toBe("hello");

    expect(extractAnthropicContent({
      content: [{ type: "text", text: "world" }],
    })).toBe("world");

    expect(() => parseDiagnosisJson("not-json")).toThrow("Provider response did not contain valid JSON.");
    expect(() => extractOpenAiContent({ choices: [{ message: {} }] })).toThrow(
      "Provider response did not contain a usable message content.",
    );
    expect(() => extractAnthropicContent({ content: [{ type: "tool_use", text: "ignored" }] })).toThrow(
      "Provider response did not return text content.",
    );
  });

  it("resolves provider registry entries", () => {
    expect(resolveProviderDefinition("gemini")).toEqual({
      name: "gemini",
      protocol: "openai-compatible",
    });
    expect(listSupportedProviders()).toContain("claude");
    expect(() => resolveProviderDefinition("unknown-provider")).toThrow(
      "Unsupported AI provider",
    );
  });

  it("resolves provider config from env and fallbacks", () => {
    process.env.AI_GROK_BASE_URL = "https://grok.example/v1";
    process.env.AI_GROK_API_KEY = "grok-key";

    expect(resolveProviderConfig({
      openAiApiKey: "openai-key",
      openAiBaseUrl: "https://openai.example/v1",
    }, "grok")).toEqual({
      baseUrl: "https://grok.example/v1",
      apiKey: "grok-key",
    });

    expect(resolveProviderConfig({
      openAiApiKey: "openai-key",
      openAiBaseUrl: "https://openai.example/v1",
    }, "openai")).toEqual({
      baseUrl: "https://openai.example/v1",
      apiKey: "openai-key",
    });

    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    expect(resolveProviderConfig({
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
    }, "claude")).toEqual({
      baseUrl: "https://api.anthropic.com/v1",
        apiKey: "anthropic-key",
      });

    expect(() => resolveProviderConfig({
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
    }, "deepseek")).toThrow("Provider 'deepseek' is not configured.");
  });

  it("uses the mock analyzer", async () => {
    const analyzer = new MockAiAnalyzer();
    await expect(analyzer.analyze(baseInput, { provider: "mock", model: "gpt-5.4" }))
      .resolves.toMatchObject({
        predictedCause: "invalid_selector",
      });

    await expect(analyzer.analyze({
      ...baseInput,
      scenario: {
        ...baseInput.scenario,
        expectedMode: "flaky",
      },
    }, { provider: "mock", model: "gpt-5.4" })).resolves.toMatchObject({
      confidence: 0.78,
    });

    await expect(analyzer.analyze({
      ...baseInput,
      scenario: {
        ...baseInput.scenario,
        expectedMode: "loose_element",
      },
    }, { provider: "mock", model: "gpt-5.4" })).resolves.toMatchObject({
      summary: expect.stringContaining("could not be acted on reliably"),
    });
  });

  it("calls an OpenAI-compatible provider", async () => {
    process.env.AI_GROK_BASE_URL = "https://grok.example/v1";
    process.env.AI_GROK_API_KEY = "grok-key";
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{\"predictedCause\":\"invalid_selector\",\"confidence\":0.77,\"summary\":\"grok\"}",
            },
          },
        ],
      }),
    } as unknown as Response);

    const analyzer = new OpenAiCompatibleAnalyzer({
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
    });

    const diagnosis = await analyzer.analyze(baseInput, openAiRuntime);

    expect(diagnosis.summary).toBe("grok");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://grok.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("surfaces provider HTTP errors", async () => {
    process.env.AI_GROK_BASE_URL = "https://grok.example/v1";
    process.env.AI_GROK_API_KEY = "grok-key";
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
    } as unknown as Response);

    const analyzer = new OpenAiCompatibleAnalyzer({
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
    });

    await expect(analyzer.analyze(baseInput, openAiRuntime)).rejects.toThrow(
      "Provider 'grok' failed with 500 Server Error.",
    );
  });

  it("calls an Anthropic-compatible provider", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: "{\"predictedCause\":\"loose_element\",\"confidence\":0.71,\"summary\":\"claude\"}",
          },
        ],
      }),
    } as unknown as Response);

    const analyzer = new AnthropicAnalyzer({
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
    });

    const diagnosis = await analyzer.analyze(baseInput, {
      provider: "claude",
      model: "claude-3-7-sonnet",
    });

    expect(diagnosis.summary).toBe("claude");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("surfaces Anthropic text extraction and HTTP errors", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "tool_use", text: "ignored" }],
      }),
    } as unknown as Response);

    const analyzer = new AnthropicAnalyzer({
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
    });

    await expect(
      analyzer.analyze(baseInput, {
        provider: "claude",
        model: "claude-3-7-sonnet",
      }),
    ).rejects.toThrow("Provider response did not return text content.");

    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as unknown as Response);

    await expect(
      analyzer.analyze(baseInput, {
        provider: "claude",
        model: "claude-3-7-sonnet",
      }),
    ).rejects.toThrow("Provider 'claude' failed with 401 Unauthorized.");
  });

  it("routes to the correct analyzer by protocol", async () => {
    const router = new RoutedAiAnalyzer({
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
    });

    const mockSpy = jest.spyOn(MockAiAnalyzer.prototype, "analyze");
    const openAiSpy = jest.spyOn(OpenAiCompatibleAnalyzer.prototype, "analyze").mockResolvedValue({
      predictedCause: "invalid_selector",
      confidence: 0.8,
      summary: "openai-compatible",
    });
    const anthropicSpy = jest.spyOn(AnthropicAnalyzer.prototype, "analyze").mockResolvedValue({
      predictedCause: "unknown",
      confidence: 0.3,
      summary: "anthropic",
    });

    await router.analyze(baseInput, { provider: "mock", model: "gpt-5.4" });
    await router.analyze(baseInput, { provider: "gemini", model: "gemini-2.5-pro" });
    await router.analyze(baseInput, { provider: "claude", model: "claude-3-7-sonnet" });

    expect(mockSpy).toHaveBeenCalled();
    expect(openAiSpy).toHaveBeenCalled();
    expect(anthropicSpy).toHaveBeenCalled();

    await expect(
      router.analyze(baseInput, { provider: "unsupported", model: "x" }),
    ).rejects.toThrow("Unsupported AI provider");
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the response on the first successful attempt", async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("https://example.com", { method: "POST" });

    expect(result).toBe(mockResponse);
  });

  it("retries on network errors and succeeds on the third attempt", async () => {
    jest.spyOn(global, "setTimeout").mockImplementation(((cb: TimerHandler) => {
      if (typeof cb === "function") cb();
      return 0 as never;
    }) as unknown as typeof setTimeout);

    const mockResponse = { ok: true, status: 200 } as Response;
    const fetchSpy = jest.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("https://example.com", { method: "GET" });

    expect(result).toBe(mockResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after all attempts fail", async () => {
    jest.spyOn(global, "setTimeout").mockImplementation(((cb: TimerHandler) => {
      if (typeof cb === "function") cb();
      return 0 as never;
    }) as unknown as typeof setTimeout);

    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("persistent failure"));

    await expect(fetchWithRetry("https://example.com", {})).rejects.toThrow("persistent failure");
  });

  it("converts an AbortError into a timeout message", async () => {
    jest.spyOn(global, "setTimeout").mockImplementation(((cb: TimerHandler) => {
      if (typeof cb === "function") cb();
      return 0 as never;
    }) as unknown as typeof setTimeout);

    const abortError = Object.assign(new Error("signal aborted"), { name: "AbortError" });
    jest.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(fetchWithRetry("https://example.com", {})).rejects.toThrow(
      "AI request timed out after 30000ms.",
    );
  });
});
