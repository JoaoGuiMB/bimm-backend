import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../core/config/config.schema.js';
import { IngestionLockRepository } from '../repositories/ingestion-lock.repository.js';

export interface IngestionLease {
  readonly lost: AbortSignal;
  release(): Promise<void>;
}

@Injectable()
export class IngestionLockService {
  private readonly logger = new Logger(IngestionLockService.name);
  private readonly ttlMs: number;

  constructor(
    private readonly locks: IngestionLockRepository,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ttlMs = config.get('ingestion', { infer: true }).lockTtlMs;
  }

  async acquire(owner: string): Promise<IngestionLease | null> {
    if (!(await this.locks.acquire(owner, this.ttlMs))) {
      return null;
    }

    const lost = new AbortController();
    const heartbeat = setInterval(() => {
      this.locks.extend(owner, this.ttlMs).then(
        (extended) => {
          if (!extended)
            lost.abort(
              new Error('ingestion lock was taken over by another run'),
            );
        },
        (error: unknown) => lost.abort(error),
      );
    }, this.ttlMs / 3);
    heartbeat.unref();

    return {
      lost: lost.signal,
      release: async () => {
        clearInterval(heartbeat);

        try {
          await this.locks.release(owner);
        } catch (error) {
          this.logger.warn(
            { err: error, owner },
            'failed to release ingestion lock',
          );
        }
      },
    };
  }
}
