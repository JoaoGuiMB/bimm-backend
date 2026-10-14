import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { parseConfig } from './config.schema.js';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.APP_ENV ?? 'development'}`,
      validate: parseConfig,
    }),
  ],
})
export class ConfigModule {}
