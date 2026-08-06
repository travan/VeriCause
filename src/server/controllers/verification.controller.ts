import { Body, Controller, Inject, Post } from "@nestjs/common";

import { RuntimeVerificationInputSchema } from "../../core/schemas";
import { CoreRuntime } from "../../core/runtime";
import { CORE_RUNTIME } from "../core-runtime.provider";

@Controller("verification")
export class VerificationController {
  constructor(@Inject(CORE_RUNTIME) private readonly runtime: CoreRuntime) {}

  @Post("run")
  run(@Body() body: unknown) {
    const input = RuntimeVerificationInputSchema.parse(body);
    return { result: this.runtime.runtimeVerificationService.verify(input) };
  }
}
