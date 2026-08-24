import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/client-bundle.spec.ts'],
    pool: 'forks',
  },
})
