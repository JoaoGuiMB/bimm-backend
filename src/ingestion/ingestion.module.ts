import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MakesModule } from '../makes/makes.module.js';
import { VpicModule } from '../vpic/vpic.module.js';
import { IngestionLockRepository } from './repositories/ingestion-lock.repository.js';
import { IngestionRunRepository } from './repositories/ingestion-run.repository.js';
import {
  IngestionRun,
  IngestionRunSchema,
} from './schemas/ingestion-run.schema.js';
import { Lock, LockSchema } from './schemas/lock.schema.js';
import { IngestionLockService } from './services/ingestion-lock.service.js';
import { IngestionService } from './services/ingestion.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IngestionRun.name, schema: IngestionRunSchema },
      { name: Lock.name, schema: LockSchema },
    ]),
    MakesModule,
    VpicModule,
  ],
  providers: [
    IngestionService,
    IngestionRunRepository,
    IngestionLockRepository,
    IngestionLockService,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
