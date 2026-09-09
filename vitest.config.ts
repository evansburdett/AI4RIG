import { defineConfig } from 'vitest/config';

// One test runner for the whole monorepo. `npm test` from the repo root runs
// every *.test.ts in every workspace, so there is one command to remember and
// one place to configure it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/**/src/**/*.test.ts', 'packages/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Each suite that touches SQLite uses its own temp file, but keeping
    // things serial removes a whole category of confusing flakes.
    fileParallelism: false,
  },
});
