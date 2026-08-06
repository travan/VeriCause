import { Module } from "@nestjs/common";

import { CoreRuntimeProvider } from "./core-runtime.provider";
import { AnalysisController } from "./controllers/analysis.controller";
import { EvaluationController } from "./controllers/evaluation.controller";
import { GuardrailController } from "./controllers/guardrail.controller";
import { VerificationController } from "./controllers/verification.controller";
import { ScenariosController } from "./controllers/scenarios.controller";

@Module({
  controllers: [
    ScenariosController,
    AnalysisController,
    EvaluationController,
    GuardrailController,
    VerificationController,
  ],
  providers: [CoreRuntimeProvider],
})
export class ServerModule {}
