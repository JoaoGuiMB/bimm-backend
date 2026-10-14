import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import { XmlParseError } from '../errors/vpic.errors.js';

const MAKE_TAG = 'AllVehicleMakes';
const VEHICLE_TYPE_TAG = 'VehicleTypesForMakeIds';
const RECORD_PATHS = new Set(
  [MAKE_TAG, VEHICLE_TYPE_TAG].map((tag) => `Response.Results.${tag}`),
);

@Injectable()
export class VpicXmlParser {
  private readonly parser = new XMLParser({
    isArray: (_tagName, jPath) => RECORD_PATHS.has(jPath as string),
    parseTagValue: false,
  });

  parseMakes(xml: string): Record<string, unknown>[] {
    return this.parseRecords(xml, MAKE_TAG);
  }

  parseVehicleTypes(xml: string): Record<string, unknown>[] {
    return this.parseRecords(xml, VEHICLE_TYPE_TAG);
  }

  private parseRecords(
    xml: string,
    recordTag: string,
  ): Record<string, unknown>[] {
    try {
      SyntaxValidator.validate(xml);
    } catch (error) {
      throw new XmlParseError(`invalid xml: ${(error as Error).message}`, {
        cause: error,
      });
    }

    const document = this.parser.parse(xml) as {
      Response?: { Results?: unknown };
    };
    const results = document.Response?.Results;

    if (results === undefined) {
      throw new XmlParseError('missing Response.Results element');
    }

    if (results === '') {
      return [];
    }

    return (
      (results as Record<string, Record<string, unknown>[] | undefined>)[
        recordTag
      ] ?? []
    );
  }
}
