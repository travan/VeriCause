# Changelog

## 0.2.0

### Fixed

- Conflicting observations and mixed execution scopes return inconclusive results.
- Stale, future, or invalid evidence is excluded; duplicate observation IDs are rejected.
- Browser selector diagnoses require successful navigation to the intended page on both attempts.
- Explicit actions require matching action scope and unexpired supported verdicts.
- Guardrail decisions created at the same clock time no longer overwrite each other.

### Added

- Configurable AI request timeout and optional Ollama reasoning effort, validated with local Qwen3.5:9b.
- Offline CLI demo and clearer SDK examples and migration documentation.
- Automatic npm publishing after a version bump reaches main, with tests and isolated package checks.
- MIT license file matching the existing package metadata.

### Migration

Evidence expires after five minutes by default. Supply real observation timestamps
and set `maxEvidenceAgeMs` deliberately for another window. Custom browser executors
must report navigation evidence for both attempts. To authorize a concrete action,
bind its ID/type to the verified claim and provide fresh evidence. Decisions without
a proposed action remain recommendations that the application must enforce.

See [validation and migration details](docs/reliability-fixes.md). The local model
evaluation covers three fixtures and does not establish general model accuracy.
