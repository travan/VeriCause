import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { ServerModule } from "./server.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ServerModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
