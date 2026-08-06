import {
  BrowserFailureVerifier,
  toBrowserEvidenceBundle,
  toBrowserFailureClaim,
} from "./browser/browser-failure-verifier";
import { ReliabilityValidationInput, ReliabilityValidationOutput } from "./types";

export class ReliabilityEvaluator {
  constructor(private readonly verifier = new BrowserFailureVerifier()) {}

  async validate(
    input: ReliabilityValidationInput,
  ): Promise<ReliabilityValidationOutput> {
    const claim = toBrowserFailureClaim(input.aiDiagnosis);
    const evidence = toBrowserEvidenceBundle(input.validationEvidence);
    const coreVerdict = this.verifier.verify(claim, evidence);
    const actualCause = coreVerdict.observed === "timeout"
      ? "unknown"
      : coreVerdict.observed ?? "unknown";
    const aiCorrect = coreVerdict.status === "supported";

    return {
      validationEvidence: input.validationEvidence,
      claim,
      evidence,
      coreVerdict,
      verdict: {
        actualCause,
        aiCorrect,
        action:
          coreVerdict.status === "inconclusive"
            ? "needs_more_evidence"
            : coreVerdict.status === "supported"
              ? "accept_ai"
              : "override_ai",
        explanation: coreVerdict.reasons.join(" "),
      },
    };
  }
}
