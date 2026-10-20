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

The next release is **0.2.0**, reflecting stricter evidence and action authorization
requirements. See [the release notes](CHANGELOG.md) for migration details.

### Automatic publishing

Merging a change to `package.json` into `main` starts `.github/workflows/publish.yml`.
The workflow checks whether the version is already on npm and skips existing versions.
New stable versions must be newer than npm's `latest`; registry errors stop the release.
It runs type checks, unit/integration/release tests, then installs the packed tarball
into an isolated consumer and checks its SDK, CLI, types, and license. Only that tested
tarball is published. A version bump is therefore a release request when merged.

The workflow also accepts a matching `vX.Y.Z` tag pointing to a commit on `main`, or
**Run workflow** on `main` to retry a failed release without another version bump.
Publication is serialized, and rerunning a published version is a no-op.
Prerelease versions are not supported by this stable release workflow.

For later releases, run `npm version patch --no-git-tag-version` (or `minor` for
incompatible changes while below 1.0), update `CHANGELOG.md`, and merge both manifest
and lockfile changes through a PR.

### One-time npm authorization

This workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
with OIDC; no `NPM_TOKEN` is required. In the npm package's **Settings → Trusted Publisher**,
configure GitHub Actions with:

- Organization or user: `travan`
- Repository: `VeriCause`
- Workflow filename: `publish.yml`
- Environment: leave blank (the workflow does not declare an environment)
- Allow direct `npm publish` if the settings show an allowed-actions control.

This authorization lives on npm and cannot be enabled by committing workflow YAML.
Verify it before merging the version bump. The workflow uses Node 24 and npm 11
for OIDC support. GitHub Actions must be enabled for the repository.

Before publishing:

```bash
npm run check
npm test
npm run test:release
npm run build
npm pack --dry-run
```

Confirm that the package contains the compiled `dist/` files, `README.md`, and `LICENSE`, and does not include local artifacts, coverage output, or test fixtures unless intentionally required.

## Documentation rule

Keep `README.md` focused on consumers who install the package from npm. Put repository setup, testing, implementation notes, and release procedures in this document instead.
