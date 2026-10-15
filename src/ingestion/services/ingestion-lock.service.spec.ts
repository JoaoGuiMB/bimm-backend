import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../core/config/config.schema.js';
import type { IngestionLockRepository } from '../repositories/ingestion-lock.repository.js';
import {
  IngestionLockService,
  type IngestionLease,
} from './ingestion-lock.service.js';

const TTL_MS = 3000;
const HEARTBEATS_PER_TTL = 3;
const OWNER = 'run-1';

type LockRepositoryStub = Partial<
  Record<keyof IngestionLockRepository, ReturnType<typeof vi.fn>>
>;

function createService(locks: LockRepositoryStub) {
  const config = {
    get: () => ({ lockTtlMs: TTL_MS }),
  } as unknown as ConfigService<AppConfig, true>;

  return new IngestionLockService(
    locks as unknown as IngestionLockRepository,
    config,
  );
}

async function acquireLease(
  locks: LockRepositoryStub,
): Promise<IngestionLease> {
  const lease = await createService({
    acquire: vi.fn().mockResolvedValue(true),
    ...locks,
  }).acquire(OWNER);
  if (!lease) throw new Error('expected the lock to be acquired');

  return lease;
}

describe('IngestionLockService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns null when the lock is held by someone else', async () => {
    const service = createService({
      acquire: vi.fn().mockResolvedValue(false),
    });

    await expect(service.acquire(OWNER)).resolves.toBeNull();
  });

  it('extends the lease every third of the ttl', async () => {
    const extend = vi.fn().mockResolvedValue(true);
    const lease = await acquireLease({ extend });

    await vi.advanceTimersByTimeAsync(TTL_MS);

    expect(extend).toHaveBeenCalledTimes(HEARTBEATS_PER_TTL);
    expect(extend).toHaveBeenCalledWith(OWNER, TTL_MS);
    expect(lease.lost.aborted).toBe(false);
  });

  it('signals a lost lease when it can no longer be extended', async () => {
    const lease = await acquireLease({
      extend: vi.fn().mockResolvedValue(false),
    });

    await vi.advanceTimersByTimeAsync(TTL_MS / HEARTBEATS_PER_TTL);

    expect(lease.lost.aborted).toBe(true);
    expect((lease.lost.reason as Error).message).toBe(
      'ingestion lock was taken over by another run',
    );
  });

  it('signals a lost lease when the heartbeat cannot reach the database', async () => {
    const databaseDown = new Error('database unavailable');
    const lease = await acquireLease({
      extend: vi.fn().mockRejectedValue(databaseDown),
    });

    await vi.advanceTimersByTimeAsync(TTL_MS / HEARTBEATS_PER_TTL);

    expect(lease.lost.reason).toBe(databaseDown);
  });

  it('stops the heartbeat and deletes the lock on release', async () => {
    const extend = vi.fn().mockResolvedValue(true);
    const release = vi.fn().mockResolvedValue(undefined);
    const lease = await acquireLease({ extend, release });

    await lease.release();
    await vi.advanceTimersByTimeAsync(TTL_MS);

    expect(release).toHaveBeenCalledWith(OWNER);
    expect(extend).not.toHaveBeenCalled();
  });

  it('does not throw when the lock cannot be deleted', async () => {
    const lease = await acquireLease({
      release: vi.fn().mockRejectedValue(new Error('database unavailable')),
    });

    await expect(lease.release()).resolves.toBeUndefined();
  });
});
