import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IngestionRunSummary } from '../entities/ingestion-run.js';
import { IngestionRun } from '../schemas/ingestion-run.schema.js';

@Injectable()
export class IngestionRunRepository {
  constructor(
    @InjectModel(IngestionRun.name)
    private readonly runModel: Model<IngestionRun>,
  ) {}

  async start(runId: string, startedAt: Date): Promise<void> {
    await this.runModel.create({ _id: runId, status: 'running', startedAt });
  }

  async finish({ runId, ...outcome }: IngestionRunSummary): Promise<void> {
    await this.runModel.updateOne({ _id: runId }, { $set: outcome }).exec();
  }
}
