import { AIDiagnosisSchema } from "../schemas";
import { AIDiagnosis, FailureAnalysisInput, ResolvedAiRuntimeOptions } from "../types";
import { FailureAnalyzer } from "./types";

export class MockAiAnalyzer implements FailureAnalyzer {
  async analyze(
    input: FailureAnalysisInput,
    _runtime: ResolvedAiRuntimeOptions,
  ): Promise<AIDiagnosis> {
    const diagnosis: AIDiagnosis = {
      predictedCause: "invalid_selector",
      confidence:
        input.scenario.expectedMode === "deterministic_fail"
          ? 0.91
          : input.scenario.expectedMode === "flaky"
            ? 0.78
            : 0.66,
      summary:
        input.scenario.expectedMode === "loose_element"
          ? "The failure still looks like a selector issue because the target could not be acted on reliably."
          : "The failure looks like a selector resolution issue based on the timeout error.",
    };

    return AIDiagnosisSchema.parse(diagnosis);
  }
}
