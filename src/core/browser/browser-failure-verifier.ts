import {
  ClaimVerifier,
  CoreVerdict,
  EvidenceBundle,
  EvidenceItem,
  VerificationClaim,
} from "../domain/verification";
import { AIDiagnosis, AnalysisCause, ValidationEvidence } from "../types";

const CLAIM_ID = "browser.failure_cause";

export function toBrowserFailureClaim(
  diagnosis: AIDiagnosis,
): VerificationClaim<AnalysisCause> {
  return {
    id: CLAIM_ID,
    subject: "browser_execution",
    predicate: "failure_cause",
    expected: diagnosis.predictedCause,
    confidence: diagnosis.confidence,
    rationale: diagnosis.summary,
    source: "ai",
  };
}

export function toBrowserEvidenceBundle(
  evidence: ValidationEvidence,
  observedAt = evidence.observedAt ?? new Date(0).toISOString(),
): EvidenceBundle {
  const item = <T>(id: string, type: string, value: T): EvidenceItem<T> => ({
    id,
    type,
    value,
    source: "playwright",
    observedAt,
  });

  return {
    items: [
      item("retry-status", "browser.retry_status", evidence.retryStatus),
      item("selector-exists", "browser.selector_exists", evidence.selectorExists),
      item("historical-pattern", "browser.historical_pattern", evidence.historicalPattern),
      item("failure-signature", "browser.failure_signature", evidence.failureSignature),
    ],
  };
}

export class BrowserFailureVerifier implements ClaimVerifier<AnalysisCause> {
  verify(
    claim: VerificationClaim<AnalysisCause>,
    evidence: EvidenceBundle,
  ): CoreVerdict<AnalysisCause> {
    const actualCause = this.determineActualCause(evidence);
    const status = actualCause === "unknown"
      ? "inconclusive"
      : claim.expected === actualCause
        ? "supported"
        : "contradicted";

    return {
      claimId: claim.id,
      status,
      score: status === "supported" ? 1 : status === "contradicted" ? 0 : 0.5,
      expected: claim.expected,
      observed: actualCause,
      reasons: [
        `Claim expected '${claim.expected}' while runtime evidence indicated '${actualCause}'.`,
      ],
      evidenceRefs: evidence.items.map((item) => item.id),
    };
  }

  private determineActualCause(evidence: EvidenceBundle): AnalysisCause {
    const retryStatus = this.valueOf(evidence, "browser.retry_status");
    const selectorExists = this.valueOf(evidence, "browser.selector_exists");
    const failureSignature = this.valueOf(evidence, "browser.failure_signature");

    if (retryStatus === "passed") {
      return "flaky_timing";
    }

    if (
      retryStatus === "failed" &&
      selectorExists === true &&
      failureSignature === "detached"
    ) {
      return "loose_element";
    }

    if (retryStatus === "failed" && selectorExists === false) {
      return "invalid_selector";
    }

    return "unknown";
  }

  private valueOf(evidence: EvidenceBundle, type: string): unknown {
    return evidence.items.find((item) => item.type === type)?.value;
  }
}
