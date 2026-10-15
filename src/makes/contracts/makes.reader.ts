import type { VehicleMake } from '../entities/vehicle-make.entity.js';

export interface MakeFilter {
  namePrefix?: string;
  vehicleTypeId?: number;
}

export interface MakePageQuery {
  filter: MakeFilter;
  afterMakeId?: number;
  limit: number;
}

export abstract class MakesReader {
  abstract findPage(query: MakePageQuery): Promise<VehicleMake[]>;
  abstract count(filter: MakeFilter): Promise<number>;
  abstract findByMakeId(makeId: number): Promise<VehicleMake | null>;
}
