import { isDeepStrictEqual } from "node:util";

import {
  ClaimOperator,
  ClaimVerifier,
  CoreVerdict,
  EvidenceBundle,
  VerificationClaim,
} from "../domain/verification";

export class StructuredRuntimeVerifier implements ClaimVerifier {
  verify(claim: VerificationClaim, evidence: EvidenceBundle): CoreVerdict {
    const evidenceType = `${claim.subject}.${claim.predicate}`;
    const observation = evidence.items.find((item) => item.type === evidenceType);

    if (!observation) {
      return {
        claimId: claim.id,
        status: "inconclusive",
        score: 0.5,
        expected: claim.expected,
        reasons: [`No evidence item matched type '${evidenceType}'.`],
        evidenceRefs: [],
      };
    }

    const operator = claim.operator ?? "equals";
    const supported = this.matches(operator, claim.expected, observation.value);
    return {
      claimId: claim.id,
      status: supported ? "supported" : "contradicted",
      score: supported ? 1 : 0,
      expected: claim.expected,
      observed: observation.value,
      reasons: [
        `Observation '${observation.id}' ${supported ? "satisfied" : "did not satisfy"} operator '${operator}'.`,
      ],
      evidenceRefs: [observation.id],
    };
  }

  private matches(operator: ClaimOperator, expected: unknown, observed: unknown): boolean {
    switch (operator) {
      case "equals":
        return isDeepStrictEqual(observed, expected);
      case "contains":
        return typeof observed === "string"
          ? observed.includes(String(expected))
          : Array.isArray(observed) && observed.some((value) => isDeepStrictEqual(value, expected));
      case "one_of":
        return Array.isArray(expected) && expected.some((value) => isDeepStrictEqual(value, observed));
      case "gte":
        return typeof observed === "number" && typeof expected === "number" && observed >= expected;
      case "lte":
        return typeof observed === "number" && typeof expected === "number" && observed <= expected;
    }
  }
}
