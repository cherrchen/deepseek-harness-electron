import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_UPDATE_CHANNEL, loadUpdateChannel, saveUpdateChannel } from '../src/preferences.ts'

describe('Electron desktop preferences', () => {
  it('defaults new users to the prerelease update channel', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-preferences-'))
    expect(loadUpdateChannel(root)).toBe(DEFAULT_UPDATE_CHANNEL)
  })

  it('persists stable and prerelease channel selections below Electron user data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-preferences-'))
    saveUpdateChannel(root, 'stable')
    expect(loadUpdateChannel(root)).toBe('stable')
    expect(JSON.parse(await readFile(join(root, 'desktop-preferences.json'), 'utf8'))).toEqual({ updateChannel: 'stable' })
    saveUpdateChannel(root, 'prerelease')
    expect(loadUpdateChannel(root)).toBe('prerelease')
  })
})
