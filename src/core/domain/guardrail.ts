import { CoreVerdict } from "./verification";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type GuardrailAction = "allow" | "block" | "retry" | "escalate";

export type ProposedAction = {
  type: string;
  description: string;
};

export type GuardrailPolicy = {
  id: string;
  minEvidenceCount: number;
  supportedAction: Extract<GuardrailAction, "allow" | "escalate">;
  contradictedAction: Extract<GuardrailAction, "block" | "escalate">;
  inconclusiveActions: Record<RiskLevel, GuardrailAction>;
};

export type GuardrailPolicyOverrides = Omit<
  Partial<GuardrailPolicy>,
  "inconclusiveActions"
> & {
  inconclusiveActions?: Partial<Record<RiskLevel, GuardrailAction>>;
};

export type GuardrailDecision = {
  decisionId: string;
  reportId?: string;
  action: GuardrailAction;
  risk: RiskLevel;
  policyId: string;
  verdictStatus: CoreVerdict["status"];
  proposedAction?: ProposedAction;
  reasons: string[];
  evidenceRefs: string[];
  createdAt: string;
};

export type GuardReportInput = {
  reportId: string;
  risk: RiskLevel;
  proposedAction?: ProposedAction;
  policy?: GuardrailPolicyOverrides;
};
