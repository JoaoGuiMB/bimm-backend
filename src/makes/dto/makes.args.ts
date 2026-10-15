import { ArgsType, Field, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MakeFilterInput } from './make-filter.input.js';

@ArgsType()
export class MakesArgs {
  @Field(() => Int, {
    defaultValue: 50,
    description: 'Number of makes to return, from 1 to 100.',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  first: number;

  @Field(() => String, {
    nullable: true,
    description:
      'Return makes after this cursor, taken from `pageInfo.endCursor`.',
  })
  @IsOptional()
  @IsString()
  after?: string | null;

  @Field(() => MakeFilterInput, {
    nullable: true,
    description: 'Restrict the makes returned.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MakeFilterInput)
  filter?: MakeFilterInput | null;
}
