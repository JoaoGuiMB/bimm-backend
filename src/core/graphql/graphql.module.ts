import { join } from 'node:path';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import type { AppConfig } from '../config/config.schema.js';
import { GraphqlValidationPipe } from './validation.pipe.js';

const INTERNAL_ERROR = 'INTERNAL_SERVER_ERROR';

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const appEnv = config.get('app', { infer: true }).env;
        const { playground } = config.get('graphql', { infer: true });
        const logger = new Logger('GraphQL');

        return {
          autoSchemaFile:
            appEnv === 'development' ? join(process.cwd(), 'schema.gql') : true,
          sortSchema: true,
          graphiql: playground,
          introspection: playground,
          includeStacktraceInErrorResponses: appEnv === 'development',
          formatError: (formatted, error) => {
            if (formatted.extensions?.code !== INTERNAL_ERROR) {
              return formatted;
            }

            logger.error(
              { err: error, path: formatted.path },
              'unexpected graphql error',
            );

            return appEnv === 'development'
              ? formatted
              : {
                  message: 'Internal server error',
                  path: formatted.path,
                  extensions: { code: INTERNAL_ERROR },
                };
          },
        };
      },
    }),
  ],
  providers: [{ provide: APP_PIPE, useClass: GraphqlValidationPipe }],
})
export class GraphqlModule {}
