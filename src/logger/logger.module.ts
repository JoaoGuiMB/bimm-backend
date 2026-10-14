import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { AppConfig } from '../config/config.schema.js';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const log = config.get('log', { infer: true });
        return {
          pinoHttp: {
            level: log.level,
            transport: log.pretty
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
