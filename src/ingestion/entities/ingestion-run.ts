export type IngestionStatus =
  'running' | 'completed' | 'failed' | 'interrupted';

export interface IngestionStats {
  makesFetched: number;
  makesWritten: number;
  makesFailed: number;
  makesDeleted: number;
  recordsSkipped: number;
}

export interface IngestionRunSummary {
  runId: string;
  status: Exclude<IngestionStatus, 'running'>;
  startedAt: Date;
  finishedAt: Date;
  stats: IngestionStats;
  failedMakeIds: number[];
  error?: string;
}
