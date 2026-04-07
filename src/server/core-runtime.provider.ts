import { Provider } from "@nestjs/common";

import { CoreRuntime, createCoreRuntime } from "../core/runtime";

export const CORE_RUNTIME = Symbol("CORE_RUNTIME");

export const CoreRuntimeProvider: Provider<CoreRuntime> = {
  provide: CORE_RUNTIME,
  useFactory: () => createCoreRuntime(),
};
