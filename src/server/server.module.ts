import { Module } from "@nestjs/common";

import { CoreRuntimeProvider } from "./core-runtime.provider";
import { AnalysisController } from "./controllers/analysis.controller";
import { ScenariosController } from "./controllers/scenarios.controller";

@Module({
  controllers: [ScenariosController, AnalysisController],
  providers: [CoreRuntimeProvider],
})
export class ServerModule {}
