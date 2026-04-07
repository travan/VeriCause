import { z } from "zod";

export const ScenarioDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceFile: z.string().min(1),
  sourceType: z.enum(["md", "ts", "js", "http"]),
  url: z.string().url(),
  selector: z.string().min(1),
  expectedMode: z.enum(["deterministic_fail", "flaky", "loose_element"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const InlineScenarioInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  url: z.string().url(),
  selector: z.string().min(1),
  expectedMode: z.enum(["deterministic_fail", "flaky", "loose_element"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const AiRuntimeOptionsSchema = z.object({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export const AIDiagnosisSchema = z.object({
  predictedCause: z.enum([
    "invalid_selector",
    "timeout",
    "flaky_timing",
    "loose_element",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
});
