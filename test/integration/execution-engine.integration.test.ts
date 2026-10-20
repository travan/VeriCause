import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";

import { PlaywrightExecutionEngine } from "../../src/core/execution-engine";
import { RuntimeEvidenceBuilder } from "../../src/core/evidence/runtime-evidence-builder";
import { ReliabilityEvaluator } from "../../src/core/reliability-evaluator";

describe("PlaywrightExecutionEngine", () => {
  it("does not diagnose selector errors on HTTP failures or a different destination", async () => {
    const server = createServer((req, res) => {
      if (req.url?.startsWith("/redirect")) {
        res.writeHead(302, { location: "/login" });
      } else {
        res.writeHead(req.url?.startsWith("/error") ? 500 : 200, { "content-type": "text/html" });
      }
      res.end(req.url?.startsWith("/late-redirect")
        ? '<html><body><script>setTimeout(() => location.href = "/login", 25)</script></body></html>'
        : "<html><body>Page without target</body></html>");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const artifactsDir = await mkdtemp(resolve(tmpdir(), "navigation-integration-"));
    const engine = new PlaywrightExecutionEngine(artifactsDir, "fixtures");
    try {
      for (const route of ["error", "redirect", "late-redirect"]) {
        const scenario = {
          id: route, name: route, sourceFile: "inline", sourceType: "http" as const,
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${route}`,
          selector: "#missing", timeoutMs: 500,
        };
        const first = await engine.runFirstAttempt(scenario);
        const retry = await engine.retry(scenario);
        const evidence = new RuntimeEvidenceBuilder().build(retry, first);
        const result = await new ReliabilityEvaluator().validate({
          aiDiagnosis: { predictedCause: "invalid_selector", confidence: 0.99, summary: "Wrong selector" },
          validationEvidence: evidence,
        });
        expect(evidence.pageVerified).toBe(false);
        expect(result.coreVerdict.status).toBe("inconclusive");
        expect(retry.navigation).toMatchObject(route === "error"
          ? { httpStatus: 500, succeeded: false }
          : { httpStatus: 200, succeeded: true, targetMatched: false });
      }
    } finally {
      await engine.close();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      await rm(artifactsDir, { recursive: true, force: true });
    }
  }, 20000);

  it("runs real fixtures and produces expected runtime behavior", async () => {
    const artifactsDir = await mkdtemp(resolve(tmpdir(), "ai-reliability-engine-"));
    const engine = new PlaywrightExecutionEngine(
      artifactsDir,
      resolve(process.cwd(), "fixtures/pages"),
      false,
      false,
    );

    try {
      const invalid = await engine.runFirstAttempt({
        id: "invalid-selector",
        name: "Invalid selector",
        sourceFile: "scenario.md",
        sourceType: "md",
        url: "fixture://invalid-selector",
        selector: "#wrong-button",
        timeoutMs: 1000,
      });
      const delayedFirst = await engine.runFirstAttempt({
        id: "delayed-element",
        name: "Delayed element",
        sourceFile: "scenario.ts",
        sourceType: "ts",
        url: "fixture://delayed-element",
        selector: "#submit",
        timeoutMs: 1000,
      });
      const delayedRetry = await engine.retry({
        id: "delayed-element",
        name: "Delayed element",
        sourceFile: "scenario.ts",
        sourceType: "ts",
        url: "fixture://delayed-element",
        selector: "#submit",
        timeoutMs: 1000,
      });

      expect(invalid.status).toBe("failed");
      expect(invalid.selectorExistsAfterRun).toBe(false);
      expect(delayedFirst.status).toBe("failed");
      expect(delayedRetry.status).toBe("passed");
      expect(delayedRetry.selectorExistsAfterRun).toBe(true);
    } finally {
      await engine.close();
      await rm(artifactsDir, { recursive: true, force: true });
    }
  }, 20000);
});
