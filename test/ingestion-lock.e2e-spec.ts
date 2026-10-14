import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Model } from 'mongoose';
import { ConfigModule } from '../src/core/config/config.module.js';
import { DatabaseModule } from '../src/core/database/database.module.js';
import { IngestionLockRepository } from '../src/ingestion/repositories/ingestion-lock.repository.js';
import { Lock, LockSchema } from '../src/ingestion/schemas/lock.schema.js';

const TTL_MS = 60_000;
const EXPIRED_TTL_MS = 1;

const waitFor = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('IngestionLockRepository', () => {
  let moduleRef: TestingModule;
  let locks: IngestionLockRepository;
  let lockModel: Model<Lock>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        DatabaseModule,
        MongooseModule.forFeature([{ name: Lock.name, schema: LockSchema }]),
      ],
      providers: [IngestionLockRepository],
    }).compile();
    await moduleRef.init();

    locks = moduleRef.get(IngestionLockRepository);
    lockModel = moduleRef.get(getModelToken(Lock.name));
  });

  afterAll(() => moduleRef.close());

  beforeEach(() => lockModel.deleteMany({}));

  it('lets only one run hold the lock', async () => {
    const acquired = await Promise.all([
      locks.acquire('run-a', TTL_MS),
      locks.acquire('run-b', TTL_MS),
    ]);

    expect(acquired.filter(Boolean)).toHaveLength(1);
  });

  it('lets a new run take over an expired lock', async () => {
    const crashedRun = 'crashed-run';
    const nextRun = 'next-run';
    await locks.acquire(crashedRun, EXPIRED_TTL_MS);
    await waitFor(EXPIRED_TTL_MS * 10);

    expect(await locks.acquire(nextRun, TTL_MS)).toBe(true);
    expect(await locks.extend(crashedRun, TTL_MS)).toBe(false);
  });

  it('extends only for the current owner', async () => {
    const owner = 'run-a';
    const other = 'run-b';
    await locks.acquire(owner, TTL_MS);

    expect(await locks.extend(owner, TTL_MS)).toBe(true);
    expect(await locks.extend(other, TTL_MS)).toBe(false);
  });

  it('releases only the owner’s lock', async () => {
    const owner = 'run-a';
    const other = 'run-b';
    const waiting = 'run-c';
    await locks.acquire(owner, TTL_MS);

    await locks.release(other);
    expect(await locks.acquire(waiting, TTL_MS)).toBe(false);

    await locks.release(owner);
    expect(await locks.acquire(waiting, TTL_MS)).toBe(true);
  });
});
