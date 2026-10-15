import { Injectable, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { GraphQLError } from 'graphql';

@Injectable()
export class GraphqlValidationPipe extends ValidationPipe {
  constructor() {
    super({
      exceptionFactory: (errors) =>
        new GraphQLError(errors.flatMap(flattenConstraints).join('; '), {
          extensions: { code: 'BAD_USER_INPUT' },
        }),
    });
  }
}

function flattenConstraints(error: ValidationError): string[] {
  return [
    ...Object.values(error.constraints ?? {}),
    ...(error.children ?? []).flatMap(flattenConstraints),
  ];
}
