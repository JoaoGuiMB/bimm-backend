import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type {
  IngestionStats,
  IngestionStatus,
} from '../entities/ingestion-run.js';

@Schema({ collection: 'ingestion_runs', versionKey: false })
export class IngestionRun {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({
    type: String,
    required: true,
    enum: ['running', 'completed', 'failed', 'interrupted'],
  })
  status: IngestionStatus;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  finishedAt?: Date;

  @Prop({
    type: {
      makesFetched: Number,
      makesWritten: Number,
      makesFailed: Number,
      makesDeleted: Number,
      recordsSkipped: Number,
    },
    _id: false,
  })
  stats?: IngestionStats;

  @Prop({ type: [Number], default: [] })
  failedMakeIds: number[];

  @Prop()
  error?: string;
}

export const IngestionRunSchema = SchemaFactory.createForClass(IngestionRun);
IngestionRunSchema.index({ startedAt: -1 });
