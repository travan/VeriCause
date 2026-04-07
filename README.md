# AI Reliability Layer for Automation Systems

This repository is organized into three clear layers:

- `src/core`: shared execution, AI analysis, reliability validation, and reporting logic
- `src/server`: NestJS HTTP adapter
- `src/cli`: CLI adapter

`scenarios/` contains external inputs and should never be copied into `dist/`.

## Problem

Large language models can explain automation failures, but their diagnosis should not be trusted without runtime evidence.

This project validates AI-generated failure analysis against actual execution results:

- run the scenario
- capture runtime evidence
- let AI diagnose the failure
- retry and validate the result
- decide whether to accept or override the AI claim

## Architecture

```text
Input (CLI / HTTP / scenario files)
  -> Scenario normalization
  -> Playwright execution
  -> AI diagnosis
  -> Reliability validation
  -> Report generation
```

## Structure

```text
src/
  core/
    ai/
  server/
  cli/
scenarios/
fixtures/
artifacts/
```

## Commands

```bash
npm install
npm run check
npm run build
npm run start:server:dev
npm run cli -- discover
npm run cli -- analyze --all
npm run cli -- analyze --all --async
npm run cli -- analyze --file ./scenarios/invalid-selector.md
npm run cli -- analyze --file ./scenarios/invalid-selector.md --provider mock --model gpt-5.4
```

## CLI Modes

- `npm run cli -- discover`
  Discover all supported scenarios from the `scenarios/` directory.

- `npm run cli -- analyze --file <path>`
  Run a single scenario synchronously and print the final report.

- `npm run cli -- analyze --all`
  Run all discovered scenarios synchronously.

- `npm run cli -- analyze --all --async`
  Create an asynchronous run, stream progress in the terminal, and print aggregated results when the run finishes.

## API

- `GET /scenarios`
- `POST /analysis/run`
- `POST /analysis/runs`
- `GET /analysis/runs/:runId`
- `GET /analysis/runs/:runId/results`
- `GET /analysis/reports/:reportId`

`POST /analysis/run` and `POST /analysis/runs` support AI runtime selection through:

- request body:
  - `ai.provider`
  - `ai.model`
- or headers:
  - `x-ai-provider`
  - `x-ai-model`

Example:

```bash
curl -X POST http://127.0.0.1:3000/analysis/run \
  -H "content-type: application/json" \
  -H "x-ai-provider: mock" \
  -H "x-ai-model: gpt-5.4" \
  --data '{"scenarioId":"invalid-selector"}'
```

## AI Providers

Providers are mapped by protocol in [src/core/ai/provider-registry.ts](/Users/vantranguyenthi/Documents/project/my_app/src/core/ai/provider-registry.ts):

- `mock`
- OpenAI-compatible:
  - `openai`
  - `grok`
  - `qwen`
  - `deepseek`
  - `ollama`
  - `lmstudio`
  - `local`
  - `gemini`
- Anthropic Messages:
  - `anthropic`
  - `claude`

Extension rules:

- If a new provider uses an existing protocol, add one entry to the registry.
- If a new provider uses a new protocol, add a new analyzer under `src/core/ai/` and map the provider to that analyzer through the registry.

## Reports

Each completed analysis produces:

- execution evidence
- AI diagnosis
- reliability verdict
- saved JSON artifacts under `artifacts/reports/`

This makes it possible to compare:

- what the AI predicted
- what runtime evidence showed
- whether the system accepted or overrode the AI conclusion
