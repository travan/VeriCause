import {
  AnalysisCause,
  ReliabilityValidationInput,
  ReliabilityValidationOutput,
  ValidationEvidence,
} from "./types";

export class ReliabilityEvaluator {
  async validate(
    input: ReliabilityValidationInput,
  ): Promise<ReliabilityValidationOutput> {
    const actualCause = this.determineActualCause(input.validationEvidence);
    const aiCorrect = input.aiDiagnosis.predictedCause === actualCause;

    return {
      validationEvidence: input.validationEvidence,
      verdict: {
        actualCause,
        aiCorrect,
        action:
          actualCause === "unknown"
            ? "needs_more_evidence"
            : aiCorrect
              ? "accept_ai"
              : "override_ai",
        explanation: `AI predicted '${input.aiDiagnosis.predictedCause}' while validated evidence indicated '${actualCause}'.`,
      },
    };
  }

  private determineActualCause(
    evidence: ValidationEvidence,
  ): Exclude<AnalysisCause, "timeout"> {
    if (evidence.retryStatus === "passed") {
      return "flaky_timing";
    }

    if (
      evidence.retryStatus === "failed" &&
      evidence.selectorExists === true &&
      evidence.failureSignature === "detached"
    ) {
      return "loose_element";
    }

    if (evidence.retryStatus === "failed" && evidence.selectorExists === false) {
      return "invalid_selector";
    }

    return "unknown";
  }
}
