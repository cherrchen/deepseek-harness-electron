import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    pool: 'forks',
    server: {
      deps: {
        inline: [/@deepseek-ai\/dsh-client-/],
      },
    },
  },
})
