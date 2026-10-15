import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';
import type { AppConfig } from '../core/config/config.schema.js';
import { HttpVpicClient } from './client/http-vpic.client.js';
import { RequestPacerInterceptor } from './client/request-pacer.interceptor.js';
import { VpicClient } from './client/vpic.client.js';
import { VpicXmlParser } from './parsing/vpic-xml.parser.js';

@Module({
  imports: [
    HttpClientModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const vpic = config.get('vpic', { infer: true });

        return {
          baseUrl: vpic.baseUrl,
          timeout: vpic.timeoutMs,
          retry: vpic.retryAttempts,
          interceptors: [new RequestPacerInterceptor(vpic.requestsPerSecond)],
        };
      },
    }),
  ],
  providers: [VpicXmlParser, { provide: VpicClient, useClass: HttpVpicClient }],
  exports: [VpicClient],
})
export class VpicModule {}
