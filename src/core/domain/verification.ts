export type ClaimSource = "ai" | "human" | "system";
export type VerdictStatus = "supported" | "contradicted" | "inconclusive";
export type ClaimOperator = "equals" | "contains" | "one_of" | "gte" | "lte";

export type ActionScope = {
  id: string;
  type: string;
};

export type VerificationClaim<TValue = unknown> = {
  id: string;
  subject: string;
  predicate: string;
  operator?: ClaimOperator;
  expected: TValue;
  confidence: number;
  rationale: string;
  source: ClaimSource;
  executionId?: string;
  maxEvidenceAgeMs?: number;
  actionScope?: ActionScope;
};

export type EvidenceItem<TValue = unknown> = {
  id: string;
  type: string;
  value: TValue;
  source: string;
  observedAt: string;
  executionId?: string;
};

export type EvidenceBundle = {
  items: EvidenceItem[];
};

export type CoreVerdict<TValue = unknown> = {
  claimId: string;
  status: VerdictStatus;
  score: number;
  expected: TValue;
  observed?: TValue;
  reasons: string[];
  evidenceRefs: string[];
  actionScope?: ActionScope;
  validUntil?: string;
};

export interface ClaimVerifier<TValue = unknown> {
  verify(
    claim: VerificationClaim<TValue>,
    evidence: EvidenceBundle,
  ): CoreVerdict<TValue>;
}
