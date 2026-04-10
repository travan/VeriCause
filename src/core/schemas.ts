import { z } from "zod";

// Safe identifier for use as a filename component: alphanumeric + hyphens/underscores, no slash/dot traversal
export const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/;

// Provider: lowercase alphanumeric with hyphens/underscores, max 63 chars
const SAFE_PROVIDER_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

// Model: no control characters (prevents header/log injection), max 200 chars
const SAFE_MODEL_RE = /^[^\x00-\x1f\x7f]{1,200}$/;

// Allowed URL protocols for user-supplied scenario URLs
const ALLOWED_URL_PROTOCOL_RE = /^(https?:|fixture:)\/\//;

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
  id: z
    .string()
    .regex(SAFE_ID_RE, "id must be alphanumeric with hyphens or underscores (max 200 chars)")
    .optional(),
  name: z.string().min(1).optional(),
  url: z
    .string()
    .url()
    .refine(
      (url) => ALLOWED_URL_PROTOCOL_RE.test(url),
      "URL must use http:, https:, or fixture: protocol",
    ),
  selector: z.string().min(1),
  expectedMode: z.enum(["deterministic_fail", "flaky", "loose_element"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const AiRuntimeOptionsSchema = z.object({
  provider: z
    .string()
    .trim()
    .refine((v) => v === "" || SAFE_PROVIDER_RE.test(v), {
      message: "provider must be lowercase alphanumeric (hyphens and underscores allowed, max 63 chars)",
    })
    .optional(),
  model: z
    .string()
    .trim()
    .refine((v) => v === "" || SAFE_MODEL_RE.test(v), {
      message: "model must not contain control characters (max 200 chars)",
    })
    .optional(),
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
