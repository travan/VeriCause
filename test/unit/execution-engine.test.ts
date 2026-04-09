const launchMock = jest.fn();

jest.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
  },
}));

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PlaywrightExecutionEngine } from "../../src/core/execution-engine";

describe("PlaywrightExecutionEngine internals", () => {
  beforeEach(() => {
    launchMock.mockReset();
  });

  it("returns early when close is called without an open browser", async () => {
    const engine = new PlaywrightExecutionEngine("artifacts", "fixtures");
    await expect(engine.close()).resolves.toBeUndefined();
  });

  it("prepares the page and observes status values", async () => {
    const page: any = {
      on: jest.fn(),
      route: jest.fn(async (_pattern, handler) => {
        const imageRoute = {
          request: () => ({ resourceType: () => "image" }),
          abort: jest.fn(),
          continue: jest.fn(),
        };
        const scriptRoute = {
          request: () => ({ resourceType: () => "script" }),
          abort: jest.fn(),
          continue: jest.fn(),
        };

        await handler(imageRoute);
        await handler(scriptRoute);

        expect(imageRoute.abort).toHaveBeenCalled();
        expect(scriptRoute.continue).toHaveBeenCalled();
      }),
      locator: jest.fn((selector: string) => {
        if (selector === "#status") {
          return {
            count: jest.fn(async () => 1),
            first: jest.fn(() => ({
              textContent: jest.fn(async () => "clicked"),
            })),
          };
        }

        return {
          count: jest.fn(async () => 1),
        };
      }),
    };
    const engine = new PlaywrightExecutionEngine("artifacts", "fixtures");

    await (engine as any).preparePage(page);
    const observation = await (engine as any).observePage(page, {
      id: "id",
      name: "name",
      sourceFile: "file",
      sourceType: "md",
      url: "fixture://invalid-selector",
      selector: "#item",
    });

    expect(page.on).toHaveBeenCalledTimes(2);
    expect(page.route).toHaveBeenCalled();
    expect(observation).toEqual({
      selectorExists: true,
      statusText: "clicked",
    });
  });

  it("handles missing status text without waiting", async () => {
    const page = {
      locator: jest.fn((selector: string) => ({
        count: jest.fn(async () => (selector === "#status" ? 0 : 1)),
        first: jest.fn(() => ({
          textContent: jest.fn(async () => "ignored"),
        })),
      })),
    };
    const engine = new PlaywrightExecutionEngine("artifacts", "fixtures");

    const observation = await (engine as any).observePage(page, {
      id: "id",
      name: "name",
      sourceFile: "file",
      sourceType: "md",
      url: "fixture://invalid-selector",
      selector: "#item",
    });

    expect(observation).toEqual({
      selectorExists: true,
      statusText: undefined,
    });
  });

  it("resolves fixture and remote URLs", () => {
    const engine = new PlaywrightExecutionEngine(
      "artifacts",
      resolve(process.cwd(), "fixtures/pages"),
    );

    expect((engine as any).resolveScenarioUrl({
      id: "id",
      name: "name",
      sourceFile: "file",
      sourceType: "md",
      url: "fixture://invalid-selector",
      selector: "#item",
    }, "first_run")).toContain("invalid-selector.html?phase=first_run");

    expect((engine as any).resolveScenarioUrl({
      id: "id",
      name: "name",
      sourceFile: "file",
      sourceType: "md",
      url: "https://example.com/path",
      selector: "#item",
    }, "retry_run")).toBe("https://example.com/path?phase=retry_run");
  });

  it("writes success screenshots and traces when enabled using mocked Playwright", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "ai-reliability-success-"));
    const screenshot = jest.fn(async () => undefined);
    const page: any = {
      goto: jest.fn(async () => undefined),
      screenshot,
      on: jest.fn(),
      route: jest.fn(async () => undefined),
    };
    page.locator = jest.fn((selector: string) => {
      if (selector === "#status") {
        return {
          count: jest.fn(async () => 1),
          first: jest.fn(() => ({
            textContent: jest.fn(async () => "clicked"),
          })),
        };
      }

      return {
        first: jest.fn(() => ({
          waitFor: jest.fn(async () => undefined),
          click: jest.fn(async () => undefined),
        })),
        count: jest.fn(async () => 1),
      };
    });

    const tracing = {
      start: jest.fn(async () => undefined),
      stop: jest.fn(async () => undefined),
    };
    const context = {
      newPage: jest.fn(async () => page),
      close: jest.fn(async () => undefined),
      tracing,
    };
    const browser = {
      newContext: jest.fn(async () => context),
      close: jest.fn(async () => undefined),
    };
    launchMock.mockResolvedValue(browser);

    const engine = new PlaywrightExecutionEngine(
      artifactsDir,
      resolve(process.cwd(), "fixtures/pages"),
      true,
      true,
    );

    try {
      const result = await engine.retry({
        id: "delayed-element",
        name: "Delayed element",
        sourceFile: "file",
        sourceType: "ts",
        url: "fixture://delayed-element",
        selector: "#submit",
        timeoutMs: 1000,
      });

      expect(result.status).toBe("passed");
      expect(result.screenshotPath).toContain("screenshot.png");
      expect(result.tracePath).toContain("trace.zip");
      expect(tracing.start).toHaveBeenCalled();
      expect(tracing.stop).toHaveBeenCalled();
      expect(screenshot).toHaveBeenCalled();

      await engine.close();
      expect(browser.close).toHaveBeenCalled();
    } finally {
      await rm(artifactsDir, { recursive: true, force: true });
    }
  });

  it("returns failed attempts and tolerates observation read errors", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "ai-reliability-failure-"));
    const page: any = {
      goto: jest.fn(async () => undefined),
      screenshot: jest.fn(async () => undefined),
      on: jest.fn(),
      route: jest.fn(async () => undefined),
    };
    page.locator = jest.fn((selector: string) => {
      if (selector === "#status") {
        return {
          count: jest.fn(async () => 1),
          first: jest.fn(() => ({
            textContent: jest.fn(async () => {
              throw new Error("cannot read status");
            }),
          })),
        };
      }

      return {
        first: jest.fn(() => ({
          waitFor: jest.fn(async () => {
            throw new Error("wait failed");
          }),
          click: jest.fn(async () => undefined),
        })),
        count: jest.fn(async () => 1),
      };
    });

    const context = {
      newPage: jest.fn(async () => page),
      close: jest.fn(async () => undefined),
      tracing: {
        start: jest.fn(async () => undefined),
        stop: jest.fn(async () => undefined),
      },
    };
    const browser = {
      newContext: jest.fn(async () => context),
      close: jest.fn(async () => undefined),
    };
    launchMock.mockResolvedValue(browser);

    const engine = new PlaywrightExecutionEngine(
      artifactsDir,
      resolve(process.cwd(), "fixtures/pages"),
      false,
      false,
    );

    try {
      const result = await engine.runFirstAttempt({
        id: "broken",
        name: "Broken",
        sourceFile: "file",
        sourceType: "ts",
        url: "fixture://invalid-selector",
        selector: "#missing",
        timeoutMs: 1000,
      });

      expect(result.status).toBe("failed");
      expect(result.errorMessage).toContain("wait failed");
      expect(result.screenshotPath).toContain("screenshot.png");
      expect(result.statusTextAfterRun).toBeUndefined();
    } finally {
      await engine.close();
      await rm(artifactsDir, { recursive: true, force: true });
    }
  });

  it("reuses a pooled context across successive runs", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "ai-reliability-pool-"));
    const makePage = (): any => ({
      goto: jest.fn(async () => undefined),
      screenshot: jest.fn(async () => undefined),
      on: jest.fn(),
      route: jest.fn(async () => undefined),
      locator: jest.fn((selector: string) => {
        if (selector === "#status") {
          return { count: jest.fn(async () => 0) };
        }
        return {
          first: jest.fn(() => ({
            waitFor: jest.fn(async () => undefined),
            click: jest.fn(async () => undefined),
          })),
          count: jest.fn(async () => 1),
        };
      }),
    });

    const context = {
      newPage: jest.fn(async () => makePage()),
      close: jest.fn(async () => undefined),
      tracing: { start: jest.fn(), stop: jest.fn() },
    };
    const browser = {
      newContext: jest.fn(async () => context),
      close: jest.fn(async () => undefined),
    };
    launchMock.mockResolvedValue(browser);

    const scenario = {
      id: "delayed-element",
      name: "Delayed element",
      sourceFile: "file",
      sourceType: "ts" as const,
      url: "fixture://delayed-element",
      selector: "#submit",
      timeoutMs: 1000,
    };

    const engine = new PlaywrightExecutionEngine(
      artifactsDir,
      resolve(process.cwd(), "fixtures/pages"),
    );

    try {
      await engine.runFirstAttempt(scenario);
      await engine.retry(scenario);

      // newContext should be called only once; the second run reuses the pooled context
      expect(browser.newContext).toHaveBeenCalledTimes(1);
    } finally {
      await engine.close();
      await rm(artifactsDir, { recursive: true, force: true });
    }
  });

  it("drains the context pool when close() is called", async () => {
    const artifactsDir = await mkdtemp(join(tmpdir(), "ai-reliability-drain-"));
    const makePage = (): any => ({
      goto: jest.fn(async () => undefined),
      screenshot: jest.fn(async () => undefined),
      on: jest.fn(),
      route: jest.fn(async () => undefined),
      locator: jest.fn((selector: string) => {
        if (selector === "#status") return { count: jest.fn(async () => 0) };
        return {
          first: jest.fn(() => ({
            waitFor: jest.fn(async () => undefined),
            click: jest.fn(async () => undefined),
          })),
          count: jest.fn(async () => 1),
        };
      }),
    });

    const context = {
      newPage: jest.fn(async () => makePage()),
      close: jest.fn(async () => undefined),
      tracing: { start: jest.fn(), stop: jest.fn() },
    };
    const browser = {
      newContext: jest.fn(async () => context),
      close: jest.fn(async () => undefined),
    };
    launchMock.mockResolvedValue(browser);

    const engine = new PlaywrightExecutionEngine(
      artifactsDir,
      resolve(process.cwd(), "fixtures/pages"),
    );

    try {
      await engine.runFirstAttempt({
        id: "delayed-element",
        name: "Delayed element",
        sourceFile: "file",
        sourceType: "ts",
        url: "fixture://delayed-element",
        selector: "#submit",
        timeoutMs: 1000,
      });

      // context is returned to pool; close() should drain it
      await engine.close();

      expect(context.close).toHaveBeenCalled();
      expect(browser.close).toHaveBeenCalled();
    } finally {
      await rm(artifactsDir, { recursive: true, force: true });
    }
  });
});
