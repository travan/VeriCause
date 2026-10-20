import { isDeepStrictEqual } from "node:util";

import {
  ClaimOperator,
  ClaimVerifier,
  CoreVerdict,
  EvidenceBundle,
  VerificationClaim,
} from "../domain/verification";

export const DEFAULT_MAX_EVIDENCE_AGE_MS = 5 * 60 * 1000;

export class StructuredRuntimeVerifier implements ClaimVerifier {
  constructor(private readonly now: () => Date = () => new Date()) {}

  verify(claim: VerificationClaim, evidence: EvidenceBundle): CoreVerdict {
    const evidenceType = `${claim.subject}.${claim.predicate}`;
    const maxAgeMs = claim.maxEvidenceAgeMs ?? DEFAULT_MAX_EVIDENCE_AGE_MS;
    if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
      throw new Error("maxEvidenceAgeMs must be a positive safe integer.");
    }
    const base = {
      claimId: claim.id,
      expected: claim.expected,
      ...(claim.actionScope ? { actionScope: { ...claim.actionScope } } : {}),
    };
    const inconclusive = (reason: string, refs: string[] = []): CoreVerdict => ({
      ...base, status: "inconclusive", score: 0.5,
      reasons: [reason], evidenceRefs: [...new Set(refs)].sort(),
    });
    const matching = evidence.items.filter((item) =>
      item.type === evidenceType &&
      (claim.executionId === undefined || item.executionId === claim.executionId),
    );
    const now = this.now().getTime();
    const observations = matching.filter((item) => {
      const age = now - Date.parse(item.observedAt);
      return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
    }).sort((a, b) => a.id.localeCompare(b.id));

    if (observations.length === 0) {
      return inconclusive(`No fresh evidence matched '${evidenceType}' and the requested execution scope.`);
    }
    const refs = observations.map((item) => item.id);
    if (new Set(refs).size !== refs.length) {
      return inconclusive("Matching evidence contains duplicate observation IDs.", refs);
    }
    if (new Set(observations.map((item) => item.executionId)).size > 1) {
      return inconclusive("Matching evidence spans multiple executions; specify claim.executionId.", refs);
    }
    const observation = observations[0];
    if (observations.some((item) => !isDeepStrictEqual(item.value, observation.value))) {
      return inconclusive("Matching observations conflict; a single outcome cannot be established.", refs);
    }

    const operator = claim.operator ?? "equals";
    const supported = this.matches(operator, claim.expected, observation.value);
    return {
      ...base,
      status: supported ? "supported" : "contradicted",
      score: supported ? 1 : 0,
      observed: observation.value,
      validUntil: new Date(observations.reduce((expiry, item) =>
        Math.min(expiry, Date.parse(item.observedAt) + maxAgeMs),
      8_640_000_000_000_000)).toISOString(),
      reasons: [
        `Matching observations ${supported ? "satisfied" : "did not satisfy"} operator '${operator}'.`,
      ],
      evidenceRefs: refs,
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
