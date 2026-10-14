import { Module } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { LoggerModule } from './core/logger/logger.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, IngestionModule],
})
export class IngestionAppModule {}
