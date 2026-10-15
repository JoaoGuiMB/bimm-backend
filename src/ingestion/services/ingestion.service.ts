import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../core/config/config.schema.js';
import {
  MakesWriter,
  type UpsertOutcome,
} from '../../makes/contracts/makes.writer.js';
import type { VehicleMake } from '../../makes/entities/vehicle-make.entity.js';
import { VpicClient } from '../../vpic/client/vpic.client.js';
import { VpicRequestError } from '../../vpic/errors/vpic.errors.js';
import type { MakeSummary } from '../../vpic/parsing/vehicle-make.transformer.js';
import { runConcurrently } from '../concurrency/run-concurrently.js';
import type {
  IngestionRunSummary,
  IngestionStats,
} from '../entities/ingestion-run.js';
import {
  IngestionAbortedError,
  IngestionLockedError,
} from '../errors/ingestion.errors.js';
import { IngestionRunRepository } from '../repositories/ingestion-run.repository.js';
import { IngestionLockService } from './ingestion-lock.service.js';

const WRITE_RETRY_DELAYS_MS = [1000, 2000];

interface RunContext {
  runId: string;
  startedAt: Date;
  abort: AbortController;
  stop: AbortSignal;
  stats: IngestionStats;
  failedMakeIds: number[];
  pending: VehicleMake[];
  maxFailures: number;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly settings: AppConfig['ingestion'];

  constructor(
    private readonly vpic: VpicClient,
    private readonly makes: MakesWriter,
    private readonly runs: IngestionRunRepository,
    private readonly locks: IngestionLockService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.settings = config.get('ingestion', { infer: true });
  }

  async run(interrupt: AbortSignal): Promise<IngestionRunSummary> {
    const runId = randomUUID();
    const lease = await this.locks.acquire(runId);
    if (!lease) {
      throw new IngestionLockedError();
    }

    try {
      const startedAt = new Date();

      await this.runs.start(runId, startedAt);
      this.logger.log({ runId }, 'ingestion started');

      const abort = new AbortController();
      const context: RunContext = {
        runId,
        startedAt,
        abort,
        stop: AbortSignal.any([interrupt, lease.lost, abort.signal]),
        stats: {
          makesFetched: 0,
          makesWritten: 0,
          makesFailed: 0,
          makesDeleted: 0,
          recordsSkipped: 0,
        },
        failedMakeIds: [],
        pending: [],
        maxFailures: 0,
      };

      await this.ingest(context);
      const summary = await this.finish(context, interrupt);

      await this.runs.finish(summary);
      this.logger.log(
        {
          runId,
          status: summary.status,
          makes: summary.stats.makesFetched,
          written: summary.stats.makesWritten,
          failed: summary.stats.makesFailed,
          skipped: summary.stats.recordsSkipped,
          deleted: summary.stats.makesDeleted,
          durationMs: summary.finishedAt.getTime() - startedAt.getTime(),
          error: summary.error,
        },
        'ingestion finished',
      );

      return summary;
    } finally {
      await lease.release();
    }
  }

  private async ingest(context: RunContext): Promise<void> {
    let makes: MakeSummary[];

    try {
      const fetched = await this.vpic.fetchMakes();

      makes = fetched.makes;
      context.stats.makesFetched = makes.length;
      context.stats.recordsSkipped = fetched.skipped.length;

      for (const skipped of fetched.skipped) {
        this.logger.warn(
          { runId: context.runId, err: skipped, record: skipped.record },
          'skipping invalid make record',
        );
      }
    } catch (error) {
      context.abort.abort(error);
      return;
    }

    context.maxFailures = Math.floor(
      makes.length * this.settings.maxFailureRatio,
    );

    await runConcurrently(
      makes,
      this.settings.concurrency,
      context.stop,
      async (make) => {
        try {
          const vehicleTypes = await this.vpic.fetchVehicleTypes(make.makeId);

          context.pending.push({ ...make, vehicleTypes });
        } catch (error) {
          this.logger.warn(
            { runId: context.runId, makeId: make.makeId, err: error },
            'skipping make',
          );
          this.recordFailures(context, [make.makeId]);

          if (error instanceof VpicRequestError && error.isThrottled) {
            context.abort.abort(
              new IngestionAbortedError(
                `vPIC is throttling requests (${error.message}); lower VPIC_REQUESTS_PER_SECOND or retry later`,
              ),
            );
          }
        }

        if (context.pending.length >= this.settings.batchSize) {
          await this.flush(context);
        }
      },
    );

    await this.flush(context);
  }

  private async flush(context: RunContext): Promise<void> {
    if (context.pending.length === 0) {
      return;
    }

    const batch = context.pending.splice(0);

    try {
      const outcome = await this.writeWithRetry(batch, context);

      context.stats.makesWritten += outcome.written;

      for (const makeId of outcome.failedMakeIds) {
        this.logger.warn(
          { runId: context.runId, makeId },
          'failed to write make',
        );
      }

      this.recordFailures(context, outcome.failedMakeIds);

      this.logger.log(
        {
          runId: context.runId,
          processed: context.stats.makesWritten + context.stats.makesFailed,
          total: context.stats.makesFetched,
          failed: context.stats.makesFailed,
        },
        'ingestion progress',
      );
    } catch (error) {
      context.abort.abort(error);
    }
  }

  private async writeWithRetry(
    batch: VehicleMake[],
    { runId, startedAt }: RunContext,
  ): Promise<UpsertOutcome> {
    for (const delayMs of WRITE_RETRY_DELAYS_MS) {
      try {
        return await this.makes.upsertMany(batch, startedAt);
      } catch (error) {
        this.logger.warn(
          { runId, err: error, size: batch.length, retryInMs: delayMs },
          'batch write failed, retrying',
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return this.makes.upsertMany(batch, startedAt);
  }

  private recordFailures(context: RunContext, makeIds: number[]): void {
    context.failedMakeIds.push(...makeIds);
    context.stats.makesFailed += makeIds.length;

    if (
      context.stats.makesFailed > context.maxFailures &&
      !context.abort.signal.aborted
    ) {
      context.abort.abort(
        new IngestionAbortedError(
          `too many failed makes: ${context.stats.makesFailed} of ${context.stats.makesFetched}`,
        ),
      );
    }
  }

  private async finish(
    context: RunContext,
    interrupt: AbortSignal,
  ): Promise<IngestionRunSummary> {
    const { runId, startedAt, stats, failedMakeIds } = context;
    const summary = (
      status: IngestionRunSummary['status'],
      error?: string,
    ): IngestionRunSummary => ({
      runId,
      status,
      startedAt,
      finishedAt: new Date(),
      stats,
      failedMakeIds,
      ...(error !== undefined && { error }),
    });

    if (interrupt.aborted) {
      return summary('interrupted', 'interrupted by shutdown signal');
    }

    if (context.stop.aborted) {
      this.logger.error(
        { runId, err: context.stop.reason },
        'ingestion aborted',
      );
      return summary('failed', errorMessage(context.stop.reason));
    }

    if (stats.makesFailed === 0 && stats.recordsSkipped === 0) {
      try {
        stats.makesDeleted = await this.makes.deleteNotIngestedSince(startedAt);
      } catch (error) {
        this.logger.error(
          { runId, err: error },
          'failed to delete removed makes',
        );
        return summary('failed', errorMessage(error));
      }
    }

    return summary('completed');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
