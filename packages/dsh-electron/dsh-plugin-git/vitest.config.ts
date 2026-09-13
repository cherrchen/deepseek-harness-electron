import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    exclude: ['tests/client-bundle.spec.ts'],
    pool: 'forks',
    server: {
      deps: {
        inline: [/@deepseek-ai\/dsh-client-/],
      },
    },
  },
})
