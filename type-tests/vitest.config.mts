// Runs the type tests: *.test-d.ts files, which the compiler checks and Vitest never executes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [],
    typecheck: {
      enabled: true,
      only: true,
      include: ['type-tests/**/*.test-d.ts'],
      tsconfig: 'type-tests/tsconfig.json',
    },
  },
});
