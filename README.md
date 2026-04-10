# ai-reliability-layer

Validates AI failure analysis against real runtime evidence. Run a scenario, let an AI diagnose the failure, then re-run it — the library cross-checks the AI's prediction against what actually happened in the browser and returns a structured verdict.

## How it works

```
Scenario (selector + URL)
  │
  ├─ First attempt (Playwright) ──► AI analysis (GPT / Claude / etc.)
  │                                        │
  └─ Retry attempt (Playwright) ──────────┘
                                           │
                       ReliabilityEvaluator: compare prediction vs runtime evidence
                                           │
                                    AnalysisReport + Verdict
```

A **verdict** can be:

| `action` | Meaning |
|---|---|
| `accept_ai` | Runtime evidence confirms the AI's prediction |
| `override_ai` | Evidence contradicts the prediction |
| `needs_more_evidence` | Inconclusive — actual cause is `unknown` |

---

## Requirements

- Node.js ≥ 18
- A Playwright-supported browser (Chromium is launched automatically)
- An AI provider API key (or use the built-in `mock` provider for testing)

---

## Installation

```bash
npm install ai-reliability-layer
npx playwright install chromium   # first time only
```

---

## Quick start

### 1. Create a scenario file

**TypeScript** (`scenarios/login-button.ts`):
```ts
export default {
  id: "login-button",
  name: "Login button click",
  url: "https://your-app.com/login",
  selector: "#login-btn",
  expectedMode: "deterministic_fail",   // "deterministic_fail" | "flaky" | "loose_element"
  timeoutMs: 3000,
};
```

**Markdown with YAML frontmatter** (`scenarios/login-button.md`):
```yaml
---
id: login-button
name: Login button click
url: https://your-app.com/login
selector: "#login-btn"
expectedMode: deterministic_fail
timeoutMs: 3000
---
```

### 2. Set your AI provider

```bash
# OpenAI / OpenAI-compatible (Grok, Gemini, DeepSeek, Ollama…)
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_API_KEY=sk-...

# Or Anthropic / Claude
export ANTHROPIC_API_KEY=sk-ant-...

# Default provider to use
export AI_PROVIDER=openai          # or: claude, grok, gemini, deepseek, ollama, mock
export AI_MODEL=gpt-4o
```

### 3. Run via CLI

```bash
# Analyse a single scenario by ID
npx ai-reliability-layer analyze --scenario login-button

# Analyse all scenarios in ./scenarios/
npx ai-reliability-layer analyze --all

# Run in async (non-blocking) mode and stream progress
npx ai-reliability-layer analyze --all --async

# Analyse a specific file
npx ai-reliability-layer analyze --file ./scenarios/login-button.ts

# Override AI provider/model for this run only
npx ai-reliability-layer analyze --scenario login-button --provider claude --model claude-3-7-sonnet

# Discover all scenarios (returns JSON)
npx ai-reliability-layer discover
```

### 4. Run via Node.js API

```ts
import { createCoreRuntime } from "ai-reliability-layer";

const runtime = createCoreRuntime();

try {
  // Analyse one scenario by ID
  const report = await runtime.analysisService.run({
    scenarioId: "login-button",
  });
  console.log(report.verdict?.action);        // "accept_ai" | "override_ai" | "needs_more_evidence"
  console.log(report.verdict?.actualCause);   // "invalid_selector" | "timeout" | "flaky_timing" | "loose_element" | "unknown"

  // Analyse all scenarios
  const reports = await runtime.analysisService.run({ runAll: true });

  // Inline — no file needed
  const inlineReport = await runtime.analysisService.run({
    scenario: {
      url: "https://your-app.com",
      selector: "#submit",
      expectedMode: "flaky",
    },
  });
} finally {
  await runtime.close();
}
```

### 5. Start the HTTP server

```bash
# Development (watch mode)
npm run start:server:dev

# Production (build first)
npm run build
npm run start:server
```

Default port is `3000`. Override with `PORT=8080 npm run start:server`.

---

## HTTP API

All requests and responses use `application/json`.

### POST /analysis/run — synchronous

```bash
curl -X POST http://localhost:3000/analysis/run \
  -H "content-type: application/json" \
  -H "x-ai-provider: mock" \
  -H "x-ai-model: gpt-5.4" \
  --data '{"scenarioId":"invalid-selector"}'
```

Request body:

```jsonc
{
  "scenarioId": "login-button",           // run by ID
  // or "filePath": "./scenarios/x.ts"    // run from file (must be inside project root)
  // or "runAll": true                    // run all discovered scenarios
  // or "scenario": { "url": "https://...", "selector": "#x" }  // inline, no file needed
  "ai": { "provider": "claude", "model": "claude-3-7-sonnet" }  // optional — also accepted as headers
}
```

Response:

```jsonc
{
  "status": "completed",
  "result": {
    "reportId": "login-button-1744310400000",
    "scenario": { "id": "login-button", "selector": "#login-btn" },
    "firstRun":  { "status": "failed", "errorMessage": "Timeout 3000ms exceeded." },
    "retryRun":  { "status": "failed" },
    "aiDiagnosis": { "predictedCause": "invalid_selector", "confidence": 0.91, "summary": "..." },
    "validationEvidence": { "retryStatus": "failed", "selectorExists": false, "historicalPattern": "stable_fail", "failureSignature": "timeout" },
    "verdict": { "actualCause": "invalid_selector", "aiCorrect": true, "action": "accept_ai", "explanation": "..." },
    "createdAt": "2026-04-10T00:00:00.000Z"
  }
}
```

AI provider/model can be passed as HTTP headers instead of (or to override) the request body:

| Header | Body equivalent |
|---|---|
| `x-ai-provider` | `ai.provider` |
| `x-ai-model` | `ai.model` |

### POST /analysis/runs — async

Returns immediately with a `runId`. Poll the status endpoint to track progress.

### GET /analysis/runs/:runId

```jsonc
{
  "run": {
    "runId": "run-1744310400000",
    "status": "running",   // "queued" | "running" | "completed" | "failed"
    "total": 3, "completed": 1, "passed": 1, "failed": 0, "pending": 2
  }
}
```

### GET /analysis/runs/:runId/results

Full run object + array of all `AnalysisReport` objects.

### GET /analysis/reports/:reportId

Single report by ID.

### GET /scenarios

List all discovered scenarios.

---

## Scenario reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | No | Stable identifier (alphanumeric, hyphens, underscores). Defaults to filename without extension. |
| `name` | `string` | No | Human-readable label. |
| `url` | `string` | **Yes** | Target URL. Must use `http:`, `https:`, or `fixture:` protocol. |
| `selector` | `string` | **Yes** | CSS / XPath selector Playwright will wait for and click. |
| `expectedMode` | `string` | No | `"deterministic_fail"`, `"flaky"`, or `"loose_element"`. Used as a hint in the AI prompt. |
| `timeoutMs` | `number` | No | Per-operation timeout in milliseconds. Default: `1000`. |

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `mock` | Default AI provider for every run. |
| `AI_MODEL` | `mock-reliability-v1` | Default model name. |
| `OPENAI_BASE_URL` | — | Base URL for OpenAI or compatible providers. |
| `OPENAI_API_KEY` | — | API key for OpenAI or compatible providers. |
| `ANTHROPIC_API_KEY` | — | API key for Anthropic. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com/v1` | Anthropic base URL override. |
| `AI_<PROVIDER>_BASE_URL` | — | Per-provider base URL (e.g. `AI_GROK_BASE_URL`). |
| `AI_<PROVIDER>_API_KEY` | — | Per-provider API key (e.g. `AI_GROK_API_KEY`). |
| `SCENARIO_DIR` | `scenarios` | Directory to scan for scenario files. |
| `BASE_OUTPUT_DIR` | `artifacts` | Root directory for reports, runs, and screenshots. |
| `RUN_CONCURRENCY` | `cpus/2` (max 2) | Number of scenarios that run in parallel. |
| `ENABLE_TRACE` | `false` | Save Playwright trace files on every run. |
| `ENABLE_SUCCESS_SCREENSHOT` | `false` | Save screenshots on passing runs too. |
| `PORT` | `3000` | HTTP server port. |

### Supported AI providers

| Name | Protocol | Required environment variables |
|---|---|---|
| `mock` | built-in | none |
| `openai` | OpenAI | `OPENAI_BASE_URL`, `OPENAI_API_KEY` |
| `claude` / `anthropic` | Anthropic Messages | `ANTHROPIC_API_KEY` |
| `grok` | OpenAI-compatible | `AI_GROK_BASE_URL`, `AI_GROK_API_KEY` |
| `gemini` | OpenAI-compatible | `AI_GEMINI_BASE_URL`, `AI_GEMINI_API_KEY` |
| `deepseek` | OpenAI-compatible | `AI_DEEPSEEK_BASE_URL`, `AI_DEEPSEEK_API_KEY` |
| `ollama` | OpenAI-compatible | `AI_OLLAMA_BASE_URL`, `AI_OLLAMA_API_KEY` |
| `lmstudio` | OpenAI-compatible | `AI_LMSTUDIO_BASE_URL`, `AI_LMSTUDIO_API_KEY` |
| `local` | OpenAI-compatible | `AI_LOCAL_BASE_URL`, `AI_LOCAL_API_KEY` |

Any other OpenAI-compatible provider can be added without code changes — just set `AI_<NAME>_BASE_URL` and `AI_<NAME>_API_KEY`.

---

## Output structure

```
artifacts/
  reports/                        # one JSON file per AnalysisReport
  jobs/                           # one JSON file per async AnalysisRun
  runs/
    <scenario-id>/
      <run-id>/
        screenshot.png            # captured on failure (always), on pass (if ENABLE_SUCCESS_SCREENSHOT=true)
        trace.zip                 # if ENABLE_TRACE=true
```

---

## Development

```bash
npm install
npm run check          # type-check (no emit)
npm run build          # compile to dist/
npm test               # unit + integration tests
npm run test:unit
npm run test:integration
npm run cli -- discover
npm run cli -- analyze --all
npm run start:server:dev
```

---

## Security

- **`provider`** is validated as lowercase alphanumeric (hyphens and underscores allowed, max 63 chars). Uppercase, spaces, and control characters are rejected.
- **`model`** must not contain control characters (newlines, carriage returns, etc.) and is capped at 200 chars.
- **`scenario.url`** is restricted to `http:`, `https:`, and `fixture:` protocols. `file://`, `javascript:`, and other protocols are rejected to prevent SSRF.
- **`filePath`** (CLI `--file` and API body) is resolved against `process.cwd()` and must remain inside the project directory. Paths like `../../etc/passwd` are rejected.
- **`reportId` / `runId`** are validated against `[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}` before being used as file names on disk.

---

## License

MIT
