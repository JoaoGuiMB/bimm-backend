import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { AppConfig } from '../../core/config/config.schema.js';
import {
  MakesWriter,
  type UpsertOutcome,
} from '../../makes/contracts/makes.writer.js';
import type {
  VehicleMake,
  VehicleType,
} from '../../makes/entities/vehicle-make.entity.js';
import { VpicClient } from '../../vpic/client/vpic.client.js';
import {
  TransformationError,
  VpicRequestError,
} from '../../vpic/errors/vpic.errors.js';
import type {
  MakeSummaries,
  MakeSummary,
} from '../../vpic/parsing/vehicle-make.transformer.js';
import { IngestionLockedError } from '../errors/ingestion.errors.js';
import { IngestionRunRepository } from '../repositories/ingestion-run.repository.js';
import {
  IngestionLockService,
  type IngestionLease,
} from './ingestion-lock.service.js';
import { IngestionService } from './ingestion.service.js';

type StoredMake = VehicleMake & { lastIngestedAt: Date };

const SETTINGS: AppConfig['ingestion'] = {
  concurrency: 1,
  batchSize: 2,
  maxFailureRatio: 0.5,
  lockTtlMs: 60_000,
};

const WRITE_ERROR = 'connection reset';
const TAKEOVER_ERROR = 'ingestion lock was taken over by another run';
const PREVIOUS_RUN = new Date('2026-01-01');

const ASTON_MARTIN: MakeSummary = { makeId: 440, makeName: 'ASTON MARTIN' };
const TESLA: MakeSummary = { makeId: 441, makeName: 'TESLA' };
const ALPINE_CUSTOMS: MakeSummary = {
  makeId: 12858,
  makeName: '#1 ALPINE CUSTOMS',
};

const PASSENGER_CAR: VehicleType = { typeId: 2, typeName: 'Passenger Car' };
const TRAILER: VehicleType = { typeId: 6, typeName: 'Trailer' };

const storedMake = (
  make: MakeSummary,
  vehicleTypes: VehicleType[] = [],
): StoredMake => ({ ...make, vehicleTypes, lastIngestedAt: PREVIOUS_RUN });

const removedUpstream = () => storedMake({ makeId: 999, makeName: 'GONE' });

class FakeVpicClient extends VpicClient {
  makes: MakeSummaries = { makes: [], skipped: [] };
  makesError?: Error;
  readonly types = new Map<number, VehicleType[] | Error>();
  readonly requestedMakeIds: number[] = [];
  onFetchVehicleTypes?: (makeId: number) => void;

  async fetchMakes(): Promise<MakeSummaries> {
    if (this.makesError) throw this.makesError;

    return this.makes;
  }

  async fetchVehicleTypes(makeId: number): Promise<VehicleType[]> {
    this.requestedMakeIds.push(makeId);
    this.onFetchVehicleTypes?.(makeId);

    const types = this.types.get(makeId) ?? [];
    if (types instanceof Error) throw types;

    return types;
  }
}

class InMemoryMakesWriter extends MakesWriter {
  readonly stored = new Map<number, StoredMake>();
  failingWrites = 0;
  rejectedMakeIds = new Set<number>();

  async upsertMany(
    makes: VehicleMake[],
    ingestedAt: Date,
  ): Promise<UpsertOutcome> {
    if (this.failingWrites > 0) {
      this.failingWrites--;
      throw new Error(WRITE_ERROR);
    }

    const accepted = makes.filter(
      ({ makeId }) => !this.rejectedMakeIds.has(makeId),
    );
    for (const make of accepted) {
      this.stored.set(make.makeId, { ...make, lastIngestedAt: ingestedAt });
    }

    return {
      written: accepted.length,
      failedMakeIds: makes
        .map(({ makeId }) => makeId)
        .filter((makeId) => this.rejectedMakeIds.has(makeId)),
    };
  }

  async deleteNotIngestedSince(since: Date): Promise<number> {
    let deleted = 0;

    for (const [makeId, make] of this.stored) {
      if (make.lastIngestedAt < since) {
        this.stored.delete(makeId);
        deleted++;
      }
    }

    return deleted;
  }
}

describe('IngestionService', () => {
  let vpic: FakeVpicClient;
  let writer: InMemoryMakesWriter;
  let runs: {
    start: ReturnType<typeof vi.fn>;
    finish: ReturnType<typeof vi.fn>;
  };
  let lease: IngestionLease;
  let loseLease: (reason: Error) => void;
  let releaseLease: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let locks: { acquire: ReturnType<typeof vi.fn> };
  let service: IngestionService;

  beforeEach(async () => {
    vpic = new FakeVpicClient();
    writer = new InMemoryMakesWriter();
    runs = { start: vi.fn(), finish: vi.fn() };

    const lost = new AbortController();
    loseLease = (reason) => lost.abort(reason);
    releaseLease = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    lease = { lost: lost.signal, release: releaseLease };
    locks = { acquire: vi.fn().mockResolvedValue(lease) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: VpicClient, useValue: vpic },
        { provide: MakesWriter, useValue: writer },
        { provide: IngestionRunRepository, useValue: runs },
        { provide: IngestionLockService, useValue: locks },
        { provide: ConfigService, useValue: { get: () => SETTINGS } },
      ],
    })
      .setLogger(new ConsoleLogger({ logLevels: [] }))
      .compile();

    service = moduleRef.get(IngestionService);
  });

  const run = () => service.run(new AbortController().signal);

  it('stores every make with its vehicle types and completes', async () => {
    const makes = [ASTON_MARTIN, TESLA, ALPINE_CUSTOMS];
    vpic.makes = { makes, skipped: [] };
    vpic.types
      .set(ASTON_MARTIN.makeId, [PASSENGER_CAR])
      .set(ALPINE_CUSTOMS.makeId, [TRAILER]);

    const summary = await run();

    expect(summary.status).toBe('completed');
    expect(summary.stats).toEqual({
      makesFetched: makes.length,
      makesWritten: makes.length,
      makesFailed: 0,
      makesDeleted: 0,
      recordsSkipped: 0,
    });
    expect(writer.stored.get(ASTON_MARTIN.makeId)).toMatchObject({
      ...ASTON_MARTIN,
      vehicleTypes: [PASSENGER_CAR],
    });
    expect(writer.stored.get(TESLA.makeId)).toMatchObject({
      ...TESLA,
      vehicleTypes: [],
    });
    expect(runs.finish).toHaveBeenCalledWith(summary);
    expect(releaseLease).toHaveBeenCalled();
  });

  it('skips a make whose vehicle types fail and keeps its previous data', async () => {
    const previous = storedMake(ASTON_MARTIN, [PASSENGER_CAR]);
    writer.stored.set(previous.makeId, previous);
    vpic.makes = { makes: [ASTON_MARTIN, TESLA], skipped: [] };
    vpic.types.set(
      ASTON_MARTIN.makeId,
      new VpicRequestError(
        'failed to fetch vehicle types for make 440: timeout after 10000ms',
      ),
    );

    const summary = await run();

    expect(summary.status).toBe('completed');
    expect(summary.failedMakeIds).toEqual([ASTON_MARTIN.makeId]);
    expect(writer.stored.get(ASTON_MARTIN.makeId)).toBe(previous);
    expect(writer.stored.has(TESLA.makeId)).toBe(true);
  });

  it('does not delete anything after a run with a failed make', async () => {
    const removed = removedUpstream();
    writer.stored.set(removed.makeId, removed);
    vpic.makes = { makes: [ASTON_MARTIN, TESLA], skipped: [] };
    vpic.types.set(
      ASTON_MARTIN.makeId,
      new TransformationError('invalid vehicle type record', {}),
    );

    const summary = await run();

    expect(summary.stats.makesDeleted).toBe(0);
    expect(writer.stored.has(removed.makeId)).toBe(true);
  });

  it('deletes makes that disappeared upstream after a clean run', async () => {
    const removed = removedUpstream();
    writer.stored.set(removed.makeId, removed);
    vpic.makes = { makes: [ASTON_MARTIN], skipped: [] };

    const summary = await run();

    expect(summary.stats.makesDeleted).toBe(1);
    expect(writer.stored.has(removed.makeId)).toBe(false);
    expect(writer.stored.has(ASTON_MARTIN.makeId)).toBe(true);
  });

  it('does not delete anything when a make record was skipped', async () => {
    const removed = removedUpstream();
    const skipped = [
      new TransformationError('invalid make record', { Make_ID: 'x' }),
    ];
    writer.stored.set(removed.makeId, removed);
    vpic.makes = { makes: [ASTON_MARTIN], skipped };

    const summary = await run();

    expect(summary.status).toBe('completed');
    expect(summary.stats.recordsSkipped).toBe(skipped.length);
    expect(writer.stored.has(removed.makeId)).toBe(true);
  });

  it('aborts and stops requesting once failures exceed the allowed ratio', async () => {
    const makeIds = [1, 2, 3, 4, 5, 6];
    const maxFailures = makeIds.length * SETTINGS.maxFailureRatio;
    const requestedBeforeAbort = makeIds.slice(0, maxFailures + 1);
    vpic.makes = {
      makes: makeIds.map((makeId) => ({ makeId, makeName: `MAKE ${makeId}` })),
      skipped: [],
    };
    for (const makeId of makeIds) {
      vpic.types.set(makeId, new VpicRequestError(`make ${makeId} down`));
    }

    const summary = await run();

    expect(summary.status).toBe('failed');
    expect(summary.error).toBe(
      `too many failed makes: ${requestedBeforeAbort.length} of ${makeIds.length}`,
    );
    expect(vpic.requestedMakeIds).toEqual(requestedBeforeAbort);
  });

  it('aborts on the first throttled request instead of waiting for the failure ratio', async () => {
    vpic.makes = { makes: [ASTON_MARTIN, TESLA, ALPINE_CUSTOMS], skipped: [] };
    vpic.types.set(
      ASTON_MARTIN.makeId,
      new VpicRequestError(
        'failed to fetch vehicle types for make 440: upstream responded 403',
        403,
      ),
    );

    const summary = await run();

    expect(summary.status).toBe('failed');
    expect(summary.error).toMatch(/vPIC is throttling requests/);
    expect(vpic.requestedMakeIds).toEqual([ASTON_MARTIN.makeId]);
  });

  it('fails without writing anything when the make list cannot be fetched', async () => {
    const message = 'failed to fetch all makes: upstream responded 503';
    vpic.makesError = new VpicRequestError(message);

    const summary = await run();

    expect(summary.status).toBe('failed');
    expect(summary.error).toBe(message);
    expect(writer.stored.size).toBe(0);
    expect(releaseLease).toHaveBeenCalled();
  });

  it('retries a failed batch write and completes', async () => {
    vi.useFakeTimers();
    try {
      vpic.makes = { makes: [ASTON_MARTIN], skipped: [] };
      writer.failingWrites = 2;

      const pending = run();
      await vi.runAllTimersAsync();
      const summary = await pending;

      expect(summary.status).toBe('completed');
      expect(writer.stored.has(ASTON_MARTIN.makeId)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails when batch writes keep failing after retries', async () => {
    vi.useFakeTimers();
    try {
      const firstBatch = [ASTON_MARTIN, TESLA];
      vpic.makes = { makes: [...firstBatch, ALPINE_CUSTOMS], skipped: [] };
      writer.failingWrites = 3;

      const pending = run();
      await vi.runAllTimersAsync();
      const summary = await pending;

      expect(summary.status).toBe('failed');
      expect(summary.error).toBe(WRITE_ERROR);
      expect(vpic.requestedMakeIds).toEqual(
        firstBatch.map(({ makeId }) => makeId),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts makes rejected by the database as failed', async () => {
    vpic.makes = { makes: [ASTON_MARTIN, TESLA], skipped: [] };
    writer.rejectedMakeIds.add(TESLA.makeId);

    const summary = await run();

    expect(summary.stats.makesWritten).toBe(1);
    expect(summary.failedMakeIds).toEqual([TESLA.makeId]);
  });

  it('flushes fetched makes and marks the run interrupted on a shutdown signal', async () => {
    const interrupt = new AbortController();
    const fetchedBeforeSignal = [ASTON_MARTIN, TESLA];
    vpic.makes = {
      makes: [...fetchedBeforeSignal, ALPINE_CUSTOMS],
      skipped: [],
    };
    vpic.onFetchVehicleTypes = (makeId) => {
      if (makeId === TESLA.makeId) interrupt.abort();
    };

    const summary = await service.run(interrupt.signal);

    expect(summary.status).toBe('interrupted');
    expect([...writer.stored.keys()]).toEqual(
      fetchedBeforeSignal.map(({ makeId }) => makeId),
    );
    expect(vpic.requestedMakeIds).not.toContain(ALPINE_CUSTOMS.makeId);
    expect(releaseLease).toHaveBeenCalled();
  });

  it('fails when the lock is taken over mid-run', async () => {
    vpic.makes = { makes: [ASTON_MARTIN, TESLA, ALPINE_CUSTOMS], skipped: [] };
    vpic.onFetchVehicleTypes = () => loseLease(new Error(TAKEOVER_ERROR));

    const summary = await run();

    expect(summary.status).toBe('failed');
    expect(summary.error).toBe(TAKEOVER_ERROR);
    expect(vpic.requestedMakeIds).toEqual([ASTON_MARTIN.makeId]);
  });

  it('refuses to start while another run holds the lock', async () => {
    locks.acquire.mockResolvedValue(null);

    await expect(run()).rejects.toThrow(IngestionLockedError);
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('releases the lock when the run record cannot be created', async () => {
    const message = 'database unavailable';
    runs.start.mockRejectedValue(new Error(message));

    await expect(run()).rejects.toThrow(message);
    expect(releaseLease).toHaveBeenCalled();
  });
});
