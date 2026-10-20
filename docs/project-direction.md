# Project direction and local-model validation

Assessment date: 2026-10-19 (Asia/Ho_Chi_Minh).

This document records the baseline assessment before the reliability fixes. For the
current behavior and verification results, see [the 2026-10-20 follow-up](reliability-fixes.md).

The project is moving toward its stated purpose: convert AI claims into decisions
that can be checked against runtime evidence. The local-model test demonstrates
that purpose in the browser failure-diagnosis workflow. The current implementation
is an evidence-verification developer tool with a policy engine; further work is
needed before describing it as a general agent enforcement layer.

## Evidence from the local-model test

The npm tarball was extracted into a separate directory, with copies of the repository's
three browser fixtures and scenarios. It reused the existing installed dependencies;
this was not a clean download/install test from the public npm registry.

- Local server: Ollama 0.40.1, loopback endpoint, model `qwen3.5:9b`, MLX runner.
- Original configuration: failed at `ai_analysis` after three 30-second timeouts.
- A 120-second timeout-only run was manually stopped before completion; it is not a passing run.
- Working configuration: `AI_REQUEST_TIMEOUT_MS=120000` and
  `AI_OLLAMA_REASONING_EFFORT=none`.
- The CLI evaluation completed all three scenarios. A subsequent SDK evaluation
  completed the same three scenarios and saved its evaluation report.

| Scenario | Qwen diagnosis, in both completed evaluations | Runtime-derived cause | Verdict |
|---|---|---|---|
| Missing selector | `invalid_selector` | `invalid_selector` | `supported` |
| Delayed element | `timeout` | `flaky_timing` | `contradicted` |
| Detached element | `flaky_timing` | `loose_element` | `contradicted` |

Each completed evaluation had claim accuracy 1/3, verifier accuracy 3/3,
decision accuracy 3/3, and zero false accepts. The quality gate checked verifier and
decision accuracy, false accepts, and inconclusive results; it did not impose a
minimum model claim accuracy. Both evaluations passed that gate.

The model's first response in the successful CLI evaluation took approximately 23 seconds;
the subsequent SDK evaluation measured approximately 2.3–5.7 seconds per AI stage.
These are observations on this machine, not latency guarantees.

The SDK guardrail was also applied to all three saved SDK reports. It returned
`allow`, `block`, and `block`, and the persisted decisions were read back successfully.
The first smoke script compared an object containing `undefined` with its JSON round trip
and failed that assertion. The assertion was corrected to compare JSON representations;
the separate persistence check then passed without new model requests.

At the time of this baseline assessment, the live HTTP/model smoke test had not been
executed because automatic approval review was unavailable due to a usage limit.
The follow-up records the subsequent test results.

Validation completed: type check, build, 106 unit tests, and 2 browser integration tests.
The integration tests passed after the timeout change; the subsequent optional Ollama
request-field change was covered by unit tests and the real CLI/SDK model runs.

Detailed local outputs and reproducible probe scripts are in
`artifacts/local-ai-validation/` (ignored by Git).

## What this demonstrates

The useful result is that a confident but incorrect diagnosis can be rejected using
additional observations. Qwen's diagnosis was wrong on two cases, and verification
identified both disagreements with the known fixture causes.

The architecture supports that result: browser analysis and structured verification
produce a common `VerificationClaim -> EvidenceBundle -> CoreVerdict` representation.
Evaluation measures those results against ground truth. The policy engine maps a
verdict to a decision, and stored reports retain evidence references and stage timings.

The timeout and optional Ollama reasoning changes support this purpose by making the
same verification flow usable with an installed local model. The demo and documentation
changes make that flow easier to try. They do not establish broader verification accuracy.

## Baseline gaps before the fixes

### 1. Evidence needs an explicit selection and freshness contract

The structured verifier selects the first matching evidence type. Local probes showed:

| Supplied observations for a claim expecting HTTP 200 | Baseline result |
|---|---|
| No matching observation | `inconclusive -> escalate` at high risk |
| HTTP 200, then HTTP 500 | `supported -> allow` |
| The same observations in reverse order | `contradicted -> block` |
| HTTP 200 dated 2020 | `supported -> allow` |

The README currently asks the caller to supply the relevant observation. That contract
can support a narrow SDK, but automatic agent integrations need a stronger contract:
correlate observations with the relevant execution/action, define an observation window,
and handle conflicting relevant evidence explicitly. Do not silently select the first
item or assume that choosing the newest item resolves every use case.

### 2. Browser heuristics do not yet establish general root causes

The browser verifier treats a failed retry with an absent selector as `invalid_selector`,
even without a known failure signature. A successful retry becomes `flaky_timing`.
Those rules match the bundled fixtures, but do not rule out navigation failures,
authentication failures, wrong pages, or unrelated application errors.

The execution report should preserve evidence that the intended page loaded and the
relevant operation was reached. Cases with insufficient causal evidence should remain
`inconclusive`. Add fixtures outside the current three rules before claiming broad
root-cause accuracy.

### 3. A supported claim is not authorization for any proposed action

The policy engine maps `supported` to `allow`. `proposedAction` is recorded, but its
relationship to the verified claim is not checked. For example, confirming a diagnosis
of an invalid selector does not establish that a subsequent purchase action is appropriate.

Define the claim required for each proposed action and verify that relationship in the
integration/policy. Show an application enforcing the returned decision, including a
case where the next action is actually withheld. Keep diagnosis verification and action
permission explicit in the public API and examples.

### 4. Expand evaluation beyond the fixtures used to implement the verifier

Two runs of the same three fixtures are useful integration evidence, not six independent
benchmark cases. The model sees the first execution, while the verifier receives retry
evidence. The test therefore measures the combined workflow, not a comparison under
identical information.

The next dataset should include missing, stale and conflicting evidence, wrong pages,
server/network failures, successful actions, ambiguous diagnoses, and real anonymized
failure reports. Track false accepts, false overrides, inconclusive rate, end-to-end
latency, and whether the application enforced the policy. Use model accuracy as a
separate measurement.

## Recommended next milestone

Keep the shared verification core and focus the next release on a complete developer
workflow: submit a claim and scoped evidence, obtain an explainable verdict, and enforce
an action-specific policy. Browser failure diagnosis remains the demonstrated entry use case.

Suggested order:

1. Specify evidence correlation, freshness, and conflict handling; implement regression cases.
2. Preserve browser navigation/operation evidence and return inconclusive when it is insufficient.
3. Provide one real agent/tool integration with a policy tied to the proposed action.
4. Validate that integration through SDK, CLI, and HTTP with local-model runs and a broader dataset.
5. Publish a reproducible example and measured results with the dataset's limitations stated.

Avoid making a larger provider list, a dashboard, or a higher download count the main
technical milestone. The product promise becomes stronger when users can reproduce a
wrong AI claim being detected and the corresponding action being handled correctly.

## Reproduce the browser evaluation from the repository

With the model already installed, Ollama running, dependencies installed, and Chromium available:

```bash
npm run build
AI_PROVIDER=ollama \
AI_MODEL=qwen3.5:9b \
AI_OLLAMA_BASE_URL=http://127.0.0.1:11434/v1 \
AI_OLLAMA_API_KEY=ollama \
AI_REQUEST_TIMEOUT_MS=120000 \
AI_OLLAMA_REASONING_EFFORT=none \
BASE_OUTPUT_DIR=artifacts/local-model-check \
node dist/cli/main.js evaluate \
  --dataset evaluation/browser-fixtures.json \
  --min-verifier-accuracy 1 \
  --min-decision-accuracy 1 \
  --max-false-accept-rate 0 \
  --max-inconclusive-rate 0
```

The local key is a placeholder for a server without authentication.
Ollama documents the reasoning parameter in its
[compatibility reference](https://docs.ollama.com/api/openai-compatibility).
