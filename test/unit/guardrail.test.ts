import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GuardrailService } from "../../src/core/application/guardrail-service";
import { CoreVerdict } from "../../src/core/domain/verification";
import { FileGuardrailDecisionStore } from "../../src/core/guardrail/decision-store";
import { GuardrailPolicyEngine } from "../../src/core/guardrail/policy-engine";

function verdict(
  status: CoreVerdict["status"],
  evidenceRefs = ["evidence-1"],
): CoreVerdict {
  return {
    claimId: "claim-1",
    status,
    score: status === "supported" ? 1 : status === "contradicted" ? 0 : 0.5,
    expected: "safe",
    observed: status === "inconclusive" ? "unknown" : "safe",
    reasons: [],
    evidenceRefs,
  };
}

describe("GuardrailPolicyEngine", () => {
  const engine = new GuardrailPolicyEngine();

  it("maps core verdicts to safe default actions", () => {
    expect(engine.evaluate(verdict("supported"), "high").action).toBe("allow");
    expect(engine.evaluate(verdict("contradicted"), "low").action).toBe("block");
    expect(engine.evaluate(verdict("inconclusive"), "low").action).toBe("retry");
    expect(engine.evaluate(verdict("inconclusive"), "high").action).toBe("escalate");
    expect(engine.evaluate(verdict("inconclusive"), "critical").action).toBe("block");
  });

  it("treats insufficient evidence as inconclusive and supports policy overrides", () => {
    const result = engine.evaluate(verdict("supported", []), "high", {
      id: "strict-v1",
      minEvidenceCount: 2,
      inconclusiveActions: { high: "block" },
    });

    expect(result).toMatchObject({
      action: "block",
      policy: { id: "strict-v1", minEvidenceCount: 2 },
    });
    expect(result.reasons[0]).toContain("below policy minimum");
  });

  it("requires a matching action ID and type even with permissive overrides", () => {
    const scoped = { ...verdict("supported"), actionScope: { id: "action-1", type: "publish" },
      validUntil: new Date(Date.now() + 60000).toISOString() };
    for (const proposedAction of [
      { type: "publish", description: "Missing ID" },
      { id: "action-2", type: "publish", description: "Wrong execution" },
      { id: "action-1", type: "purchase", description: "Wrong action" },
    ]) {
      expect(engine.evaluate(scoped, "high", { inconclusiveActions: { high: "allow" } }, proposedAction).action)
        .toBe("escalate");
      expect(engine.evaluate(scoped, "critical", {}, proposedAction).action).toBe("block");
    }
    const action = { id: "action-1", type: "publish", description: "Publish" };
    expect(engine.evaluate(scoped, "high", {}, action).action).toBe("allow");
    expect(engine.evaluate({ ...scoped, status: "contradicted" }, "high", {}, action).action).toBe("block");
    expect(engine.evaluate({ ...scoped, validUntil: undefined }, "high", {}, action).action).toBe("escalate");
    expect(engine.evaluate({ ...scoped, validUntil: "invalid" }, "high", {}, action).action).toBe("escalate");
  });

  it("counts distinct evidence references for minimum evidence policies", () => {
    expect(engine.evaluate(verdict("supported", ["one", "one"]), "high", { minEvidenceCount: 2 }).action)
      .toBe("escalate");
  });
});

describe("GuardrailService", () => {
  it("does not authorize an unrelated action using a supported diagnosis", async () => {
    const service = new GuardrailService(
      { getById: jest.fn(), save: jest.fn() } as never,
      { save: jest.fn(async (decision) => decision), getById: jest.fn() },
    );
    const decision = await service.decideVerdict(verdict("supported"), "high", {
      type: "purchase", description: "Submit a purchase",
    });
    expect(decision.action).toBe("escalate");
  });
  it("loads a report, creates an auditable decision, and persists it", async () => {
    const save = jest.fn(async (decision) => decision);
    const service = new GuardrailService(
      {
        getById: jest.fn(async () => ({
          reportId: "report-1",
          coreVerdict: verdict("contradicted"),
        })),
        save: jest.fn(),
      } as never,
      { save, getById: jest.fn() },
      undefined,
      () => new Date("2026-08-06T12:00:00.000Z"),
    );

    const decision = await service.decide({
      reportId: "report-1",
      risk: "critical",
      proposedAction: { type: "browser.click", description: "Click purchase" },
    });

    expect(decision).toMatchObject({
      decisionId: expect.stringMatching(/^decision-1786017600000-/),
      reportId: "report-1",
      action: "block",
      verdictStatus: "contradicted",
      policyId: "default-safe-v1",
      proposedAction: { type: "browser.click" },
    });
    expect(save).toHaveBeenCalledWith(decision);
  });

  it("rejects legacy reports without a core verdict", async () => {
    const service = new GuardrailService(
      { getById: jest.fn(async () => ({ reportId: "legacy" })), save: jest.fn() } as never,
      { save: jest.fn(), getById: jest.fn() },
    );
    await expect(service.decide({ reportId: "legacy", risk: "low" }))
      .rejects.toThrow("does not contain a core verdict");
  });

  it("keeps decisions made in the same millisecond as separate audit records", async () => {
    const root = await mkdtemp(join(tmpdir(), "guardrail-unique-"));
    const store = new FileGuardrailDecisionStore(root);
    const service = new GuardrailService(
      { getById: jest.fn(), save: jest.fn() } as never,
      store, undefined, () => new Date("2026-10-20T00:00:00.000Z"),
    );
    try {
      const [allowed, blocked] = await Promise.all([
        service.decideVerdict(verdict("supported"), "high"),
        service.decideVerdict(verdict("contradicted"), "high"),
      ]);
      expect(allowed.decisionId).not.toBe(blocked.decisionId);
      expect((await service.getById(allowed.decisionId)).action).toBe("allow");
      expect((await service.getById(blocked.decisionId)).action).toBe("block");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists decisions in a traversal-safe file store", async () => {
    const root = await mkdtemp(join(tmpdir(), "guardrail-store-"));
    const store = new FileGuardrailDecisionStore(root);
    const decision = {
      decisionId: "decision-1",
      action: "allow" as const,
      risk: "low" as const,
      policyId: "default-safe-v1",
      verdictStatus: "supported" as const,
      reasons: [],
      evidenceRefs: ["evidence-1"],
      createdAt: "2026-08-06T00:00:00.000Z",
    };

    try {
      await expect(store.save(decision)).resolves.toEqual(decision);
      await expect(store.getById("decision-1")).resolves.toEqual(decision);
      await expect(store.getById("../unsafe")).rejects.toThrow(
        "Invalid guardrail decision ID",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
