import { HttpClient } from '@nestjs/http-client';
import { readFixture } from '../../../test/support/fixtures.js';
import { VpicRequestError } from '../errors/vpic.errors.js';
import { VpicXmlParser } from '../parsing/vpic-xml.parser.js';
import { HttpVpicClient } from './http-vpic.client.js';

const BASE_URL = 'https://vpic.test/api/vehicles';

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/xml' },
  });
}

function createClient(
  fetch: typeof globalThis.fetch,
  timeout = 1000,
): HttpVpicClient {
  const http = new HttpClient({
    baseUrl: BASE_URL,
    fetch,
    timeout,
    retry: { attempts: 2, backoff: { delay: 0 } },
  });
  return new HttpVpicClient(http, new VpicXmlParser());
}

describe('HttpVpicClient', () => {
  it('requests all makes as xml and returns summaries', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(xmlResponse(readFixture('get-all-makes.xml')));

    const { makes, skipped } = await createClient(fetch).fetchMakes();

    expect(makes).toContainEqual({ makeId: 440, makeName: 'ASTON MARTIN' });
    expect(skipped).toEqual([]);
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/api/vehicles/getallmakes');
    expect(url.searchParams.get('format')).toBe('xml');
  });

  it('requests the vehicle types of one make', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(xmlResponse(readFixture('vehicle-types-440.xml')));

    const types = await createClient(fetch).fetchVehicleTypes(440);

    expect(types).toEqual([
      { typeId: 2, typeName: 'Passenger Car' },
      { typeId: 7, typeName: 'Multipurpose Passenger Vehicle (MPV)' },
    ]);
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/api/vehicles/GetVehicleTypesForMakeId/440');
  });

  it('retries a 503 and succeeds on the next attempt', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(xmlResponse('unavailable', 503))
      .mockResolvedValueOnce(
        xmlResponse(readFixture('vehicle-types-empty.xml')),
      );

    await expect(createClient(fetch).fetchVehicleTypes(1)).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws VpicRequestError naming the make when every attempt fails', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => xmlResponse('unavailable', 503));

    await expect(createClient(fetch).fetchVehicleTypes(440)).rejects.toThrow(
      'failed to fetch vehicle types for make 440: upstream responded 503',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('flags a 403 as throttling without retrying it', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => xmlResponse('Access Denied', 403));

    const error = await createClient(fetch)
      .fetchVehicleTypes(440)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(VpicRequestError);
    expect((error as VpicRequestError).isThrottled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a timeout with its limit', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );

    await expect(createClient(fetch, 20).fetchMakes()).rejects.toThrow(
      'failed to fetch all makes: timeout after 20ms',
    );
  });

  it('reports a network failure with its error code', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      }),
    );

    await expect(createClient(fetch).fetchMakes()).rejects.toThrow(
      /network error \(ECONNREFUSED\)/,
    );
  });
});
