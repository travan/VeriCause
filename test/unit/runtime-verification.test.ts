import { RuntimeVerificationService } from "../../src/core/application/runtime-verification-service";
import { StructuredRuntimeVerifier } from "../../src/core/runtime-verification/structured-runtime-verifier";
import { GuardrailPolicyEngine } from "../../src/core/guardrail/policy-engine";
import { RuntimeVerificationInputSchema, GuardReportInputSchema } from "../../src/core/schemas";

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
      observedAt: new Date().toISOString(),
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

  it("does not let observation order decide a conflicting claim", () => {
    const good = { ...evidence(200).items[0], id: "good" };
    const bad = { ...evidence(500).items[0], id: "bad" };
    for (const items of [[good, bad], [bad, good]]) {
      expect(verifier.verify(claim("equals", 200), { items })).toMatchObject({
        status: "inconclusive",
        evidenceRefs: ["bad", "good"],
      });
    }
  });

  it("does not accept stale or future evidence", () => {
    for (const observedAt of ["2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
      expect(verifier.verify(claim("equals", 200), {
        items: [{ ...evidence(200).items[0], observedAt }],
      }).status).toBe("inconclusive");
    }
  });

  it("uses a requested execution and does not combine different executions", () => {
    const items = [
      { ...evidence(200).items[0], id: "a", executionId: "run-a" },
      { ...evidence(500).items[0], id: "b", executionId: "run-b" },
    ];
    expect(verifier.verify(claim("equals", 200), { items }).status).toBe("inconclusive");
    expect(verifier.verify({ ...claim("equals", 200), executionId: "run-b" }, { items }))
      .toMatchObject({ status: "contradicted", evidenceRefs: ["b"] });
    expect(verifier.verify({ ...claim("equals", 200), executionId: "missing" }, { items }).status)
      .toBe("inconclusive");
  });

  it("uses a configurable freshness window with a deterministic clock", () => {
    const now = new Date("2026-10-19T10:00:00.000Z");
    const verifier = new StructuredRuntimeVerifier(() => now);
    const items = [{ ...evidence(200).items[0], observedAt: "2026-10-19T09:59:50.000Z" }];
    expect(verifier.verify({ ...claim("equals", 200), maxEvidenceAgeMs: 5000 }, { items }).status)
      .toBe("inconclusive");
    expect(verifier.verify({ ...claim("equals", 200), maxEvidenceAgeMs: 20000 }, { items }))
      .toMatchObject({ status: "supported", validUntil: "2026-10-19T10:00:10.000Z" });
    expect(() => verifier.verify({ ...claim("equals", 200), maxEvidenceAgeMs: NaN }, { items }))
      .toThrow("maxEvidenceAgeMs");
    expect(verifier.verify(claim("equals", 200), {
      items: [{ ...items[0], observedAt: "invalid" }],
    }).status).toBe("inconclusive");
  });

  it("uses all agreeing observations and rejects duplicate evidence IDs", () => {
    const a = { ...evidence(200).items[0], id: "a" };
    const b = { ...a, id: "b" };
    expect(verifier.verify(claim("equals", 200), { items: [b, a] }))
      .toMatchObject({ status: "supported", evidenceRefs: ["a", "b"] });
    expect(verifier.verify(claim("equals", 200), { items: [a, a] }).status)
      .toBe("inconclusive");
  });

  it("round-trips action scope through request schemas and expires authorization", () => {
    let now = new Date("2026-10-19T10:00:00.000Z");
    const actionScope = { id: "publish-1", type: "publish" };
    const input = RuntimeVerificationInputSchema.parse({
      target: "api",
      claim: { ...claim("equals", 200), actionScope, executionId: "health-1", maxEvidenceAgeMs: 1000 },
      evidence: { items: [{ ...evidence(200).items[0], executionId: "health-1", observedAt: now.toISOString() }] },
    });
    const { proposedAction } = GuardReportInputSchema.parse({
      reportId: "report-1", risk: "high", proposedAction: { ...actionScope, description: "Publish the build" },
    });
    const result = new RuntimeVerificationService(undefined, () => now).verify(input);
    const engine = new GuardrailPolicyEngine(() => now);
    expect(result.coreVerdict.actionScope).toEqual(actionScope);
    expect(engine.evaluate(result.coreVerdict, "high", {}, proposedAction).action).toBe("allow");
    now = new Date(now.getTime() + 1001);
    expect(engine.evaluate(result.coreVerdict, "high", {}, proposedAction).action).toBe("escalate");
  });
});

describe("RuntimeVerificationService", () => {
  it("creates a CoreVerdict for non-browser runtime evidence", () => {
    const service = new RuntimeVerificationService();
    expect(service.verify({
      target: "api",
      claim: claim("equals", 200),
      evidence: evidence(200),
    })).toMatchObject({
      verificationId: expect.stringMatching(/^verification-/),
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
