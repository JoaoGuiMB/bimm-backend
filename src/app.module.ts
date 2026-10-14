import { Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { LoggerModule } from './logger/logger.module.js';

@Module({
  imports: [ConfigModule, LoggerModule],
})
export class AppModule implements OnApplicationShutdown {
  private readonly logger = new Logger(AppModule.name);

  onApplicationShutdown(signal?: string): void {
    this.logger.log({ signal }, 'api shutting down');
  }
}
