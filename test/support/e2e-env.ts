import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';

process.env.APP_ENV = 'test';
process.env.MONGODB_URI = `${inject('mongoUri')}e2e-${randomUUID()}`;
