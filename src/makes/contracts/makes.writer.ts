import type { VehicleMake } from '../entities/vehicle-make.entity.js';

export interface UpsertOutcome {
  written: number;
  failedMakeIds: number[];
}

export abstract class MakesWriter {
  abstract upsertMany(
    makes: VehicleMake[],
    ingestedAt: Date,
  ): Promise<UpsertOutcome>;
  abstract deleteNotIngestedSince(since: Date): Promise<number>;
}
