import { Injectable } from '@nestjs/common';
import { MakesReader, type MakeFilter } from '../contracts/makes.reader.js';
import type { VehicleMake } from '../entities/vehicle-make.entity.js';

export interface MakePageRequest {
  first: number;
  afterMakeId?: number;
  filter: MakeFilter;
}

export interface MakePage {
  makes: VehicleMake[];
  hasNextPage: boolean;
  totalCount: number;
}

@Injectable()
export class MakesService {
  constructor(private readonly reader: MakesReader) {}

  async findPage({
    first,
    afterMakeId,
    filter,
  }: MakePageRequest): Promise<MakePage> {
    const normalized = normalizeFilter(filter);
    const [makes, totalCount] = await Promise.all([
      this.reader.findPage({
        filter: normalized,
        afterMakeId,
        limit: first + 1,
      }),
      this.reader.count(normalized),
    ]);

    return {
      makes: makes.slice(0, first),
      hasNextPage: makes.length > first,
      totalCount,
    };
  }

  findByMakeId(makeId: number): Promise<VehicleMake | null> {
    return this.reader.findByMakeId(makeId);
  }
}

function normalizeFilter({
  namePrefix,
  vehicleTypeId,
}: MakeFilter): MakeFilter {
  const prefix = namePrefix?.trim().toUpperCase();

  return { namePrefix: prefix || undefined, vehicleTypeId };
}
