import { readFixture } from './fixtures.js';

const TYPES_PATH = /\/GetVehicleTypesForMakeId\/(\d+)$/;

const TYPE_FIXTURES = new Map([
  [440, 'vehicle-types-440.xml'],
  [12858, 'vehicle-types-12858.xml'],
]);

export function vpicFetchStub(
  failingMakeIds: number[] = [],
): typeof globalThis.fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname.endsWith('/getallmakes')) {
      return new Response(readFixture('get-all-makes.xml'));
    }

    const makeId = Number(TYPES_PATH.exec(url.pathname)?.[1]);
    if (failingMakeIds.includes(makeId)) {
      return new Response('Service Unavailable', { status: 503 });
    }

    return new Response(
      readFixture(TYPE_FIXTURES.get(makeId) ?? 'vehicle-types-empty.xml'),
    );
  };
}
