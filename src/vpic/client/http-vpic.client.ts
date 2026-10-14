import { Injectable } from '@nestjs/common';
import {
  HttpClient,
  HttpClientError,
  HttpNetworkError,
  HttpResponseError,
  HttpTimeoutError,
} from '@nestjs/http-client';
import type { VehicleType } from '../../makes/entities/vehicle-make.entity.js';
import { VpicRequestError } from '../errors/vpic.errors.js';
import {
  toMakeSummaries,
  toVehicleTypes,
  type MakeSummaries,
} from '../parsing/vehicle-make.transformer.js';
import { VpicXmlParser } from '../parsing/vpic-xml.parser.js';
import { VpicClient } from './vpic.client.js';

@Injectable()
export class HttpVpicClient extends VpicClient {
  constructor(
    private readonly http: HttpClient,
    private readonly parser: VpicXmlParser,
  ) {
    super();
  }

  async fetchMakes(): Promise<MakeSummaries> {
    const xml = await this.getXml('getallmakes', {}, 'all makes');

    return toMakeSummaries(this.parser.parseMakes(xml));
  }

  async fetchVehicleTypes(makeId: number): Promise<VehicleType[]> {
    const xml = await this.getXml(
      'GetVehicleTypesForMakeId/:makeId',
      { makeId },
      `vehicle types for make ${makeId}`,
    );

    return toVehicleTypes(this.parser.parseVehicleTypes(xml));
  }

  private async getXml(
    path: string,
    params: Record<string, number>,
    description: string,
  ): Promise<string> {
    try {
      const response = await this.http.get(path, {
        params,
        query: { format: 'xml' },
        responseType: 'text',
      });

      return response.data;
    } catch (error) {
      if (error instanceof HttpClientError) {
        const status =
          error instanceof HttpResponseError ? error.status : undefined;

        throw new VpicRequestError(
          `failed to fetch ${description}: ${describeFailure(error)}`,
          status,
          { cause: error },
        );
      }

      throw error;
    }
  }
}

function describeFailure(error: HttpClientError): string {
  if (error instanceof HttpTimeoutError)
    return `timeout after ${error.timeoutMs}ms`;
  if (error instanceof HttpResponseError)
    return `upstream responded ${error.status}`;
  if (error instanceof HttpNetworkError)
    return `network error (${networkErrorCode(error)})`;

  return error.message;
}

function networkErrorCode(error: HttpNetworkError): string {
  const cause = error.cause as
    { code?: string; cause?: { code?: string } } | undefined;

  return cause?.code ?? cause?.cause?.code ?? 'unknown';
}
