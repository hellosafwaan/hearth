import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // wxt's runtime import — tests get the controllable mock instead.
      '#imports': path.resolve(__dirname, 'tests/mocks/imports.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
