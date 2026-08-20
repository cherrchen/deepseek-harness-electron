import { describe, expect, it } from 'vitest'
import { nextBetaTag } from '../scripts/next-beta-tag-lib.mjs'
import { assertResolvedWorkspaceDependencies, synchronizeDependencies } from '../scripts/sync-version-dependencies.mjs'

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

  it('rejects workspace dependencies that are absent from the workspace', () => {
    expect(() => assertResolvedWorkspaceDependencies(
      { '@deepseek-ai/dsh-missing': 'workspace:^' },
      new Set(['@deepseek-ai/dsh']),
    )).toThrow('Electron dependency @deepseek-ai/dsh-missing is not present in the workspace')
  })
})

describe('Electron beta tag planning', () => {
  it('increments beta.x independently within the upstream base version', () => {
    expect(nextBetaTag('0.1.0-rc.3', ['v0.1.0-beta.2', 'v0.1.0-beta.5'])).toBe('v0.1.0-beta.6')
    expect(nextBetaTag('0.1.0-rc.3', [])).toBe('v0.1.0-beta.1')
  })
})
