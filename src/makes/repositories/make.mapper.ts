import type { VehicleMake } from '../entities/vehicle-make.entity.js';
import type { Make } from '../schemas/make.schema.js';

export function toVehicleMake(document: Make): VehicleMake {
  return {
    makeId: document.makeId,
    makeName: document.makeName,
    vehicleTypes: document.vehicleTypes.map(({ typeId, typeName }) => ({
      typeId,
      typeName,
    })),
  };
}
