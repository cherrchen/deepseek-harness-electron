import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { migrateLegacyPluginState } from '../src/legacy-plugin-migration.ts'

function fixture(): { home: string; profileDir: string; electronDir: string } {
  const home = mkdtempSync(join(tmpdir(), 'dsh-electron-migration-'))
  const profileDir = join(home, 'profiles', 'web')
  const electronDir = join(home, 'electron')
  mkdirSync(join(profileDir, 'node_modules', '@example', 'enabled'), { recursive: true })
  mkdirSync(join(profileDir, 'node_modules', '@example', 'disabled'), { recursive: true })
  mkdirSync(electronDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {
    '@example/enabled': '1.0.0', '@example/disabled': '1.0.0',
  } }))
  for (const name of ['enabled', 'disabled']) {
    writeFileSync(join(profileDir, 'node_modules', '@example', name, 'package.json'),
      JSON.stringify({ name: `@example/${name}`, main: './lib/index.js' }))
  }
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '# User patch\n[]\n')
  writeFileSync(join(electronDir, 'plugin-state.json'), JSON.stringify({
    version: 2, disabled: ['@example/disabled'], profileManaged: ['@example/enabled', '@example/disabled'],
  }))
  return { home, profileDir, electronDir }
}

describe('legacy Desktop plugin migration', () => {
  it('moves enabled and disabled profile runtime plugins to the Web profile once', async () => {
    const { home, profileDir, electronDir } = fixture()
    try {
      await migrateLegacyPluginState(home)
      const patch = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')
      expect(patch).toContain('# User patch')
      expect(load(patch)).toEqual([
        { insert: [{ id: 'electron-migrated:@example/enabled', name: '@example/enabled' }] },
        { insert: [{ id: 'electron-migrated:@example/disabled', name: '@example/disabled', disabled: true }] },
      ])
      expect(existsSync(join(electronDir, 'plugin-state.json'))).toBe(true)
      expect(existsSync(join(electronDir, 'plugin-state-v2-migrated'))).toBe(true)
      writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n')
      await migrateLegacyPluginState(home)
      expect(readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')).toBe('[]\n')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('does not mark a failed migration as complete', async () => {
    const { home, profileDir, electronDir } = fixture()
    try {
      rmSync(join(profileDir, 'node_modules', '@example', 'enabled'), { recursive: true })
      await expect(migrateLegacyPluginState(home)).rejects.toThrow()
      expect(existsSync(join(electronDir, 'plugin-state-v2-migrated'))).toBe(false)
      expect(readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')).toBe('# User patch\n[]\n')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('does not duplicate rows if the patch was written before the marker', async () => {
    const { home, profileDir } = fixture()
    try {
      writeFileSync(join(profileDir, 'cordis.patch.yml'),
        '- insert:\n    - id: "electron-migrated:@example/enabled"\n      name: "@example/enabled"\n')
      await migrateLegacyPluginState(home)
      const patch: unknown = load(readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8'))
      expect(patch).toEqual([
        { insert: [{ id: 'electron-migrated:@example/enabled', name: '@example/enabled' }] },
        { insert: [{ id: 'electron-migrated:@example/disabled', name: '@example/disabled', disabled: true }] },
      ])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('accepts an empty legacy roster without requiring an initialized Web profile', async () => {
    const { home, profileDir, electronDir } = fixture()
    try {
      writeFileSync(join(electronDir, 'plugin-state.json'),
        JSON.stringify({ version: 2, disabled: [], profileManaged: [] }))
      rmSync(profileDir, { recursive: true })
      await migrateLegacyPluginState(home)
      expect(existsSync(join(electronDir, 'plugin-state-v2-migrated'))).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
