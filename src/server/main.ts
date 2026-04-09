import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { ServerModule } from "./server.module";

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ServerModule);
  const port = Number(process.env.PORT ?? 3000);

  const shutdown = (): void => {
    void app.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen(port);
}

/* istanbul ignore next */
if (require.main === module) {
  void bootstrap();
}
