import { ExecutionResult, ValidationEvidence } from "../types";

export interface EvidenceBuilder {
  build(retryRun: ExecutionResult): ValidationEvidence;
}

export class RuntimeEvidenceBuilder implements EvidenceBuilder {
  build(retryRun: ExecutionResult): ValidationEvidence {
    return {
      retryStatus: retryRun.status,
      selectorExists: retryRun.selectorExistsAfterRun ?? null,
      historicalPattern:
        retryRun.status === "passed"
          ? "flaky"
          : retryRun.selectorExistsAfterRun
            ? "unknown"
            : "stable_fail",
      failureSignature: this.detectFailureSignature(
        retryRun.errorMessage,
        retryRun.statusTextAfterRun,
      ),
      observedAt: retryRun.timestamp,
    };
  }

  private detectFailureSignature(
    errorMessage: string | undefined,
    statusText?: string,
  ): ValidationEvidence["failureSignature"] {
    const status = statusText?.toLowerCase();

    if (status?.includes("detached")) {
      return "detached";
    }

    if (!errorMessage) {
      return "unknown";
    }

    const normalized = errorMessage.toLowerCase();

    if (normalized.includes("detach")) {
      return "detached";
    }

    if (normalized.includes("timeout")) {
      return "timeout";
    }

    return "unknown";
  }
}
