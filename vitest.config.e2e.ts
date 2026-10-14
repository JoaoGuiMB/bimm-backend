import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/support/mongo-global-setup.ts'],
    setupFiles: [
      './test/support/silence-nest-logger.ts',
      './test/support/e2e-env.ts',
    ],
    hookTimeout: 60_000,
  },
});
