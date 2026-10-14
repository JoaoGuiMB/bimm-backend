import { readFixture } from '../../../test/support/fixtures.js';
import { XmlParseError } from '../errors/vpic.errors.js';
import { VpicXmlParser } from './vpic-xml.parser.js';

describe('VpicXmlParser', () => {
  const parser = new VpicXmlParser();

  it('parses every make record as a string-valued object', () => {
    const records = parser.parseMakes(readFixture('get-all-makes.xml'));

    expect(records).toHaveLength(5);
    expect(records).toContainEqual({
      Make_ID: '440',
      Make_Name: 'ASTON MARTIN',
    });
  });

  it('keeps a numeric-looking make name as a string', () => {
    const records = parser.parseMakes(readFixture('get-all-makes.xml'));

    expect(records).toContainEqual({ Make_ID: '11968', Make_Name: '818' });
  });

  it('decodes xml entities in names', () => {
    const records = parser.parseMakes(readFixture('get-all-makes.xml'));

    expect(records).toContainEqual({
      Make_ID: '8792',
      Make_Name: '3&1 ENTERPRISES, LLC DBA IMPACT TRAILERS',
    });
  });

  it('returns a list when the make has a single vehicle type', () => {
    const records = parser.parseVehicleTypes(
      readFixture('vehicle-types-12858.xml'),
    );

    expect(records).toEqual([
      { VehicleTypeId: '6', VehicleTypeName: 'Trailer' },
    ]);
  });

  it('returns every vehicle type when the make has several', () => {
    const records = parser.parseVehicleTypes(
      readFixture('vehicle-types-440.xml'),
    );

    expect(records).toEqual([
      { VehicleTypeId: '2', VehicleTypeName: 'Passenger Car' },
      {
        VehicleTypeId: '7',
        VehicleTypeName: 'Multipurpose Passenger Vehicle (MPV)',
      },
    ]);
  });

  it('returns an empty list for an empty <Results /> element', () => {
    expect(
      parser.parseVehicleTypes(readFixture('vehicle-types-empty.xml')),
    ).toEqual([]);
  });

  it('throws XmlParseError for malformed xml', () => {
    expect(() => parser.parseMakes('<Response><Results></Response>')).toThrow(
      XmlParseError,
    );
  });

  it('throws XmlParseError when the Results element is missing', () => {
    expect(() =>
      parser.parseMakes('<Response><Count>0</Count></Response>'),
    ).toThrow(/Results/);
  });
});
