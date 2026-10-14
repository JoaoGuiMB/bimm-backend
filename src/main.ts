import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/config.schema.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const { env, port } = config.get('app', { infer: true });
  const { level } = config.get('log', { infer: true });

  await app.listen(port);
  new Logger('Bootstrap').log(
    { appEnv: env, port, logLevel: level },
    'api listening',
  );
}
await bootstrap();
