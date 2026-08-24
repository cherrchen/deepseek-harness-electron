import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@dsh-electron/dsh-client-ui-details-host/client': fileURLToPath(new URL('./tests/shims/details-host-client.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    exclude: ['tests/client-bundle.spec.ts'],
    pool: 'forks',
    setupFiles: ['./tests/setup/module-loader.ts'],
    server: {
      deps: {
        inline: [/@deepseek-ai\/dsh-client-/],
      },
    },
  },
})
