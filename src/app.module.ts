import { Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { LoggerModule } from './core/logger/logger.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, HealthModule],
})
export class AppModule implements OnApplicationShutdown {
  private readonly logger = new Logger(AppModule.name);

  onApplicationShutdown(signal?: string): void {
    this.logger.log({ signal }, 'api shutting down');
  }
}
