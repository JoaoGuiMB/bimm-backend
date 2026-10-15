import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { mongo, type Model, type QueryFilter } from 'mongoose';
import {
  MakesReader,
  type MakeFilter,
  type MakePageQuery,
} from '../contracts/makes.reader.js';
import type { MakesWriter, UpsertOutcome } from '../contracts/makes.writer.js';
import type { VehicleMake } from '../entities/vehicle-make.entity.js';
import { PersistenceError } from '../errors/persistence.error.js';
import { Make } from '../schemas/make.schema.js';
import { toVehicleMake } from './make.mapper.js';

@Injectable()
export class MongoMakesRepository extends MakesReader implements MakesWriter {
  constructor(@InjectModel(Make.name) private readonly makeModel: Model<Make>) {
    super();
  }

  async findPage({
    filter,
    afterMakeId,
    limit,
  }: MakePageQuery): Promise<VehicleMake[]> {
    const query = toMakeQuery(filter);

    if (afterMakeId !== undefined) {
      query.makeId = { $gt: afterMakeId };
    }

    const documents = await this.makeModel
      .find(query)
      .sort({ makeId: 1 })
      .limit(limit)
      .lean<Make[]>()
      .exec();

    return documents.map(toVehicleMake);
  }

  count(filter: MakeFilter): Promise<number> {
    return this.makeModel.countDocuments(toMakeQuery(filter)).exec();
  }

  async findByMakeId(makeId: number): Promise<VehicleMake | null> {
    const document = await this.makeModel
      .findOne({ makeId })
      .lean<Make>()
      .exec();

    return document ? toVehicleMake(document) : null;
  }

  async upsertMany(
    makes: VehicleMake[],
    ingestedAt: Date,
  ): Promise<UpsertOutcome> {
    const operations = makes.map((make) => ({
      updateOne: {
        filter: { makeId: make.makeId },
        update: {
          $set: {
            makeName: make.makeName,
            vehicleTypes: make.vehicleTypes,
            lastIngestedAt: ingestedAt,
          },
        },
        upsert: true,
      },
    }));

    try {
      await this.makeModel.bulkWrite(operations, { ordered: false });

      return { written: makes.length, failedMakeIds: [] };
    } catch (error) {
      if (error instanceof mongo.MongoBulkWriteError) {
        const writeErrors = Array.isArray(error.writeErrors)
          ? error.writeErrors
          : [error.writeErrors];

        const failedMakeIds = writeErrors.map(
          (writeError) => makes[writeError.index].makeId,
        );

        return { written: makes.length - failedMakeIds.length, failedMakeIds };
      }

      throw new PersistenceError(
        `failed to write ${makes.length} makes: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  async deleteNotIngestedSince(since: Date): Promise<number> {
    const { deletedCount } = await this.makeModel
      .deleteMany({ lastIngestedAt: { $lt: since } })
      .exec();

    return deletedCount;
  }
}

function toMakeQuery(filter: MakeFilter): QueryFilter<Make> {
  const query: QueryFilter<Make> = {};

  if (filter.namePrefix !== undefined) {
    query.makeName = { $regex: `^${RegExp.escape(filter.namePrefix)}` };
  }

  if (filter.vehicleTypeId !== undefined) {
    query['vehicleTypes.typeId'] = filter.vehicleTypeId;
  }

  return query;
}
