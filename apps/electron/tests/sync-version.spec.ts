import { describe, expect, it } from 'vitest'
import { synchronizeDependencies } from '../scripts/sync-version-dependencies.mjs'

describe('Electron dependency synchronization', () => {
  it('replaces workspace dependencies and retains desktop registry dependencies', () => {
    const dependencies = synchronizeDependencies(
      {
        '@deepseek-ai/dsh-obsolete': 'workspace:^',
        'electron-updater': '^6.8.9',
      },
      ['@deepseek-ai/dsh', '@deepseek-ai/dsh-runtime'],
      new Set([
        '@deepseek-ai/dsh',
        '@deepseek-ai/dsh-obsolete',
        '@deepseek-ai/dsh-runtime',
      ]),
    )

    expect(dependencies).toEqual({
      '@deepseek-ai/dsh': 'workspace:^',
      '@deepseek-ai/dsh-runtime': 'workspace:^',
      'electron-updater': '^6.8.9',
    })
  })
})
