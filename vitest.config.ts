import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/generated/**',
      '**/generated-types/**',
      'tests/browser/**',
    ],
    globals: false,
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'tests/unit/**/*.test.ts',
      'tests/property/**/*.test.ts',
      'tests/conformance/**/*.test.ts',
      'tests/conformance/**/*.conformance.ts',
      'tests/comet-contract/**/*.test.ts',
    ],
    mockReset: true,
    passWithNoTests: false,
    restoreMocks: true,
    testTimeout: 5_000,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
