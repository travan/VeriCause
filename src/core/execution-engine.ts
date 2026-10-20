import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  Browser,
  BrowserContext,
  chromium,
  Page,
} from "playwright";

import { ensureDir } from "./fs";
import { ExecutionResult, ScenarioDefinition } from "./types";

const CONTEXT_POOL_MAX_SIZE = 5;

export class PlaywrightExecutionEngine {
  private browserPromise: Promise<Browser> | null = null;
  private readonly contextPool: BrowserContext[] = [];

  constructor(
    private readonly artifactsDir: string,
    private readonly fixturesDir: string,
    private readonly traceEnabled = false,
    private readonly successScreenshotEnabled = false,
  ) {}

  async runFirstAttempt(scenario: ScenarioDefinition): Promise<ExecutionResult> {
    return this.runAttempt(scenario, "first_run");
  }

  async retry(scenario: ScenarioDefinition): Promise<ExecutionResult> {
    return this.runAttempt(scenario, "retry_run");
  }

  async close(): Promise<void> {
    await Promise.all(
      this.contextPool.splice(0).map((ctx) => ctx.close().catch(() => undefined)),
    );

    if (!this.browserPromise) {
      return;
    }

    const browser = await this.browserPromise.catch(() => null);
    this.browserPromise = null;

    await browser?.close().catch(() => undefined);
  }

  private async acquireContext(): Promise<BrowserContext> {
    const pooled = this.contextPool.pop();
    if (pooled) {
      return pooled;
    }
    const browser = await this.getBrowser();
    return browser.newContext();
  }

  private async releaseContext(context: BrowserContext): Promise<void> {
    if (this.contextPool.length < CONTEXT_POOL_MAX_SIZE) {
      this.contextPool.push(context);
    } else {
      await context.close().catch(() => undefined);
    }
  }

  private async runAttempt(
    scenario: ScenarioDefinition,
    phase: "first_run" | "retry_run",
  ): Promise<ExecutionResult> {
    const runId = `${scenario.id}-${phase}-${Date.now()}`;
    const startedAt = Date.now();
    const timingMs: ExecutionResult["timingMs"] = {};

    const browserStart = Date.now();
    await this.getBrowser();
    timingMs.getBrowser = Date.now() - browserStart;

    const contextStart = Date.now();
    const context = await this.acquireContext();
    timingMs.newContext = Date.now() - contextStart;

    const page = await context.newPage();
    const runDir = join(this.artifactsDir, "runs", scenario.id, runId);
    const screenshotPath = join(runDir, "screenshot.png");
    const tracePath = join(runDir, "trace.zip");
    const targetUrl = this.resolveScenarioUrl(scenario, phase);
    const navigation: NonNullable<ExecutionResult["navigation"]> = {
      succeeded: false,
      targetMatched: false,
      requestedUrl: targetUrl,
    };

    await ensureDir(runDir);
    const prepareStart = Date.now();
    await this.preparePage(page);
    timingMs.preparePage = Date.now() - prepareStart;

    if (this.traceEnabled) {
      await context.tracing.start({ screenshots: true, snapshots: true });
    }

    try {
      const gotoStart = Date.now();
      const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      timingMs.goto = Date.now() - gotoStart;
      navigation.httpStatus = response?.status();
      navigation.finalUrl = page.url();
      navigation.succeeded = response ? response.ok() : targetUrl.startsWith("file:");
      navigation.targetMatched = this.matchesTargetUrl(targetUrl, navigation.finalUrl);
      if (!navigation.succeeded || !navigation.targetMatched) {
        throw new Error("Target page could not be verified after navigation.");
      }

      const target = page.locator(scenario.selector).first();
      const waitStart = Date.now();
      await target.waitFor({
        state: "visible",
        timeout: scenario.timeoutMs ?? 1000,
      });
      timingMs.waitFor = Date.now() - waitStart;
      this.updateNavigation(page, navigation);
      if (!navigation.targetMatched) {
        throw new Error("Target page changed before the interaction.");
      }

      const clickStart = Date.now();
      await target.click({
        timeout: scenario.timeoutMs ?? 1000,
      });
      timingMs.click = Date.now() - clickStart;

      const observeStart = Date.now();
      const observation = await this.observePage(page, scenario);
      timingMs.observe = Date.now() - observeStart;
      this.updateNavigation(page, navigation);

      if (this.successScreenshotEnabled) {
        const screenshotStart = Date.now();
        await page.screenshot({ path: screenshotPath, fullPage: true });
        timingMs.screenshot = Date.now() - screenshotStart;
      }

      return {
        scenarioId: scenario.id,
        runId,
        phase,
        status: "passed",
        navigation,
        durationMs: Date.now() - startedAt,
        screenshotPath: this.successScreenshotEnabled ? screenshotPath : undefined,
        tracePath: this.traceEnabled ? tracePath : undefined,
        selectorExistsAfterRun: observation.selectorExists,
        statusTextAfterRun: observation.statusText,
        timingMs,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const observeStart = Date.now();
      const observation = await this.observePage(page, scenario).catch(() => ({
        selectorExists: undefined,
        statusText: undefined,
      }));
      timingMs.observe = Date.now() - observeStart;
      this.updateNavigation(page, navigation);

      const screenshotStart = Date.now();
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      timingMs.screenshot = Date.now() - screenshotStart;

      return {
        scenarioId: scenario.id,
        runId,
        phase,
        status: "failed",
        navigation,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        screenshotPath,
        tracePath: this.traceEnabled ? tracePath : undefined,
        selectorExistsAfterRun: observation.selectorExists,
        statusTextAfterRun: observation.statusText,
        timingMs,
        timestamp: new Date().toISOString(),
      };
    } finally {
      if (this.traceEnabled) {
        await context.tracing.stop({ path: tracePath }).catch(() => undefined);
      }
      await this.releaseContext(context);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true });
    }

    return this.browserPromise;
  }

  private matchesTargetUrl(requested: string, actual: string): boolean {
    const normalize = (value: string) => {
      const url = new URL(value);
      url.hash = "";
      url.searchParams.delete("phase");
      return url.href;
    };
    return normalize(requested) === normalize(actual);
  }

  private updateNavigation(page: Page, navigation: NonNullable<ExecutionResult["navigation"]>): void {
    navigation.finalUrl = page.url();
    navigation.targetMatched = navigation.targetMatched &&
      this.matchesTargetUrl(navigation.requestedUrl, navigation.finalUrl);
  }

  private async preparePage(page: Page): Promise<void> {
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => undefined));
    page.on("popup", (popup) => popup.close().catch(() => undefined));
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
        return route.abort();
      }
      return route.continue();
    });
  }

  private async observePage(
    page: Page,
    scenario: ScenarioDefinition,
  ): Promise<{ selectorExists: boolean; statusText?: string }> {
    const selectorExists = (await page.locator(scenario.selector).count()) > 0;
    const statusLocator = page.locator("#status");
    const statusCount = await statusLocator.count();
    const statusText = statusCount > 0
      ? await statusLocator.first().textContent({ timeout: 200 }).catch(() => null)
      : null;

    return {
      selectorExists,
      statusText: statusText ?? undefined,
    };
  }

  private resolveScenarioUrl(
    scenario: ScenarioDefinition,
    phase: "first_run" | "retry_run",
  ): string {
    if (scenario.url.startsWith("fixture://")) {
      const fixtureName = scenario.url.replace("fixture://", "");
      const fileUrl = pathToFileURL(join(this.fixturesDir, `${fixtureName}.html`));
      fileUrl.searchParams.set("phase", phase);
      return fileUrl.toString();
    }

    const targetUrl = new URL(scenario.url);
    targetUrl.searchParams.set("phase", phase);
    return targetUrl.toString();
  }
}
