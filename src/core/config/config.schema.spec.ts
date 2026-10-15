import { parseConfig } from './config.schema.js';

describe('parseConfig', () => {
  it('applies development defaults when nothing is set', () => {
    const config = parseConfig({});

    expect(config.app).toEqual({ env: 'development', port: 3000 });
    expect(config.log).toEqual({ level: 'debug', pretty: true });
    expect(config.mongo.uri).toBe('mongodb://localhost:27017/bimm');
    expect(config.graphql.playground).toBe(true);
    expect(config.vpic).toEqual({
      baseUrl: 'https://vpic.nhtsa.dot.gov/api/vehicles',
      timeoutMs: 10_000,
      retryAttempts: 3,
      requestsPerSecond: 4,
    });
    expect(config.ingestion).toEqual({
      concurrency: 4,
      batchSize: 500,
      maxFailureRatio: 0.1,
      lockTtlMs: 120_000,
    });
  });

  it('uses production defaults for logging and the playground', () => {
    const config = parseConfig({
      APP_ENV: 'production',
      MONGODB_URI: 'mongodb://db:27017/bimm',
    });

    expect(config.log).toEqual({ level: 'info', pretty: false });
    expect(config.graphql.playground).toBe(false);
  });

  it.each(['staging', 'production', 'test'])(
    'requires MONGODB_URI in %s',
    (appEnv) => {
      expect(() => parseConfig({ APP_ENV: appEnv })).toThrow(/MONGODB_URI/);
    },
  );

  it('coerces numbers and booleans from strings', () => {
    const config = parseConfig({
      PORT: '8080',
      LOG_PRETTY: 'false',
      INGESTION_MAX_FAILURE_RATIO: '0.25',
    });

    expect(config.app.port).toBe(8080);
    expect(config.log.pretty).toBe(false);
    expect(config.ingestion.maxFailureRatio).toBe(0.25);
  });

  it('reports every invalid variable at once', () => {
    let message = '';
    try {
      parseConfig({
        PORT: 'abc',
        LOG_LEVEL: 'loud',
        VPIC_BASE_URL: 'ftp://example.com',
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('VPIC_BASE_URL');
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => parseConfig({ APP_ENV: 'qa' })).toThrow(
      /APP_ENV|invalid configuration/,
    );
  });

  it('treats empty values as unset', () => {
    const config = parseConfig({
      APP_ENV: '',
      PORT: '',
      LOG_LEVEL: '',
      LOG_PRETTY: '',
      MONGODB_URI: '',
    });

    expect(config.app).toEqual({ env: 'development', port: 3000 });
    expect(config.log).toEqual({ level: 'debug', pretty: true });
    expect(config.mongo.uri).toBe('mongodb://localhost:27017/bimm');
  });

  it('rejects a database URI that is not a mongodb URI', () => {
    expect(() =>
      parseConfig({ MONGODB_URI: 'postgres://localhost/db' }),
    ).toThrow(/MONGODB_URI/);
  });
});
