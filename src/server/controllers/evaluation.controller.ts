import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";

import { EvaluationDatasetSchema, EvaluationThresholdsSchema } from "../../core/schemas";
import { CoreRuntime } from "../../core/runtime";
import { CORE_RUNTIME } from "../core-runtime.provider";
import { RunEvaluationDto } from "../dto/run-evaluation.dto";
import { CompareEvaluationsDto } from "../dto/compare-evaluations.dto";

@Controller("evaluation")
export class EvaluationController {
  constructor(@Inject(CORE_RUNTIME) private readonly runtime: CoreRuntime) {}

  @Post("run")
  async run(@Body() dto: RunEvaluationDto) {
    const cases = EvaluationDatasetSchema.parse(dto.cases);
    const thresholds = EvaluationThresholdsSchema.parse(dto.thresholds ?? {});
    const result = await this.runtime.evaluationService.run(cases, thresholds);

    return { status: "completed" as const, result };
  }

  @Post("compare")
  async compare(@Body() dto: CompareEvaluationsDto) {
    const result = await this.runtime.evaluationService.compare(
      dto.baselineEvaluationId,
      dto.candidateEvaluationId,
    );
    return { result };
  }

  @Get(":evaluationId")
  async getById(@Param("evaluationId") evaluationId: string) {
    const result = await this.runtime.evaluationService.getById(evaluationId);
    return { result };
  }
}
