import matter from "gray-matter";
import { createRequire } from "node:module";
import { basename, dirname, extname, resolve } from "node:path";
import ts from "typescript";
import vm from "node:vm";

import { readTextFile, walkFiles } from "./fs";
import { InlineScenarioInputSchema, ScenarioDefinitionSchema } from "./schemas";
import {
  InlineScenarioInput,
  ScenarioDefinition,
  ScenarioSourceType,
} from "./types";

const SUPPORTED_EXTENSIONS = new Set([".md", ".ts", ".js"]);

export class ScenarioLoader {
  private _scenariosCache: ScenarioDefinition[] | null = null;
  private readonly _transpileCache = new Map<string, string>();

  constructor(private readonly scenarioDir: string) {}

  async discoverFiles(): Promise<string[]> {
    const files = await walkFiles(this.scenarioDir);

    return files
      .filter(
        (file) =>
          SUPPORTED_EXTENSIONS.has(extname(file)) && !file.endsWith(".d.ts"),
      )
      .sort();
  }

  async discoverScenarios(): Promise<ScenarioDefinition[]> {
    if (this._scenariosCache) {
      return this._scenariosCache;
    }
    const files = await this.discoverFiles();
    this._scenariosCache = await Promise.all(files.map((file) => this.loadFromFile(file)));
    return this._scenariosCache;
  }

  clearCache(): void {
    this._scenariosCache = null;
  }

  async loadById(id: string): Promise<ScenarioDefinition | null> {
    const scenarios = await this.discoverScenarios();
    return scenarios.find((scenario) => scenario.id === id) ?? null;
  }

  async loadFromFile(filePath: string): Promise<ScenarioDefinition> {
    const absolutePath = resolve(filePath);
    const extension = extname(absolutePath);

    if (extension === ".md") {
      return this.loadMarkdownScenario(absolutePath);
    }

    if (extension === ".js") {
      return this.loadJavaScriptScenario(absolutePath);
    }

    if (extension === ".ts") {
      return this.loadTypeScriptScenario(absolutePath);
    }

    throw new Error(`Unsupported scenario file: ${absolutePath}`);
  }

  loadInline(input: InlineScenarioInput): ScenarioDefinition {
    const parsed = InlineScenarioInputSchema.parse(input);
    const id = parsed.id ?? `http-${Date.now()}`;

    return ScenarioDefinitionSchema.parse({
      id,
      name: parsed.name ?? id,
      sourceFile: "http-request",
      sourceType: "http",
      url: parsed.url,
      selector: parsed.selector,
      expectedMode: parsed.expectedMode,
      timeoutMs: parsed.timeoutMs,
    });
  }

  private async loadMarkdownScenario(filePath: string): Promise<ScenarioDefinition> {
    const raw = await readTextFile(filePath);
    const parsed = matter(raw);
    const frontmatter = parsed.data as Partial<InlineScenarioInput>;
    const id = frontmatter.id ?? basename(filePath, ".md");

    return ScenarioDefinitionSchema.parse({
      id,
      name: frontmatter.name ?? id,
      sourceFile: filePath,
      sourceType: "md",
      url: frontmatter.url,
      selector: frontmatter.selector,
      expectedMode: frontmatter.expectedMode,
      timeoutMs: frontmatter.timeoutMs,
    });
  }

  private async loadJavaScriptScenario(filePath: string): Promise<ScenarioDefinition> {
    const localRequire = createRequire(filePath);
    const resolvedPath = localRequire.resolve(filePath);
    delete require.cache[resolvedPath];
    const scenarioModule = localRequire(filePath) as { default?: InlineScenarioInput };

    if (!scenarioModule.default) {
      throw new Error(`Scenario module '${filePath}' must export a default object.`);
    }

    return this.normalizeModuleScenario(filePath, "js", scenarioModule.default);
  }

  private async loadTypeScriptScenario(filePath: string): Promise<ScenarioDefinition> {
    const raw = await readTextFile(filePath);
    let outputText = this._transpileCache.get(filePath);

    if (!outputText) {
      const transpiled = ts.transpileModule(raw, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: filePath,
      });
      outputText = transpiled.outputText;
      this._transpileCache.set(filePath, outputText);
    }

    const localRequire = createRequire(filePath);
    const module = { exports: {} as { default?: InlineScenarioInput } };
    const wrapper = `(function (exports, require, module, __filename, __dirname) { ${outputText}\n})`;
    const script = new vm.Script(wrapper, { filename: filePath });
    const execute = script.runInThisContext() as (
      exports: object,
      requireFn: NodeRequire,
      moduleRef: { exports: { default?: InlineScenarioInput } },
      filename: string,
      dirname: string,
    ) => void;

    execute(module.exports, localRequire, module, filePath, dirname(filePath));

    if (!module.exports.default) {
      throw new Error(`Scenario module '${filePath}' must export a default object.`);
    }

    return this.normalizeModuleScenario(filePath, "ts", module.exports.default);
  }

  private normalizeModuleScenario(
    filePath: string,
    sourceType: ScenarioSourceType,
    input: InlineScenarioInput,
  ): ScenarioDefinition {
    const parsed = InlineScenarioInputSchema.parse(input);
    const id = parsed.id ?? basename(filePath, extname(filePath));

    return ScenarioDefinitionSchema.parse({
      id,
      name: parsed.name ?? id,
      sourceFile: filePath,
      sourceType,
      url: parsed.url,
      selector: parsed.selector,
      expectedMode: parsed.expectedMode,
      timeoutMs: parsed.timeoutMs,
    });
  }
}
