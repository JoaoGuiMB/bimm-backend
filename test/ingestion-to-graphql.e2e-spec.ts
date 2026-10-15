import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { IngestionAppModule } from '../src/ingestion-app.module.js';
import { IngestionService } from '../src/ingestion/services/ingestion.service.js';
import { Make } from '../src/makes/schemas/make.schema.js';
import { vpicFetchStub } from './support/vpic-fetch-stub.js';

const PASSENGER_CAR = { typeId: 2, typeName: 'Passenger Car' };
const MPV = { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' };
const TRAILER_TYPE_ID = 6;

const ASTON_MARTIN = {
  makeId: 440,
  makeName: 'ASTON MARTIN',
  vehicleTypes: [PASSENGER_CAR, MPV],
};
const ALPINE_CUSTOMS_ID = 12858;
const FIXTURE_MAKE_IDS = [
  ASTON_MARTIN.makeId,
  8792,
  10980,
  11968,
  ALPINE_CUSTOMS_ID,
];

describe('ingestion to GraphQL', () => {
  let ingestion: INestApplicationContext;
  let app: INestApplication<App>;
  let connection: Connection;

  const graphql = (query: string, variables?: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/graphql').send({ query, variables });

  const ingest = () =>
    ingestion.get(IngestionService).run(new AbortController().signal);

  beforeAll(async () => {
    ingestion = await NestFactory.createApplicationContext(IngestionAppModule, {
      logger: false,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    connection = ingestion.get(getConnectionToken());
  });

  afterAll(async () => {
    await app.close();
    await ingestion.close();
  });

  beforeEach(async () => {
    vi.stubGlobal('fetch', vpicFetchStub());

    await Promise.all(
      Object.values(connection.collections).map((collection) =>
        collection.deleteMany({}),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ingests every make and serves it with its vehicle types', async () => {
    const summary = await ingest();

    const { body } = await graphql(
      `{ make(makeId: ${ASTON_MARTIN.makeId}) { makeId makeName vehicleTypes { typeId typeName } } }`,
    );

    expect(summary.status).toBe('completed');
    expect(summary.stats.makesWritten).toBe(FIXTURE_MAKE_IDS.length);
    expect(body).toEqual({ data: { make: ASTON_MARTIN } });
  });

  it('leaves identical documents after a second run', async () => {
    const makeModel = ingestion.get<Model<Make>>(getModelToken(Make.name));
    const storedMakes = async () =>
      (await makeModel.find().sort({ makeId: 1 }).lean()).map(
        ({ makeId, makeName, vehicleTypes }) => ({
          makeId,
          makeName,
          vehicleTypes,
        }),
      );
    await ingest();
    const firstRun = await storedMakes();

    await ingest();

    expect(await storedMakes()).toEqual(firstRun);
    expect(firstRun).toHaveLength(FIXTURE_MAKE_IDS.length);
  });

  it('pages through all makes with cursors', async () => {
    const pageSize = 2;
    const query = `query ($after: String) {
      makes(first: ${pageSize}, after: $after) { totalCount edges { node { makeId } } pageInfo { hasNextPage endCursor } }
    }`;
    const seen: number[] = [];
    const totalCounts: number[] = [];
    let after: string | null = null;
    let hasNextPage = true;
    await ingest();

    while (hasNextPage) {
      const { body } = await graphql(query, { after });
      const { edges, pageInfo, totalCount } = body.data.makes;
      seen.push(
        ...edges.map((edge: { node: { makeId: number } }) => edge.node.makeId),
      );
      totalCounts.push(totalCount);
      ({ hasNextPage, endCursor: after } = pageInfo);
    }

    expect(seen).toEqual(FIXTURE_MAKE_IDS.toSorted((a, b) => a - b));
    expect(new Set(totalCounts)).toEqual(new Set([FIXTURE_MAKE_IDS.length]));
  });

  it('filters by case-insensitive name prefix', async () => {
    const lowerCasePrefix = 'aston';
    await ingest();

    const { body } = await graphql(
      `{ makes(filter: { namePrefix: "${lowerCasePrefix}" }) { totalCount edges { node { makeName } } } }`,
    );

    expect(body.data.makes).toEqual({
      totalCount: 1,
      edges: [{ node: { makeName: ASTON_MARTIN.makeName } }],
    });
  });

  it('filters by vehicle type', async () => {
    await ingest();

    const { body } = await graphql(
      `{ makes(filter: { vehicleTypeId: ${TRAILER_TYPE_ID} }) { edges { node { makeId } } } }`,
    );

    expect(body.data.makes.edges).toEqual([
      { node: { makeId: ALPINE_CUSTOMS_ID } },
    ]);
  });

  it('treats explicit nulls as absent arguments', async () => {
    await ingest();

    const { body } = await graphql(
      '{ makes(after: null, filter: { namePrefix: null, vehicleTypeId: null }) { totalCount } }',
    );

    expect(body.data.makes.totalCount).toBe(FIXTURE_MAKE_IDS.length);
  });

  it('returns null for an unknown make', async () => {
    const unknownMakeId = Math.max(...FIXTURE_MAKE_IDS) + 1;
    await ingest();

    const { body } = await graphql(
      `{ make(makeId: ${unknownMakeId}) { makeId } }`,
    );

    expect(body).toEqual({ data: { make: null } });
  });

  it.each([
    ['a page size above 100', '{ makes(first: 101) { totalCount } }'],
    ['a page size of zero', '{ makes(first: 0) { totalCount } }'],
    ['an invalid cursor', '{ makes(after: "not-a-cursor") { totalCount } }'],
    [
      'an empty name prefix',
      '{ makes(filter: { namePrefix: "" }) { totalCount } }',
    ],
  ])('rejects %s as bad user input', async (_case, query) => {
    const { body } = await graphql(query);

    expect(body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  it('keeps the previous data of a make whose vehicle types fail', async () => {
    await ingest();
    vi.stubGlobal('fetch', vpicFetchStub([ASTON_MARTIN.makeId]));

    const summary = await ingest();
    const { body } = await graphql(
      `{ make(makeId: ${ASTON_MARTIN.makeId}) { vehicleTypes { typeId typeName } } }`,
    );

    expect(summary.status).toBe('completed');
    expect(summary.failedMakeIds).toEqual([ASTON_MARTIN.makeId]);
    expect(body.data.make.vehicleTypes).toEqual(ASTON_MARTIN.vehicleTypes);
  });
});
