import type { ArgumentMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Length,
  Max,
  ValidateNested,
} from 'class-validator';
import { GraphQLError } from 'graphql';
import { GraphqlValidationPipe } from './validation.pipe.js';

const MAX_PAGE_SIZE = 100;

class FilterInput {
  @IsOptional()
  @Length(1, 10)
  namePrefix?: string;
}

class PageArgs {
  @IsInt()
  @Max(MAX_PAGE_SIZE)
  first: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => FilterInput)
  filter?: FilterInput;
}

const ARGS: ArgumentMetadata = { type: 'body', metatype: PageArgs };

describe('GraphqlValidationPipe', () => {
  const pipe = new GraphqlValidationPipe();

  it('passes valid arguments through', async () => {
    const valid = { first: MAX_PAGE_SIZE, filter: { namePrefix: 'aston' } };

    await expect(pipe.transform(valid, ARGS)).resolves.toEqual(valid);
  });

  it('reports top-level and nested violations as one bad user input error', async () => {
    const invalid = { first: MAX_PAGE_SIZE + 1, filter: { namePrefix: '' } };

    const error: unknown = await pipe.transform(invalid, ARGS).catch((e) => e);

    expect(error).toBeInstanceOf(GraphQLError);
    expect((error as GraphQLError).extensions.code).toBe('BAD_USER_INPUT');
    expect((error as GraphQLError).message).toBe(
      `first must not be greater than ${MAX_PAGE_SIZE}; namePrefix must be longer than or equal to 1 characters`,
    );
  });
});
