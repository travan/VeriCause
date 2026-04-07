---
id: invalid-selector
name: Invalid selector
url: fixture://invalid-selector
selector: "#wrong-button"
expectedMode: deterministic_fail
timeoutMs: 1000
---

# Invalid Selector Use Case

The fixture page contains a real button, but this scenario intentionally uses an invalid selector to produce a deterministic failure.

## Goal

Demonstrate that the AI can be correct when the actual root cause is an invalid selector.
