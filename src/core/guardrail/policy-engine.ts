import {
  GuardrailAction,
  GuardrailPolicy,
  GuardrailPolicyOverrides,
  RiskLevel,
} from "../domain/guardrail";
import { CoreVerdict } from "../domain/verification";

export const DEFAULT_GUARDRAIL_POLICY: GuardrailPolicy = {
  id: "default-safe-v1",
  minEvidenceCount: 1,
  supportedAction: "allow",
  contradictedAction: "block",
  inconclusiveActions: {
    low: "retry",
    medium: "retry",
    high: "escalate",
    critical: "block",
  },
};

export type PolicyEvaluation = {
  action: GuardrailAction;
  policy: GuardrailPolicy;
  reasons: string[];
};

export class GuardrailPolicyEngine {
  evaluate(
    verdict: CoreVerdict,
    risk: RiskLevel,
    overrides: GuardrailPolicyOverrides = {},
  ): PolicyEvaluation {
    const policy: GuardrailPolicy = {
      ...DEFAULT_GUARDRAIL_POLICY,
      ...overrides,
      inconclusiveActions: {
        ...DEFAULT_GUARDRAIL_POLICY.inconclusiveActions,
        ...overrides.inconclusiveActions,
      },
    };

    if (verdict.evidenceRefs.length < policy.minEvidenceCount) {
      const action = policy.inconclusiveActions[risk];
      return {
        action,
        policy,
        reasons: [
          `Evidence count ${verdict.evidenceRefs.length} is below policy minimum ${policy.minEvidenceCount}.`,
          `Applied inconclusive action '${action}' for risk '${risk}'.`,
        ],
      };
    }

    if (verdict.status === "supported") {
      return {
        action: policy.supportedAction,
        policy,
        reasons: [`Runtime evidence supports the claim; policy selected '${policy.supportedAction}'.`],
      };
    }

    if (verdict.status === "contradicted") {
      return {
        action: policy.contradictedAction,
        policy,
        reasons: [`Runtime evidence contradicts the claim; policy selected '${policy.contradictedAction}'.`],
      };
    }

    const action = policy.inconclusiveActions[risk];
    return {
      action,
      policy,
      reasons: [`Evidence is inconclusive; policy selected '${action}' for risk '${risk}'.`],
    };
  }
}
