import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";

import { GuardReportInputSchema } from "../../core/schemas";
import { CoreRuntime } from "../../core/runtime";
import { CORE_RUNTIME } from "../core-runtime.provider";
import { GuardReportDto } from "../dto/guard-report.dto";

@Controller("guardrail")
export class GuardrailController {
  constructor(@Inject(CORE_RUNTIME) private readonly runtime: CoreRuntime) {}

  @Post("decide")
  async decide(@Body() dto: GuardReportDto) {
    const input = GuardReportInputSchema.parse(dto);
    const decision = await this.runtime.guardrailService.decide(input);
    return { decision };
  }

  @Get("decisions/:decisionId")
  async getById(@Param("decisionId") decisionId: string) {
    const decision = await this.runtime.guardrailService.getById(decisionId);
    return { decision };
  }
}
