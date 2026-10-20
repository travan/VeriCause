# Development Guide

This document is for contributors and maintainers working on the AI Reliability Runtime repository. End users should start with [README.md](README.md).

## Prerequisites

- Node.js 18 or newer
- npm
- Chromium installed through Playwright

## Local setup

```bash
npm install
npx playwright install chromium
```

The repository includes browser fixtures under `fixtures/pages/`, sample scenarios under `scenarios/`, evaluation data under `evaluation/`, and non-browser verification examples under `verification/`.

## Common commands

```bash
npm run check
npm run build
npm test
npm run test:unit
npm run test:integration
```

Run the local CLI through `tsx`:

```bash
npm run cli -- discover
npm run cli -- analyze --scenario invalid-selector
npm run cli -- analyze --all
npm run cli -- evaluate --dataset ./evaluation/browser-fixtures.json
```

Start the HTTP server in watch mode:

```bash
npm run start:server:dev
```

Build first when testing the packaged entry points:

```bash
npm run build
npm run cli:dist -- discover
npm run start:server
```

## Project layout

```text
src/core/       Shared runtime, domain types, AI adapters, verification, and storage
src/cli/        CLI entry point and argument parsing
src/server/     NestJS HTTP server and controllers
scenarios/      Browser scenario examples
fixtures/       Local HTML pages used by browser tests
verification/   Runtime verification input examples
evaluation/     Ground-truth evaluation datasets
test/           Unit and integration tests
artifacts/      Generated reports, runs, and decisions
```

## Verification fixtures and regression checks

The JSON files under `verification/` contain fixed historical timestamps. With the
five-minute default evidence age limit they now produce `inconclusive`. Use
`npm run demo` for fresh synthetic observations, or collect actual observations with
their real timestamps when testing an integration.

The regression suites cover conflicting/stale/scoped evidence, action scope and expiry,
HTTP error pages and redirects (including late redirects), and HTTP verification and
guardrail persistence. On machines where Watchman is unavailable, run:

```bash
npm run test:unit -- --watchman=false
npm run test:integration -- --watchman=false
```

Integration tests require Chromium and permission to bind to local loopback sockets.
See [the reliability fixes report](docs/reliability-fixes.md) for the manual local-model
and packaged-consumer validation.

## Adding a provider

Provider names are registered in `src/core/ai/provider-registry.ts`. OpenAI-compatible providers use the configured base URL and API key environment variables. Anthropic-compatible providers use the Anthropic adapter.

Add or update unit tests for provider routing and response parsing when changing provider behavior.

## Publishing

The package is published as `ai-reliability-runtime`. The `prepare` script builds `dist/` before packaging.

Before publishing:

```bash
npm run check
npm test
npm run build
npm pack --dry-run
```

Confirm that the package contains the compiled `dist/` files, `README.md`, and `LICENSE`, and does not include local artifacts, coverage output, or test fixtures unless intentionally required.

## Documentation rule

Keep `README.md` focused on consumers who install the package from npm. Put repository setup, testing, implementation notes, and release procedures in this document instead.
