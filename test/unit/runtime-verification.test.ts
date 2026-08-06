import { RuntimeVerificationService } from "../../src/core/application/runtime-verification-service";
import { StructuredRuntimeVerifier } from "../../src/core/runtime-verification/structured-runtime-verifier";

function claim(operator: "equals" | "contains" | "one_of" | "gte" | "lte", expected: unknown) {
  return {
    id: "claim-1",
    subject: "api",
    predicate: "result",
    operator,
    expected,
    confidence: 0.9,
    rationale: "test",
    source: "ai" as const,
  };
}

function evidence(value: unknown, type = "api.result") {
  return {
    items: [{
      id: "observation-1",
      type,
      value,
      source: "test-runtime",
      observedAt: "2026-08-06T00:00:00.000Z",
    }],
  };
}

describe("StructuredRuntimeVerifier", () => {
  const verifier = new StructuredRuntimeVerifier();

  it.each([
    ["equals", { ok: true }, { ok: true }],
    ["contains", "completed", "request completed"],
    ["contains", "write", ["read", "write"]],
    ["one_of", [200, 201], 201],
    ["gte", 1, 3],
    ["lte", 500, 120],
  ] as const)("supports the %s operator", (operator, expected, observed) => {
    expect(verifier.verify(claim(operator, expected), evidence(observed)).status)
      .toBe("supported");
  });

  it("returns contradicted for a mismatch and inconclusive for missing evidence", () => {
    expect(verifier.verify(claim("equals", 200), evidence(500)).status)
      .toBe("contradicted");
    expect(verifier.verify(claim("equals", 200), evidence(200, "api.other")))
      .toMatchObject({ status: "inconclusive", evidenceRefs: [] });
  });
});

describe("RuntimeVerificationService", () => {
  it("creates a CoreVerdict for non-browser runtime evidence", () => {
    const service = new RuntimeVerificationService(
      undefined,
      () => new Date("2026-08-06T12:00:00.000Z"),
    );
    expect(service.verify({
      target: "api",
      claim: claim("equals", 200),
      evidence: evidence(200),
    })).toMatchObject({
      verificationId: "verification-1786017600000",
      target: "api",
      coreVerdict: { status: "supported", observed: 200 },
    });
  });

  it("rejects a claim whose subject does not match the runtime target", () => {
    const service = new RuntimeVerificationService();
    expect(() => service.verify({
      target: "shell",
      claim: claim("equals", 0),
      evidence: evidence(0),
    })).toThrow("does not match target");
  });
});
