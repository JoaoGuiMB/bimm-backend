import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { MakesArgs } from '../dto/makes.args.js';
import type { VehicleMake } from '../entities/vehicle-make.entity.js';
import { MakeConnection } from '../models/make-connection.model.js';
import { MakeModel } from '../models/make.model.js';
import {
  decodeMakeCursor,
  encodeMakeCursor,
} from '../pagination/make-cursor.js';
import { MakesService } from '../services/makes.service.js';

@Resolver(() => MakeModel)
export class MakesResolver {
  constructor(private readonly makesService: MakesService) {}

  @Query(() => MakeConnection, {
    description: 'Makes with their vehicle types, paginated by cursor.',
  })
  async makes(
    @Args() { first, after, filter }: MakesArgs,
  ): Promise<MakeConnection> {
    const afterMakeId = after == null ? undefined : decodeMakeCursor(after);
    if (afterMakeId === null) {
      throw new GraphQLError('invalid cursor', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const page = await this.makesService.findPage({
      first,
      afterMakeId,
      filter: {
        namePrefix: filter?.namePrefix ?? undefined,
        vehicleTypeId: filter?.vehicleTypeId ?? undefined,
      },
    });
    const edges = page.makes.map((make) => ({
      cursor: encodeMakeCursor(make.makeId),
      node: make,
    }));

    return {
      edges,
      totalCount: page.totalCount,
      pageInfo: {
        hasNextPage: page.hasNextPage,
        endCursor: edges.at(-1)?.cursor ?? null,
      },
    };
  }

  @Query(() => MakeModel, {
    nullable: true,
    description: 'One make by its NHTSA id, or null if it is unknown.',
  })
  make(
    @Args('makeId', { type: () => Int, description: 'NHTSA make id.' })
    makeId: number,
  ): Promise<VehicleMake | null> {
    return this.makesService.findByMakeId(makeId);
  }
}
