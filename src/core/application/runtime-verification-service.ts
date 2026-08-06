import {
  RuntimeVerificationInput,
  RuntimeVerificationResult,
} from "../domain/runtime-verification";
import { StructuredRuntimeVerifier } from "../runtime-verification/structured-runtime-verifier";

export class RuntimeVerificationService {
  constructor(
    private readonly verifier = new StructuredRuntimeVerifier(),
    private readonly now: () => Date = () => new Date(),
  ) {}

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
