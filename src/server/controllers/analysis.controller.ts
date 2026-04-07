import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import { CoreRuntime } from "../../core/runtime";
import { RunAnalysisInput } from "../../core/types";
import { CORE_RUNTIME } from "../core-runtime.provider";
import { RunAnalysisDto } from "../dto/run-analysis.dto";

@Controller("analysis")
export class AnalysisController {
  constructor(
    @Inject(CORE_RUNTIME) private readonly runtime: CoreRuntime,
  ) {}

  @Post("run")
  async run(
    @Body() dto: RunAnalysisDto,
    @Headers("x-ai-provider") headerProvider?: string,
    @Headers("x-ai-model") headerModel?: string,
  ) {
    const input: RunAnalysisInput = {
      ...dto,
      ai:
        headerProvider || headerModel || dto.ai
          ? {
              provider: headerProvider ?? dto.ai?.provider,
              model: headerModel ?? dto.ai?.model,
            }
          : undefined,
    };
    const result = await this.runtime.analysisService.run(input);

    return {
      status: "completed" as const,
      result,
    };
  }

  @Post("runs")
  async startRun(
    @Body() dto: RunAnalysisDto,
    @Headers("x-ai-provider") headerProvider?: string,
    @Headers("x-ai-model") headerModel?: string,
  ) {
    const input: RunAnalysisInput = {
      ...dto,
      ai:
        headerProvider || headerModel || dto.ai
          ? {
              provider: headerProvider ?? dto.ai?.provider,
              model: headerModel ?? dto.ai?.model,
            }
          : undefined,
    };
    const run = await this.runtime.analysisService.startRun(input);

    return {
      status: "queued" as const,
      run,
    };
  }

  @Get("reports/:reportId")
  async getReport(@Param("reportId") reportId: string) {
    const report = await this.runtime.analysisService.getReport(reportId);
    return { report };
  }

  @Get("runs/:runId")
  async getRun(@Param("runId") runId: string) {
    const run = await this.runtime.analysisService.getRun(runId);
    return { run };
  }

  @Get("runs/:runId/results")
  async getRunResults(@Param("runId") runId: string) {
    const result = await this.runtime.analysisService.getRunResults(runId);
    return result;
  }
}
