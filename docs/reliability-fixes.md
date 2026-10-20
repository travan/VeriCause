# Reliability fixes and validation

Completed on 2026-10-20 (Asia/Ho_Chi_Minh). This follow-up supersedes the open implementation
and validation gaps in the [initial assessment](project-direction.md). It covers the
reported bugs, not a claim of general production readiness.

## Behavior changes

| Area | Corrected behavior |
|---|---|
| Conflicting observations | Eligible observations must agree; conflicting values return `inconclusive` in either order. |
| Evidence age | The default window is 300,000 ms. Stale, future, and invalid timestamps are excluded. No eligible evidence is inconclusive. |
| Execution scope | `claim.executionId` selects observations with that ID. Mixed executions without an explicit selection are inconclusive. |
| Evidence identity | Duplicate observation IDs are inconclusive. Guardrail evidence thresholds count distinct references. |
| Browser navigation | Both attempts must verify successful navigation and the intended URL. HTTP errors, wrong destinations, late redirects, or missing navigation evidence cannot establish a selector failure. |
| Browser failure classification | An absent selector requires a timeout signature on verified pages; an unknown failure remains inconclusive. |
| Action binding | An explicit proposed action requires matching claim `actionScope.id` and `.type`. Supported permission also requires an unexpired `validUntil`. |
| Decision persistence | Guardrail decision IDs include a UUID so calls in the same millisecond cannot overwrite one another. |
| Local models | Configurable per-attempt timeout and optional Ollama reasoning effort support the verified Qwen configuration. |

Conclusive structured verdicts expire at the oldest eligible observation's expiry.
`maxEvidenceAgeMs` is configurable per claim. The application owns the precondition,
action binding, and evidence source; adding matching labels does not authenticate
arbitrary caller-supplied data.

Without `proposedAction`, the original verdict-to-policy mapping remains available as
a recommendation. Browser diagnoses have no action scope and cannot authorize unrelated
actions through the scoped guardrail path. The library returns decisions; applications
must enforce them.

## Automated validation

- Type check and production build: passed.
- 122 unit tests across 16 suites: passed.
- 4 integration tests across 3 suites: passed.
- Integration coverage includes real Chromium fixtures, HTTP 500, immediate and delayed
  redirects to a different page, HTTP verification and guardrail routes, and persisted decisions.
- The new persistence regression creates opposing decisions at an identical clock time
  and confirms both records remain independently readable.
- Diff whitespace validation: passed.

Commands:

```bash
npm run check -- --incremental false
npm run build
npm run test:unit -- --watchman=false
npm run test:integration -- --watchman=false
```

The previously blocked Chromium/HTTP validation was successfully completed on this date.

## Packaged-consumer and local-model validation

The compiled npm tarball was extracted into a separate consumer workspace. Browser
fixtures and scenarios were copied there; dependencies were reused from the installed
workspace. This validates packaged files and entrypoints but is not a clean registry
installation on a new machine.

Model configuration:

```bash
AI_PROVIDER=ollama
AI_MODEL=qwen3.5:9b
AI_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
AI_OLLAMA_API_KEY=ollama
AI_REQUEST_TIMEOUT_MS=120000
AI_OLLAMA_REASONING_EFFORT=none
```

Both CLI and SDK completed the same three-case evaluation:

| Case | Model claim | Verified cause | Decision about the claim |
|---|---|---|---|
| Invalid selector | `invalid_selector` | `invalid_selector` | `supported` |
| Delayed element | `timeout` | `flaky_timing` | `contradicted` |
| Detached element | `flaky_timing` | `loose_element` | `contradicted` |

For each run: model accuracy 1/3; verifier and decision accuracy 3/3; no false accepts;
no inconclusive outcomes. Quality gates checked verifier/decision accuracy, false accepts,
and inconclusive rate, not minimum model accuracy.

The SDK run also persisted and read back all three guardrail recommendations. It took
approximately 18.7 seconds for evaluation and the persistence checks on this machine.
The live HTTP run analyzed an invalid selector with Qwen, returned HTTP 201, retrieved
the saved report, and returned the expected guardrail recommendation in approximately
4.7 seconds. These timings are observations, not performance guarantees.

A separate packaged-SDK check confirmed that reversing conflicting evidence gives the
same inconclusive result, stale/future evidence is not accepted, the matching action can
be allowed with fresh evidence, and an unrelated action is escalated.

Local evidence is saved under `artifacts/reliability-fixes/` (ignored by Git):

- `package-manifest.json` and `ai-reliability-runtime-0.1.0.tgz`
- `cli-evaluation.json` and `cli-artifacts/`
- `sdk-http-results.json`, `sdk-http.stdout.log`, and `sdk-http-artifacts/`
- `packaged-verification.json`

The HTTP analysis/guardrail smoke checks a browser report recommendation. The separate
HTTP regression test checks action-scope preservation and enforcement against a persisted
verification report; it seeds that report through the SDK store. Runtime verification
currently returns its result without automatically persisting an analysis report. Use
`runtime.guardrailService.decideVerdict` for direct SDK verification-to-policy workflows.

## Migration and remaining scope

- Old JSON samples with fixed observation dates now return inconclusive by default.
  Use actual recent observations or an explicitly chosen historical evaluation window.
- Custom browser executors must supply navigation evidence for both attempts; old
  reports lacking it are inconclusive when re-evaluated under the updated verifier.
- Applications authorizing a concrete action must provide its unique ID/type and
  an application-bound claim; a supported diagnosis alone is insufficient.
- Navigation verification establishes HTTP success and URL agreement. It does not
  establish application-level correctness of a page that returns HTTP 200 at the same URL.
- The three browser fixtures demonstrate integration behavior. Broader benchmark data,
  workload testing, and application-specific policy validation remain separate work.

## Release preparation: 0.2.0

The release manifests now target 0.2.0. Unlike the earlier local-model consumer
workspace, the 0.2.0 tarball was installed with its own dependencies in a new consumer
directory. SDK import, CLI verdict/decision output, declaration entrypoint, package
version, and MIT license checks passed. Type check, build, and five release-workflow
regression tests passed. No runtime implementation changed during this version bump;
the live-model results above are from the earlier 0.1.0 test tarball.

The publish workflow validates a new stable version, runs all tests, installs and tests
the tarball, and publishes that same tarball after the version bump reaches main.
See [npm authorization setup](../DEVELOPMENT.md#one-time-npm-authorization) for the
external Trusted Publisher configuration. It has not been verified by these local
checks. No npm publication was performed during release preparation.
