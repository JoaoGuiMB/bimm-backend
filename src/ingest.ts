import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { IngestionAppModule } from './ingestion-app.module.js';
import { IngestionService } from './ingestion/services/ingestion.service.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(IngestionAppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  const logger = new Logger('Ingest');

  const interrupt = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      logger.warn({ signal }, 'shutdown signal received, stopping ingestion');
      interrupt.abort();
    });
  }

  try {
    const run = await app.get(IngestionService).run(interrupt.signal);

    process.exitCode = run.status === 'completed' ? 0 : 1;
  } catch (error) {
    logger.error({ err: error }, 'ingestion failed');
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

await bootstrap();
