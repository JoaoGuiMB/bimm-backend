import { Field, Int, ObjectType } from '@nestjs/graphql';
import { MakeModel } from './make.model.js';

@ObjectType({ description: 'A make together with its pagination cursor.' })
export class MakeEdge {
  @Field({
    description:
      'Opaque cursor; pass it as `after` to continue after this make.',
  })
  cursor: string;

  @Field(() => MakeModel, { description: 'The make.' })
  node: MakeModel;
}

@ObjectType({ description: 'Pagination state of a connection.' })
export class PageInfo {
  @Field({ description: 'Whether more makes exist after this page.' })
  hasNextPage: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      'Cursor of the last make in this page, null for an empty page.',
  })
  endCursor: string | null;
}

@ObjectType({ description: 'A page of makes, ordered by makeId ascending.' })
export class MakeConnection {
  @Field(() => [MakeEdge], { description: 'Makes in this page.' })
  edges: MakeEdge[];

  @Field(() => PageInfo, { description: 'Pagination state.' })
  pageInfo: PageInfo;

  @Field(() => Int, {
    description: 'Total number of makes matching the filter, across all pages.',
  })
  totalCount: number;
}
