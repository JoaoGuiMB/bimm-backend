import type { VehicleType } from '../../makes/entities/vehicle-make.entity.js';
import type { MakeSummaries } from '../parsing/vehicle-make.transformer.js';

export abstract class VpicClient {
  abstract fetchMakes(): Promise<MakeSummaries>;
  abstract fetchVehicleTypes(makeId: number): Promise<VehicleType[]>;
}
