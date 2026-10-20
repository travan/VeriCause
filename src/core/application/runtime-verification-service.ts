import {
  RuntimeVerificationInput,
  RuntimeVerificationResult,
} from "../domain/runtime-verification";
import { StructuredRuntimeVerifier } from "../runtime-verification/structured-runtime-verifier";

export class RuntimeVerificationService {
  private readonly verifier: StructuredRuntimeVerifier;

  constructor(
    verifier: StructuredRuntimeVerifier | undefined = undefined,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.verifier = verifier ?? new StructuredRuntimeVerifier(now);
  }

  verify(input: RuntimeVerificationInput): RuntimeVerificationResult {
    if (input.claim.subject !== input.target) {
      throw new Error(
        `Claim subject '${input.claim.subject}' does not match target '${input.target}'.`,
      );
    }
    const createdAt = this.now();
    return {
      verificationId: `verification-${createdAt.getTime()}`,
      target: input.target,
      claim: input.claim,
      evidence: input.evidence,
      coreVerdict: this.verifier.verify(input.claim, input.evidence),
      createdAt: createdAt.toISOString(),
    };
  }
}
