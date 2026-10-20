import {
  GuardrailAction,
  GuardrailPolicy,
  GuardrailPolicyOverrides,
  ProposedAction,
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
  constructor(private readonly now: () => Date = () => new Date()) {}

  evaluate(
    verdict: CoreVerdict,
    risk: RiskLevel,
    overrides: GuardrailPolicyOverrides = {},
    proposedAction?: ProposedAction,
  ): PolicyEvaluation {
    const policy: GuardrailPolicy = {
      ...DEFAULT_GUARDRAIL_POLICY,
      ...overrides,
      inconclusiveActions: {
        ...DEFAULT_GUARDRAIL_POLICY.inconclusiveActions,
        ...overrides.inconclusiveActions,
      },
    };

    if (proposedAction && (!proposedAction.id || !verdict.actionScope ||
      verdict.actionScope.id !== proposedAction.id ||
      verdict.actionScope.type !== proposedAction.type)) {
      return {
        action: risk === "critical" || verdict.status === "contradicted" ? "block" : "escalate",
        policy,
        reasons: ["The verified claim is not bound to this proposed action's ID and type."],
      };
    }

    if (proposedAction && verdict.status === "supported" &&
      (!verdict.validUntil || !Number.isFinite(Date.parse(verdict.validUntil)) ||
        Date.parse(verdict.validUntil) <= this.now().getTime())) {
      return {
        action: risk === "critical" ? "block" : "escalate",
        policy,
        reasons: ["The action's evidence validity has expired or is missing; verify fresh evidence."],
      };
    }

    const evidenceCount = new Set(verdict.evidenceRefs).size;
    if (evidenceCount < policy.minEvidenceCount) {
      const action = policy.inconclusiveActions[risk];
      return {
        action,
        policy,
        reasons: [
          `Evidence count ${evidenceCount} is below policy minimum ${policy.minEvidenceCount}.`,
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
