import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { ScenarioLoader } from "../../src/core/scenario-loader";

describe("ScenarioLoader", () => {
  const scenarioDir = resolve(process.cwd(), "scenarios");

  it("discovers markdown and module scenarios", async () => {
    const loader = new ScenarioLoader(scenarioDir);

    const files = await loader.discoverFiles();

    expect(files.map((file) => file.split("/").pop())).toEqual([
      "delayed-element.ts",
      "invalid-selector.md",
      "loose-element.ts",
    ]);
  });

  it("loads markdown scenario metadata", async () => {
    const loader = new ScenarioLoader(scenarioDir);

    const scenario = await loader.loadFromFile(resolve(scenarioDir, "invalid-selector.md"));

    expect(scenario.id).toBe("invalid-selector");
    expect(scenario.sourceType).toBe("md");
    expect(scenario.url).toBe("fixture://invalid-selector");
    expect(scenario.selector).toBe("#wrong-button");
  });

  it("uses markdown filename and id as fallbacks", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "scenario-loader-md-"));

    try {
      const file = resolve(root, "fallback.md");
      await writeFile(file, "---\nurl: https://example.com\nselector: \"#item\"\n---\n", "utf8");
      const loader = new ScenarioLoader(root);

      const scenario = await loader.loadFromFile(file);

      expect(scenario.id).toBe("fallback");
      expect(scenario.name).toBe("fallback");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("loads TypeScript scenario modules", async () => {
    const loader = new ScenarioLoader(scenarioDir);

    const scenario = await loader.loadFromFile(resolve(scenarioDir, "delayed-element.ts"));

    expect(scenario.id).toBe("delayed-element");
    expect(scenario.sourceType).toBe("ts");
    expect(scenario.expectedMode).toBe("flaky");
  });

  it("loads JavaScript scenario modules", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "scenario-loader-js-"));

    try {
      const file = resolve(root, "sample.js");
      await writeFile(file, "module.exports.default = { url: 'https://example.com', selector: '#item' };", "utf8");
      const loader = new ScenarioLoader(root);

      const scenario = await loader.loadFromFile(file);

      expect(scenario.sourceType).toBe("js");
      expect(scenario.id).toBe("sample");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("normalizes inline scenarios", () => {
    const loader = new ScenarioLoader(scenarioDir);

    const scenario = loader.loadInline({
      url: "fixture://invalid-selector",
      selector: "#missing",
      expectedMode: "deterministic_fail",
      timeoutMs: 1000,
    });

    expect(scenario.sourceType).toBe("http");
    expect(scenario.id).toMatch(/^http-/);
  });

  it("returns null when loadById cannot find a scenario", async () => {
    const loader = new ScenarioLoader(scenarioDir);
    await expect(loader.loadById("missing")).resolves.toBeNull();
  });

  it("rejects unsupported files and modules without a default export", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "scenario-loader-errors-"));

    try {
      const badTxt = resolve(root, "bad.txt");
      const badJs = resolve(root, "bad.js");
      const badTs = resolve(root, "bad.ts");
      await writeFile(badTxt, "nope", "utf8");
      await writeFile(badJs, "module.exports = {};", "utf8");
      await writeFile(badTs, "export const foo = 1;", "utf8");

      const loader = new ScenarioLoader(root);

      await expect(loader.loadFromFile(badTxt)).rejects.toThrow("Unsupported scenario file");
      await expect(loader.loadFromFile(badJs)).rejects.toThrow("must export a default object");
      await expect(loader.loadFromFile(badTs)).rejects.toThrow("must export a default object");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("caches scenario discovery and returns the same reference on repeated calls", async () => {
    const loader = new ScenarioLoader(scenarioDir);

    const first = await loader.discoverScenarios();
    const second = await loader.discoverScenarios();

    expect(second).toBe(first);
  });

  it("invalidates the cache after clearCache()", async () => {
    const loader = new ScenarioLoader(scenarioDir);

    const first = await loader.discoverScenarios();
    loader.clearCache();
    const second = await loader.discoverScenarios();

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("caches TypeScript transpilation so the file is only transpiled once", async () => {
    const loader = new ScenarioLoader(scenarioDir);
    const tsFile = resolve(scenarioDir, "delayed-element.ts");

    await loader.loadFromFile(tsFile);
    // A second load of the same file should hit the cache
    await loader.loadFromFile(tsFile);

    // Cache has exactly one entry (the file was transpiled once, not twice)
    expect((loader as any)._transpileCache.size).toBe(1);
    expect((loader as any)._transpileCache.has(tsFile)).toBe(true);
  });
});
