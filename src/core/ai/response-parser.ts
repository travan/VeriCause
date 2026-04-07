import { AIDiagnosisSchema } from "../schemas";
import { AIDiagnosis } from "../types";
import { AnthropicResponse, OpenAiCompatibleResponse } from "./types";

export function parseDiagnosisJson(content: string): AIDiagnosis {
  const normalized = content.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    return AIDiagnosisSchema.parse(JSON.parse(normalized));
  } catch {
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Provider response did not contain valid JSON.");
    }

    return AIDiagnosisSchema.parse(JSON.parse(jsonMatch[0]));
  }
}

export function extractOpenAiContent(payload: OpenAiCompatibleResponse): string {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text ?? "")
      .join("")
      .trim();
  }

  throw new Error("Provider response did not contain a usable message content.");
}

export function extractAnthropicContent(payload: AnthropicResponse): string {
  const content = payload.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();

  if (!content) {
    throw new Error("Provider response did not return text content.");
  }

  return content;
}
