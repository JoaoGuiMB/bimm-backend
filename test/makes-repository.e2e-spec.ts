import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Model } from 'mongoose';
import { ConfigModule } from '../src/core/config/config.module.js';
import { DatabaseModule } from '../src/core/database/database.module.js';
import { MakesModule } from '../src/makes/makes.module.js';
import { MakesReader } from '../src/makes/contracts/makes.reader.js';
import { MakesWriter } from '../src/makes/contracts/makes.writer.js';
import type { VehicleMake } from '../src/makes/entities/vehicle-make.entity.js';
import { Make } from '../src/makes/schemas/make.schema.js';

const PASSENGER_CAR = 2;
const TRAILER = 6;
const MPV = 7;

const FIRST_RUN = new Date('2026-10-01');
const SECOND_RUN = new Date('2026-10-02');

const make = (
  makeId: number,
  makeName: string,
  typeIds: number[] = [],
): VehicleMake => ({
  makeId,
  makeName,
  vehicleTypes: typeIds.map((typeId) => ({
    typeId,
    typeName: `TYPE ${typeId}`,
  })),
});

const makeIds = (makes: VehicleMake[]) => makes.map(({ makeId }) => makeId);

describe('MongoMakesRepository', () => {
  let moduleRef: TestingModule;
  let reader: MakesReader;
  let writer: MakesWriter;
  let makeModel: Model<Make>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, MakesModule],
    }).compile();
    await moduleRef.init();

    reader = moduleRef.get(MakesReader);
    writer = moduleRef.get(MakesWriter);
    makeModel = moduleRef.get(getModelToken(Make.name));

    await makeModel.syncIndexes();
  });

  afterAll(() => moduleRef.close());

  beforeEach(() => makeModel.deleteMany({}));

  it('upserts the same makes twice without duplicating them', async () => {
    const astonMartin = make(440, 'ASTON MARTIN', [PASSENGER_CAR]);
    const tesla = make(441, 'TESLA', [PASSENGER_CAR, MPV]);
    const makes = [astonMartin, tesla];

    await writer.upsertMany(makes, FIRST_RUN);
    const outcome = await writer.upsertMany(makes, SECOND_RUN);

    expect(outcome).toEqual({ written: makes.length, failedMakeIds: [] });
    expect(await makeModel.countDocuments()).toBe(makes.length);
    expect(await reader.findByMakeId(tesla.makeId)).toEqual(tesla);
  });

  it('replaces the stored vehicle types and name on upsert', async () => {
    const before = make(440, 'ASTON', [PASSENGER_CAR]);
    const after = make(before.makeId, 'ASTON MARTIN', [MPV]);

    await writer.upsertMany([before], FIRST_RUN);
    await writer.upsertMany([after], SECOND_RUN);

    expect(await reader.findByMakeId(before.makeId)).toEqual(after);
  });

  it('pages through makes in makeId order', async () => {
    const first = make(1, 'A');
    const second = make(2, 'B');
    const third = make(3, 'C');
    const pageSize = 2;
    await writer.upsertMany([third, first, second], FIRST_RUN);

    const firstPage = await reader.findPage({ filter: {}, limit: pageSize });
    const secondPage = await reader.findPage({
      filter: {},
      afterMakeId: second.makeId,
      limit: pageSize,
    });

    expect(makeIds(firstPage)).toEqual([first.makeId, second.makeId]);
    expect(makeIds(secondPage)).toEqual([third.makeId]);
  });

  it('filters by name prefix and treats regex characters literally', async () => {
    const namePrefix = 'A.';
    const literalMatch = make(1, 'A.B TRAILERS');
    const regexOnlyMatch = make(2, 'AXB TRAILERS');
    const containsPrefix = make(3, 'B.A');
    await writer.upsertMany(
      [literalMatch, regexOnlyMatch, containsPrefix],
      FIRST_RUN,
    );

    const makes = await reader.findPage({ filter: { namePrefix }, limit: 10 });

    expect(makeIds(makes)).toEqual([literalMatch.makeId]);
    expect(await reader.count({ namePrefix })).toBe(1);
  });

  it('does not fail on a prefix that is an invalid regex', async () => {
    const namePrefix = '(';
    await writer.upsertMany([make(1, '(BRACKET) MOTORS')], FIRST_RUN);

    expect(await reader.count({ namePrefix })).toBe(1);
  });

  it('filters by vehicle type', async () => {
    const carsOnly = make(1, 'A', [PASSENGER_CAR]);
    const trailersOnly = make(2, 'B', [TRAILER]);
    const carsAndTrailers = make(3, 'C', [PASSENGER_CAR, TRAILER]);
    await writer.upsertMany(
      [carsOnly, trailersOnly, carsAndTrailers],
      FIRST_RUN,
    );

    const makes = await reader.findPage({
      filter: { vehicleTypeId: TRAILER },
      limit: 10,
    });

    expect(makeIds(makes)).toEqual([
      trailersOnly.makeId,
      carsAndTrailers.makeId,
    ]);
  });

  it('combines filters', async () => {
    const filter = { namePrefix: 'A', vehicleTypeId: TRAILER };
    const prefixOnly = make(1, 'AB', [PASSENGER_CAR]);
    const bothMatch = make(2, 'AC', [TRAILER]);
    const typeOnly = make(3, 'BA', [TRAILER]);
    await writer.upsertMany([prefixOnly, bothMatch, typeOnly], FIRST_RUN);

    const makes = await reader.findPage({ filter, limit: 10 });

    expect(makeIds(makes)).toEqual([bothMatch.makeId]);
    expect(await reader.count(filter)).toBe(1);
  });

  it('deletes only makes last written before the given time', async () => {
    const stale = make(1, 'OLD');
    const fresh = make(2, 'NEW');
    await writer.upsertMany([stale], FIRST_RUN);
    await writer.upsertMany([fresh], SECOND_RUN);

    const deleted = await writer.deleteNotIngestedSince(SECOND_RUN);

    expect(deleted).toBe(1);
    expect(await reader.findByMakeId(stale.makeId)).toBeNull();
    expect(await reader.findByMakeId(fresh.makeId)).toEqual(fresh);
  });
});
