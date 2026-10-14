import { z } from 'zod';

export const APP_ENVS = [
  'development',
  'test',
  'staging',
  'production',
] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

interface EnvDefaults {
  logLevel: LogLevel;
  logPretty: boolean;
  graphqlPlayground: boolean;
  mongodbUri?: string;
}

const ENV_DEFAULTS: Record<AppEnv, EnvDefaults> = {
  development: {
    logLevel: 'debug',
    logPretty: true,
    graphqlPlayground: true,
    mongodbUri: 'mongodb://localhost:27017/bimm',
  },
  test: { logLevel: 'silent', logPretty: false, graphqlPlayground: false },
  staging: { logLevel: 'info', logPretty: false, graphqlPlayground: true },
  production: { logLevel: 'info', logPretty: false, graphqlPlayground: false },
};

const mongodbUri = z
  .string()
  .regex(
    /^mongodb(\+srv)?:\/\//,
    'must start with mongodb:// or mongodb+srv://',
  );

function envSchema(appEnv: AppEnv) {
  const defaults = ENV_DEFAULTS[appEnv];
  return z
    .object({
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      LOG_LEVEL: z.enum(LOG_LEVELS).default(defaults.logLevel),
      LOG_PRETTY: z.stringbool().default(defaults.logPretty),
      MONGODB_URI: defaults.mongodbUri
        ? mongodbUri.default(defaults.mongodbUri)
        : mongodbUri,
      GRAPHQL_PLAYGROUND: z.stringbool().default(defaults.graphqlPlayground),
      VPIC_BASE_URL: z
        .url({ protocol: /^https?$/ })
        .default('https://vpic.nhtsa.dot.gov/api/vehicles'),
      VPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
      VPIC_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
      VPIC_REQUESTS_PER_SECOND: z.coerce.number().positive().max(50).default(4),
      INGESTION_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(4),
      INGESTION_BATCH_SIZE: z.coerce
        .number()
        .int()
        .min(1)
        .max(5000)
        .default(500),
      INGESTION_MAX_FAILURE_RATIO: z.coerce.number().min(0).max(1).default(0.1),
      INGESTION_LOCK_TTL_MS: z.coerce.number().int().min(1000).default(120_000),
    })
    .transform((env) => ({
      app: { env: appEnv, port: env.PORT },
      log: { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY },
      mongo: { uri: env.MONGODB_URI },
      graphql: { playground: env.GRAPHQL_PLAYGROUND },
      vpic: {
        baseUrl: env.VPIC_BASE_URL,
        timeoutMs: env.VPIC_TIMEOUT_MS,
        retryAttempts: env.VPIC_RETRY_ATTEMPTS,
        requestsPerSecond: env.VPIC_REQUESTS_PER_SECOND,
      },
      ingestion: {
        concurrency: env.INGESTION_CONCURRENCY,
        batchSize: env.INGESTION_BATCH_SIZE,
        maxFailureRatio: env.INGESTION_MAX_FAILURE_RATIO,
        lockTtlMs: env.INGESTION_LOCK_TTL_MS,
      },
    }));
}

export type AppConfig = z.output<ReturnType<typeof envSchema>>;

export function parseConfig(rawEnv: Record<string, unknown>): AppConfig {
  const env = Object.fromEntries(
    Object.entries(rawEnv).filter(([, value]) => value !== ''),
  );

  const appEnv = z.enum(APP_ENVS).default('development').safeParse(env.APP_ENV);
  if (!appEnv.success) {
    throw new Error(`invalid configuration:\n${z.prettifyError(appEnv.error)}`);
  }

  const parsed = envSchema(appEnv.data).safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
}
