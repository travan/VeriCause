import { Controller, Get, Inject } from "@nestjs/common";

import { CoreRuntime } from "../../core/runtime";
import { CORE_RUNTIME } from "../core-runtime.provider";

@Controller("scenarios")
export class ScenariosController {
  constructor(
    @Inject(CORE_RUNTIME) private readonly runtime: CoreRuntime,
  ) {}

  @Get()
  async discover() {
    const scenarios = await this.runtime.analysisService.discoverScenarios();
    return { scenarios };
  }
}
