import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DesktopPreferencesStore } from '../src/preferences.ts'
import { DesktopNetworkController } from '../src/network/controller.ts'
import type { DesktopSecretStore } from '../src/network/secret-store.ts'

describe('Desktop Network controller foundation', () => {
  it('prepares Default without activating a runtime', async () => {
    const fixture = await createFixture()
    await fixture.controller.prepare()
    expect(fixture.controller.state()).toMatchObject({
      configuredMode: 'default',
      effectiveMode: 'default',
      runtime: { status: 'inactive' },
    })
  })

  it('persists Manual state and a secret reference without serializing the password', async () => {
    const fixture = await createFixture()
    await fixture.controller.prepare()
    await expect(fixture.controller.saveAndRestart({
      mode: 'manual',
      manual: {
        protocol: 'https',
        host: 'proxy.example',
        port: 443,
        username: 'alice',
        passwordChange: { action: 'replace', value: 'secret-value' },
      },
      proxyAgentTraffic: true,
    })).rejects.toThrow('relaunched')
    const disk = await readFile(join(fixture.root, 'desktop-preferences.json'), 'utf8')
    expect(disk).not.toContain('secret-value')
    expect(disk).toContain('network.manual.proxy.password.v1')
    expect(fixture.secrets.put).toHaveBeenCalledWith('network.manual.proxy.password.v1', 'secret-value')
  })

  it('restores Default without deleting the retained Manual draft', async () => {
    const fixture = await createFixture()
    await fixture.preferences.updateNetwork({
      mode: 'manual',
      manual: { protocol: 'http', host: 'localhost', port: 7890 },
    })
    await fixture.controller.prepare()
    await expect(fixture.controller.restoreDefaultAndRestart()).rejects.toThrow('relaunched')
    expect(fixture.preferences.load().preferences.network).toMatchObject({
      mode: 'default', manual: { protocol: 'http', host: 'localhost', port: 7890 },
    })
  })
})

async function createFixture(): Promise<{
  root: string
  preferences: DesktopPreferencesStore
  secrets: DesktopSecretStore & { put: ReturnType<typeof vi.fn> }
  controller: DesktopNetworkController
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-electron-controller-'))
  const preferences = new DesktopPreferencesStore(root)
  const secrets = {
    status: vi.fn().mockResolvedValue({ available: true, persistent: true, backend: 'keychain' }),
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
  return {
    root,
    preferences,
    secrets,
    controller: new DesktopNetworkController({
      userDataPath: root,
      preferences,
      secrets,
      relaunch: async () => { throw new Error('relaunched') },
    }),
  }
}
