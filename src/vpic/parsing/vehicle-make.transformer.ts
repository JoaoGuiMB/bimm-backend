import { z } from 'zod';
import type {
  VehicleMake,
  VehicleType,
} from '../../makes/entities/vehicle-make.entity.js';
import { TransformationError } from '../errors/vpic.errors.js';

export type MakeSummary = Omit<VehicleMake, 'vehicleTypes'>;

export interface MakeSummaries {
  makes: MakeSummary[];
  skipped: TransformationError[];
}

const makeRecord = z.object({
  Make_ID: z.coerce.number().int().positive(),
  Make_Name: z.string().trim().min(1),
});

const vehicleTypeRecord = z.object({
  VehicleTypeId: z.coerce.number().int().positive(),
  VehicleTypeName: z.string().trim().min(1),
});

export function toMakeSummaries(records: unknown[]): MakeSummaries {
  const makes: MakeSummary[] = [];
  const skipped: TransformationError[] = [];

  for (const record of records) {
    const parsed = makeRecord.safeParse(record);

    if (parsed.success) {
      makes.push({
        makeId: parsed.data.Make_ID,
        makeName: parsed.data.Make_Name,
      });
    } else {
      skipped.push(
        new TransformationError(
          `invalid make record: ${z.prettifyError(parsed.error)}`,
          record,
        ),
      );
    }
  }

  return { makes, skipped };
}

export function toVehicleTypes(records: unknown[]): VehicleType[] {
  return records.map((record) => {
    const parsed = vehicleTypeRecord.safeParse(record);

    if (!parsed.success) {
      throw new TransformationError(
        `invalid vehicle type record: ${z.prettifyError(parsed.error)}`,
        record,
      );
    }

    return {
      typeId: parsed.data.VehicleTypeId,
      typeName: parsed.data.VehicleTypeName,
    };
  });
}
