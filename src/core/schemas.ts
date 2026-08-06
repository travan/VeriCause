import { z } from "zod";
import { JsonValue } from "./domain/runtime-verification";

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

export const EvaluationCaseSchema = z.object({
  id: z.string().regex(SAFE_ID_RE),
  input: z.object({
    scenarioId: z.string().min(1).optional(),
    filePath: z.string().min(1).optional(),
    scenario: InlineScenarioInputSchema.optional(),
    ai: AiRuntimeOptionsSchema.optional(),
    runAll: z.literal(false).optional(),
  }).refine(
    (input) => [input.scenarioId, input.filePath, input.scenario]
      .filter((value) => value !== undefined).length === 1,
    "Each evaluation case must select exactly one scenario.",
  ),
  groundTruth: z.object({
    value: z.enum([
      "invalid_selector",
      "timeout",
      "flaky_timing",
      "loose_element",
    ]),
    source: z.string().min(1),
    notes: z.string().optional(),
  }),
});

export const EvaluationDatasetSchema = z.array(EvaluationCaseSchema).min(1);

const RateSchema = z.number().min(0).max(1);
export const EvaluationThresholdsSchema = z.object({
  minClaimAccuracy: RateSchema.optional(),
  minVerifierAccuracy: RateSchema.optional(),
  minDecisionAccuracy: RateSchema.optional(),
  maxFalseAcceptRate: RateSchema.optional(),
  maxFalseOverrideRate: RateSchema.optional(),
  maxInconclusiveRate: RateSchema.optional(),
  maxBrierScore: RateSchema.optional(),
});

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const GuardrailPolicySchema = z.object({
  id: z.string().regex(SAFE_ID_RE).optional(),
  minEvidenceCount: z.number().int().nonnegative().optional(),
  supportedAction: z.enum(["allow", "escalate"]).optional(),
  contradictedAction: z.enum(["block", "escalate"]).optional(),
  inconclusiveActions: z.object({
    low: z.enum(["allow", "block", "retry", "escalate"]).optional(),
    medium: z.enum(["allow", "block", "retry", "escalate"]).optional(),
    high: z.enum(["allow", "block", "retry", "escalate"]).optional(),
    critical: z.enum(["allow", "block", "retry", "escalate"]).optional(),
  }).partial().optional(),
}).partial();

export const GuardReportInputSchema = z.object({
  reportId: z.string().regex(SAFE_ID_RE),
  risk: RiskLevelSchema,
  proposedAction: z.object({
    type: z.string().min(1),
    description: z.string().min(1),
  }).optional(),
  policy: GuardrailPolicySchema.optional(),
});

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(JsonValueSchema),
]));

export const RuntimeVerificationInputSchema = z.object({
  target: z.enum(["api", "shell", "database", "tool"]),
  claim: z.object({
    id: z.string().regex(SAFE_ID_RE),
    subject: z.enum(["api", "shell", "database", "tool"]),
    predicate: z.string().min(1),
    operator: z.enum(["equals", "contains", "one_of", "gte", "lte"]).optional(),
    expected: JsonValueSchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string().min(1),
    source: z.enum(["ai", "human", "system"]),
  }),
  evidence: z.object({
    items: z.array(z.object({
      id: z.string().regex(SAFE_ID_RE),
      type: z.string().min(1),
      value: JsonValueSchema,
      source: z.string().min(1),
      observedAt: z.string().datetime(),
    })),
  }),
});
