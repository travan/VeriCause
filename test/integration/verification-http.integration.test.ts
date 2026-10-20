import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { ServerModule } from "../../src/server/server.module";
import { CORE_RUNTIME } from "../../src/server/core-runtime.provider";
import { CoreRuntime } from "../../src/core/runtime";

it("preserves evidence and action scope across HTTP verification and guardrail routes", async () => {
  const artifacts = await mkdtemp(join(tmpdir(), "verification-http-"));
  const original = process.env.BASE_OUTPUT_DIR;
  process.env.BASE_OUTPUT_DIR = artifacts;
  const app = await NestFactory.create(ServerModule, { logger: false });
  const runtime = app.get<CoreRuntime>(CORE_RUNTIME);
  try {
    await app.init();
    const action = { id: "release-1", type: "release", description: "Release build" };
    const input = {
      target: "api",
      claim: {
        id: "health", subject: "api", predicate: "status", expected: 200,
        confidence: 0.9, source: "system", rationale: "Release requires healthy service",
        executionId: "health-1", maxEvidenceAgeMs: 60000,
        actionScope: { id: action.id, type: action.type },
      },
      evidence: { items: [{ id: "response", type: "api.status", value: 200,
        source: "http-client", executionId: "health-1", observedAt: new Date().toISOString() }] },
    };
    const verified = await request(app.getHttpServer()).post("/verification/run").send(input).expect(201);
    expect(verified.body.result.coreVerdict).toMatchObject({ status: "supported", actionScope: input.claim.actionScope });
    await runtime.reportStore.save({ reportId: "health-report", coreVerdict: verified.body.result.coreVerdict } as never);
    const guard = (proposedAction: typeof action) => request(app.getHttpServer()).post("/guardrail/decide")
      .send({ reportId: "health-report", risk: "high", proposedAction }).expect(201);
    const allowed = await guard(action);
    expect(allowed.body.decision.action).toBe("allow");
    expect((await guard({ ...action, id: "release-2" })).body.decision.action).toBe("escalate");
    const saved = await request(app.getHttpServer()).get(`/guardrail/decisions/${allowed.body.decision.decisionId}`).expect(200);
    expect(saved.body.decision.actionScope).toEqual(input.claim.actionScope);
    expect(saved.body.decision.action).toBe("allow");

    const conflicted = await request(app.getHttpServer()).post("/verification/run").send({
      ...input, evidence: { items: [...input.evidence.items, { ...input.evidence.items[0], id: "other", value: 500 }] },
    }).expect(201);
    expect(conflicted.body.result.coreVerdict.status).toBe("inconclusive");
  } finally {
    await runtime.close();
    await app.close();
    if (original === undefined) delete process.env.BASE_OUTPUT_DIR;
    else process.env.BASE_OUTPUT_DIR = original;
    await rm(artifacts, { recursive: true, force: true });
  }
});
