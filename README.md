# AI Reliability Runtime

**Check AI claims against runtime evidence before acting on them.**

An AI says a request succeeded. Your logs show HTTP 500. AI Reliability Runtime
compares the claim with the observation and returns `contradicted`, so your
application can choose to block the next action.

For developers building AI agents, browser automation, and evaluation pipelines.
Use it from **TypeScript, the CLI, or an HTTP API**.

[Try the demo](#try-it-now) · [Use your own evidence](#runtime-verification) ·
[Analyze browser failures](#browser-quick-start) · [Report an issue](https://github.com/travan/VeriCause/issues)

## Try it now

Requires Node.js 18 or newer. Run the built-in demo:

```bash
npx ai-reliability-runtime demo
```

No API key, account, or browser installation is needed. The demo uses synthetic
observations with the real verifier and default guardrail policy. After npm downloads
the package, the demo itself makes no network requests and writes no files.

The same claim — “The API returned HTTP 200” with 98% AI confidence — gets three
different outcomes:

```text
API returned 200         supported      -> allow
API returned 500         contradicted   -> block
No response evidence     inconclusive   -> escalate
```

These are policy decisions at **high** risk. Your application enforces the returned
action; the library does not automatically intercept or stop your agent.

Inspect the full claims, evidence references, and decision reasons:

```bash
npx ai-reliability-runtime demo --json
```

## What can you use it for?

| Your workflow | What the runtime provides |
|---|---|
| Verify an agent's claim about an API, shell command, database operation, or tool call | Compare structured claims with observations supplied by your application. |
| Investigate a failing browser interaction | Execute and retry a Playwright scenario, then compare the AI diagnosis with runtime evidence. |
| Decide whether a workflow should proceed | Map verdicts to `allow`, `block`, `retry`, or `escalate` using configurable policies. |
| Evaluate a model or prompt change | Measure against ground truth, apply quality gates, and compare saved evaluations. |

## Install in your project

```bash
npm install ai-reliability-runtime
```

For API, shell, database, and tool evidence, continue with the
[copyable SDK example](#runtime-verification). Chromium is only needed for browser
analysis:

```bash
npx playwright install chromium
```

## Browser quick start

### Configure an AI provider

The built-in `mock` provider is the default and requires no credentials. It is useful
for testing the pipeline; select a real provider to get model-generated diagnoses.
For OpenAI:

```bash
export AI_PROVIDER=openai
export AI_MODEL=gpt-4o
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_API_KEY=sk-...
```

For Anthropic, use `AI_PROVIDER=claude` or `AI_PROVIDER=anthropic` with
`ANTHROPIC_API_KEY`. See [Configuration](#configuration) for compatible providers.

For an already installed Ollama model, start the local Ollama server and set:

```bash
export AI_PROVIDER=ollama
export AI_MODEL=qwen3.5:9b  # use a model installed on your machine
export AI_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
export AI_OLLAMA_API_KEY=ollama
export AI_REQUEST_TIMEOUT_MS=120000
export AI_OLLAMA_REASONING_EFFORT=none
```

The API key above is a placeholder for a local server without authentication; the
adapter requires a non-empty value. Use the server's actual key if authentication is
enabled. Local models may need more time to load or generate a diagnosis. The timeout
applies per request attempt; network errors and timeouts are retried up to three times.
For models that support it, `AI_OLLAMA_REASONING_EFFORT=none` requests a response without
thinking, which can reduce latency for these short diagnoses. Omit it to use the
model's default. See [Ollama's compatibility documentation](https://docs.ollama.com/api/openai-compatibility)
for supported reasoning settings.

### Define a browser scenario

The scenario directory defaults to `scenarios`. A scenario can be a TypeScript,
JavaScript, or Markdown file.

Create the `scenarios` directory and save `scenarios/login-button.ts`. Replace the
example URL and selector with an application you can test:

```ts
export default {
  id: "login-button",
  name: "Login button click",
  url: "https://your-app.example/login",
  selector: "#login-btn",
  expectedMode: "deterministic_fail",
  timeoutMs: 3000,
};
```

Run it with the package CLI:

```bash
npx ai-reliability-runtime analyze --scenario login-button
```

The CLI writes JSON results to stdout. Discover available scenarios with:

```bash
npx ai-reliability-runtime discover
```

## TypeScript SDK

The package root exports `createCoreRuntime`:

```ts
import { createCoreRuntime } from "ai-reliability-runtime";

const runtime = createCoreRuntime();

try {
  const report = await runtime.analysisService.run({
    scenarioId: "login-button",
  });

  if (!Array.isArray(report)) {
    console.log(report.verdict?.action);
    console.log(report.coreVerdict?.status);
  }
} finally {
  await runtime.close();
}
```

`analysisService.run()` accepts one of these inputs:

| Input | Description |
|---|---|
| `scenarioId` | Analyze a discovered scenario by ID. |
| `filePath` | Analyze a scenario file inside the current project directory. |
| `scenario` | Analyze an inline scenario without creating a file. |
| `runAll: true` | Analyze every discovered scenario. Returns `AnalysisReport[]`. |

An inline scenario looks like this:

```ts
const report = await runtime.analysisService.run({
  scenario: {
    url: "https://your-app.example",
    selector: "#submit",
    expectedMode: "flaky",
  },
});
```

Each browser report may contain:

- `aiDiagnosis`: the provider's predicted cause and confidence;
- `validationEvidence`: retry and selector observations;
- `verdict`: compatibility verdict with `accept_ai`, `override_ai`, or
  `needs_more_evidence`;
- `claim`, `evidence`, and `coreVerdict`: normalized verification data; and
- `stageEvents`: pipeline timing and failure events.

## Runtime verification

Non-browser executors can submit evidence without giving the package authority to run
the underlying action. Supported targets are `api`, `shell`, `database`, and `tool`.
Claims support `equals`, `contains`, `one_of`, `gte`, and `lte`.

Save this complete example as `verify.cjs` and run `node verify.cjs` after installing
the package. Replace the example HTTP status with an observation from your own client.

```js
const { createCoreRuntime } = require("ai-reliability-runtime");

async function main() {
  const runtime = createCoreRuntime();
  try {
    const result = runtime.runtimeVerificationService.verify({
      target: "api",
      claim: {
        id: "api-status",
        subject: "api",
        predicate: "status_code",
        operator: "equals",
        expected: 200,
        confidence: 0.98,
        rationale: "The AI claims the endpoint responded with HTTP 200.",
        source: "ai",
      },
      evidence: {
        items: [{
          id: "response-1",
          type: "api.status_code",
          value: 500,
          source: "checkout-client",
          observedAt: new Date().toISOString(),
        }],
      },
    });

    console.log(result.coreVerdict.status); // contradicted
    const decision = await runtime.guardrailService.decideVerdict(
      result.coreVerdict,
      "high",
    );
    console.log(decision.action); // block
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

The decision is saved under `artifacts/guardrail-decisions/`. Verification compares
supplied data; it does not make an HTTP request or execute the underlying action.

The normalized verdict is one of `supported`, `contradicted`, or `inconclusive`.
Evidence is matched by type `<claim.subject>.<claim.predicate>` and, when supplied,
`claim.executionId`. The default freshness window is **5 minutes**; set
`claim.maxEvidenceAgeMs` to a positive integer to use a different window.
Observations with invalid timestamps, future timestamps, or expired timestamps are
excluded. No eligible evidence returns `inconclusive`.

All eligible observations must have distinct IDs, belong to one execution, and agree
on their value. Conflicting values, repeated IDs, or mixed executions return
`inconclusive` regardless of input order. Set `executionId` on both the claim and its
observations when a bundle contains multiple executions. Conclusive results include
`validUntil`, derived from the oldest eligible observation's expiry.

## Guardrails

Apply a persisted analysis report to the default policy with the CLI:

```bash
npx ai-reliability-runtime guard --report <report-id> --risk high
```

The default policy is:

| Core verdict | Default action |
|---|---|
| `supported` | `allow` |
| `contradicted` | `block` |
| `inconclusive`, low or medium risk | `retry` |
| `inconclusive`, high risk | `escalate` |
| `inconclusive`, critical risk | `block` |

The SDK can apply the same policy to any `CoreVerdict`:

```ts
const decision = await runtime.guardrailService.decideVerdict(
  result.coreVerdict,
  "high",
);
```

Decisions are persisted under `artifacts/guardrail-decisions/` by default, with unique
IDs even when multiple decisions are created in the same millisecond.

### Bind permission to a specific action

Without `proposedAction`, the table above is a verdict-level policy recommendation.
To authorize an actual action, pass its unique `id` and `type`. The verified claim must
carry the same `actionScope`, and a supported verdict must have an unexpired
`validUntil`. A missing or mismatched scope returns `escalate` (`block` at critical
risk, or for a contradicted verdict), even if an inconclusive policy override says
`allow`. Expired or missing validity on a supported action claim also prevents `allow`.

Your application must choose the required precondition and bind it to the action.
An arbitrary model-generated `actionScope` is not authorization. Use a unique action
ID per intended execution and collect evidence from the relevant operation.

```ts
const proposedAction = {
  id: "publish-build-42",
  type: "build.publish",
  description: "Publish build 42 after its checks pass",
};
const verified = runtime.runtimeVerificationService.verify({
  target: "tool",
  claim: {
    id: "build-checks", subject: "tool", predicate: "checks_passed",
    expected: true, confidence: 1, source: "system",
    rationale: "This publication requires build 42 checks to pass.",
    executionId: "build-42-checks",
    maxEvidenceAgeMs: 60_000,
    actionScope: { id: proposedAction.id, type: proposedAction.type },
  },
  evidence: { items: [{
    id: "checks-result", type: "tool.checks_passed", value: true,
    source: "build-runner", executionId: "build-42-checks",
    observedAt: new Date().toISOString(),
  }] },
});
const permission = await runtime.guardrailService.decideVerdict(
  verified.coreVerdict, "high", proposedAction,
);
if (permission.action !== "allow") {
  throw new Error(`Publication withheld: ${permission.action}`);
}
// Invoke your application's publish operation here.
```

The `true` observation above is sample data: use your build runner's actual result and
observation time. This library returns a policy decision; your application enforces it.
Browser failure diagnoses have no action scope, so they cannot authorize an unrelated
action through `proposedAction`.

### Migration notes

Older observation files can now return `inconclusive` because their timestamps have
expired. Collect fresh observations for live decisions. For historical evaluation,
explicitly choose an appropriate age window and label the result as historical;
do not relabel historical evidence as newly observed or reuse it as live permission.

Custom browser executors must provide `navigation.succeeded` and
`navigation.targetMatched` on both attempts. The built-in executor records the
requested/final URLs and HTTP status, rejects HTTP errors and unexpected destinations,
and rechecks the URL before interaction and after observation. Missing navigation
proof makes the browser verdict `inconclusive`. Redirect to the intended destination
in your scenario configuration instead of treating a different page as the target.

## Evaluation

Evaluation datasets pair an analysis input with a known cause:

```json
[
  {
    "id": "invalid-selector-case",
    "input": { "scenarioId": "invalid-selector" },
    "groundTruth": {
      "value": "invalid_selector",
      "source": "fixture"
    }
  }
]
```

Run an evaluation and configure quality gates:

```bash
npx ai-reliability-runtime evaluate \
  --dataset ./evaluation/dataset.json \
  --min-claim-accuracy 0.95 \
  --min-verifier-accuracy 0.95 \
  --min-decision-accuracy 0.95 \
  --max-false-accept-rate 0.01 \
  --max-inconclusive-rate 0.05
```

Evaluation results include claim, verifier, and decision accuracy, false-accept and
false-override rates, inconclusive rate, average confidence, and Brier score. A failed
quality gate exits with code `2`.

Compare two saved evaluations to check for regressions:

```bash
npx ai-reliability-runtime compare --baseline <evaluation-id> --candidate <evaluation-id>
```

A comparison with a regression exits with code `2`.

## HTTP server

The server entry point is available from the `ai-reliability-runtime/server` export.
For a standalone process, install the package and start the compiled server from your
application's process manager after configuring the environment.

```bash
npm install ai-reliability-runtime
npx playwright install chromium
node -e 'require("ai-reliability-runtime/server").bootstrap()'
```

The server listens on port `3000` by default. Set `PORT` to override it.

| Method | Route | Description |
|---|---|---|
| `GET` | `/scenarios` | List discovered scenarios. |
| `POST` | `/analysis/run` | Run one analysis synchronously. |
| `POST` | `/analysis/runs` | Start an asynchronous analysis run. |
| `GET` | `/analysis/runs/:runId` | Read asynchronous run status. |
| `GET` | `/analysis/runs/:runId/results` | Read a run and its reports. |
| `GET` | `/analysis/reports/:reportId` | Read one analysis report. |
| `POST` | `/evaluation/run` | Run an evaluation dataset. |
| `GET` | `/evaluation/:evaluationId` | Read an evaluation report. |
| `POST` | `/evaluation/compare` | Compare two evaluations. |
| `POST` | `/verification/run` | Verify a claim and evidence bundle. |
| `POST` | `/guardrail/decide` | Create a guardrail decision. |
| `GET` | `/guardrail/decisions/:decisionId` | Read a guardrail decision. |

For analysis requests, send one of `scenarioId`, `filePath`, `scenario`, or `runAll`.
The provider and model can be sent as `ai.provider` and `ai.model`, or as the
`x-ai-provider` and `x-ai-model` headers.

```bash
curl -X POST http://localhost:3000/analysis/run \
  -H 'content-type: application/json' \
  -H 'x-ai-provider: mock' \
  --data '{"scenarioId":"login-button"}'
```

## CLI commands

```text
ai-reliability-runtime demo [--json]
ai-reliability-runtime discover
ai-reliability-runtime analyze --scenario <id>
ai-reliability-runtime analyze --file <path>
ai-reliability-runtime analyze --all [--async]
ai-reliability-runtime evaluate --dataset <path>
ai-reliability-runtime compare --baseline <id> --candidate <id>
ai-reliability-runtime guard --report <id> --risk <level>
ai-reliability-runtime verify --input <path>
```

Run `npx ai-reliability-runtime --help` for all command options.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `mock` | Default AI provider. |
| `AI_MODEL` | `mock-reliability-v1` | Default model name. |
| `AI_REQUEST_TIMEOUT_MS` | `30000` | AI request timeout per attempt, from 1 to 600000 milliseconds. |
| `AI_OLLAMA_REASONING_EFFORT` | unset | Optional Ollama `reasoning_effort`; `none` requests no thinking on supported models. |
| `OPENAI_BASE_URL` | unset | Base URL for `openai` or `openai-compatible`. |
| `OPENAI_API_KEY` | unset | API key for `openai` or `openai-compatible`. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com/v1` | Anthropic endpoint. |
| `ANTHROPIC_API_KEY` | unset | Anthropic API key. |
| `AI_<PROVIDER>_BASE_URL` | unset | Base URL for a registered provider. |
| `AI_<PROVIDER>_API_KEY` | unset | API key for a registered provider. |
| `SCENARIO_DIR` | `scenarios` | Directory containing scenario files. |
| `BASE_OUTPUT_DIR` | `artifacts` | Directory for reports and runtime artifacts. |
| `RUN_CONCURRENCY` | 1-2 | Parallel scenario limit. |
| `ENABLE_TRACE` | `false` | Save Playwright trace files. |
| `ENABLE_SUCCESS_SCREENSHOT` | `false` | Save screenshots for passing runs. |
| `PORT` | `3000` | HTTP server port. |

Registered providers are `mock`, `openai`, `openai-compatible`, `grok`, `qwen`,
`deepseek`, `ollama`, `lmstudio`, `local`, `gemini`, `anthropic`, and `claude`.

## Artifacts

By default, reports are written under the configured `BASE_OUTPUT_DIR`:

```text
artifacts/
  reports/
  evaluations/
  guardrail-decisions/
  jobs/
  runs/
```

## Security constraints

- Scenario URLs accept only `http:`, `https:`, or `fixture:` protocols.
- File-based scenarios must remain inside the current project directory.
- Provider names, model names, report IDs, and run IDs are validated before use.
- Non-browser actions are never executed by the runtime verification service; callers
  submit their own observations.

## Scope and limitations

- This verifies structured claims against evidence, not arbitrary text or general factual accuracy.
- For non-browser verification, your application supplies the observations. The verifier
  checks their timestamps, execution scope, and agreement, but does not authenticate
  their source. Keep collection and action binding in trusted application code.
- Browser diagnoses use retry and selector observations. Treat results as evidence to
  inspect, not a guarantee of the root cause.
- A guardrail returns a decision. Your integration is responsible for enforcing it.

## Feedback and contributions

Found a claim you cannot verify yet? [Open an issue](https://github.com/travan/VeriCause/issues)
with a small, redacted claim/evidence example and the result you expected.
For repository setup and contribution checks, see the
[development guide](https://github.com/travan/VeriCause/blob/main/DEVELOPMENT.md).

## License

MIT
