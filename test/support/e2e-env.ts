import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';

process.env.APP_ENV = 'test';
process.env.MONGODB_URI = `${inject('mongoUri')}e2e-${randomUUID()}`;
process.env.VPIC_REQUESTS_PER_SECOND = '50';
process.env.INGESTION_MAX_FAILURE_RATIO = '0.5';
