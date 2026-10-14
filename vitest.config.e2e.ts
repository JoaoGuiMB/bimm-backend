import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/mongo-global-setup.ts'],
    setupFiles: ['./test/silence-nest-logger.ts', './test/e2e-env.ts'],
    hookTimeout: 60_000,
  },
});
