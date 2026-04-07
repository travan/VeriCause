import { AiRuntimeOptions, InlineScenarioInput } from "../../core/types";

export class RunAnalysisDto {
  scenarioId?: string;
  filePath?: string;
  runAll?: boolean;
  scenario?: InlineScenarioInput;
  ai?: AiRuntimeOptions;
}
