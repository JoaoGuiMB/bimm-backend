import { Test } from '@nestjs/testing';
import {
  MakesReader,
  type MakeFilter,
  type MakePageQuery,
} from '../contracts/makes.reader.js';
import type { VehicleMake } from '../entities/vehicle-make.entity.js';
import { MakesService } from './makes.service.js';

const PASSENGER_CAR_ID = 2;

const ASTON_MARTIN: VehicleMake = {
  makeId: 440,
  makeName: 'ASTON MARTIN',
  vehicleTypes: [],
};
const TESLA: VehicleMake = { makeId: 441, makeName: 'TESLA', vehicleTypes: [] };
const JAGUAR: VehicleMake = {
  makeId: 442,
  makeName: 'JAGUAR',
  vehicleTypes: [],
};

const makeIds = (makes: VehicleMake[]) => makes.map(({ makeId }) => makeId);

class FakeMakesReader extends MakesReader {
  makes: VehicleMake[] = [];
  readonly pageQueries: MakePageQuery[] = [];
  readonly countFilters: MakeFilter[] = [];

  async findPage(query: MakePageQuery): Promise<VehicleMake[]> {
    this.pageQueries.push(query);

    return this.makes.slice(0, query.limit);
  }

  async count(filter: MakeFilter): Promise<number> {
    this.countFilters.push(filter);

    return this.makes.length;
  }

  async findByMakeId(makeId: number): Promise<VehicleMake | null> {
    return this.makes.find((make) => make.makeId === makeId) ?? null;
  }
}

describe('MakesService', () => {
  let reader: FakeMakesReader;
  let service: MakesService;

  beforeEach(async () => {
    reader = new FakeMakesReader();

    const moduleRef = await Test.createTestingModule({
      providers: [MakesService, { provide: MakesReader, useValue: reader }],
    }).compile();
    service = moduleRef.get(MakesService);
  });

  it('reports another page when more makes exist than requested', async () => {
    const firstPage = [ASTON_MARTIN, TESLA];
    reader.makes = [...firstPage, JAGUAR];

    const page = await service.findPage({
      first: firstPage.length,
      filter: {},
    });

    expect(makeIds(page.makes)).toEqual(makeIds(firstPage));
    expect(page.hasNextPage).toBe(true);
    expect(page.totalCount).toBe(reader.makes.length);
  });

  it('reports no further page on the last page', async () => {
    reader.makes = [ASTON_MARTIN, TESLA];

    const page = await service.findPage({
      first: reader.makes.length,
      filter: {},
    });

    expect(makeIds(page.makes)).toEqual(makeIds(reader.makes));
    expect(page.hasNextPage).toBe(false);
  });

  it('passes the cursor position to the reader', async () => {
    const afterMakeId = ASTON_MARTIN.makeId;

    await service.findPage({ first: 10, afterMakeId, filter: {} });

    expect(reader.pageQueries[0].afterMakeId).toBe(afterMakeId);
  });

  it('upper-cases and trims the name prefix for the page and the count', async () => {
    const typed = '  aston ';
    const expected = { namePrefix: 'ASTON', vehicleTypeId: PASSENGER_CAR_ID };

    await service.findPage({
      first: 10,
      filter: { namePrefix: typed, vehicleTypeId: PASSENGER_CAR_ID },
    });

    expect(reader.pageQueries[0].filter).toEqual(expected);
    expect(reader.countFilters[0]).toEqual(expected);
  });

  it('ignores a blank name prefix', async () => {
    const blank = '   ';

    await service.findPage({ first: 10, filter: { namePrefix: blank } });

    expect(reader.pageQueries[0].filter.namePrefix).toBeUndefined();
  });

  it('returns null for an unknown make id', async () => {
    reader.makes = [ASTON_MARTIN];
    const unknownMakeId = TESLA.makeId;

    await expect(service.findByMakeId(unknownMakeId)).resolves.toBeNull();
  });
});
