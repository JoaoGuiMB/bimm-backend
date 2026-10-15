import { TransformationError } from '../errors/vpic.errors.js';
import { toMakeSummaries, toVehicleTypes } from './vehicle-make.transformer.js';

describe('toMakeSummaries', () => {
  it('converts ids to numbers and trims names', () => {
    const { makes, skipped } = toMakeSummaries([
      { Make_ID: '440', Make_Name: 'ASTON MARTIN' },
      { Make_ID: '10980', Make_Name: '4 W ' },
    ]);

    expect(makes).toEqual([
      { makeId: 440, makeName: 'ASTON MARTIN' },
      { makeId: 10980, makeName: '4 W' },
    ]);
    expect(skipped).toEqual([]);
  });

  it('skips records with a missing or non-numeric id and keeps the rest', () => {
    const bad = { Make_ID: 'abc', Make_Name: 'BROKEN' };
    const { makes, skipped } = toMakeSummaries([
      bad,
      { Make_Name: 'NO ID' },
      { Make_ID: '440', Make_Name: 'ASTON MARTIN' },
    ]);

    expect(makes).toEqual([{ makeId: 440, makeName: 'ASTON MARTIN' }]);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toBeInstanceOf(TransformationError);
    expect(skipped[0].record).toBe(bad);
  });

  it('skips records with an empty name', () => {
    const { makes, skipped } = toMakeSummaries([
      { Make_ID: '1', Make_Name: '   ' },
    ]);

    expect(makes).toEqual([]);
    expect(skipped).toHaveLength(1);
  });
});

describe('toVehicleTypes', () => {
  it('maps vPIC type records to vehicle types', () => {
    expect(
      toVehicleTypes([
        { VehicleTypeId: '2', VehicleTypeName: 'Passenger Car' },
      ]),
    ).toEqual([{ typeId: 2, typeName: 'Passenger Car' }]);
  });

  it('returns an empty list when the make has no types', () => {
    expect(toVehicleTypes([])).toEqual([]);
  });

  it('throws TransformationError if any type record is invalid', () => {
    expect(() =>
      toVehicleTypes([
        { VehicleTypeId: '2', VehicleTypeName: 'Passenger Car' },
        { VehicleTypeId: 'x' },
      ]),
    ).toThrow(TransformationError);
  });
});
