import { defineConfig } from 'vitest/config'

/** Built Runtime integration lane; prepare:network-runtime owns its executable dependency. */
export default defineConfig({
  test: {
    include: ['tests/*.runtime.e2e.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
})
