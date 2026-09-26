import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MANUAL_PROXY_PASSWORD_REF } from '../src/network/domain.ts'
import { SafeStorageSecretStore, type SafeStorageApi } from '../src/network/secret-store.ts'

describe('Desktop Network secret storage', () => {
  it('persists only encrypted bytes and round-trips through safeStorage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-secrets-'))
    const store = new SafeStorageSecretStore(root, fakeSafeStorage(), 'darwin')
    await store.put(MANUAL_PROXY_PASSWORD_REF, 'do-not-persist-plain')
    const disk = await readFile(join(root, `${MANUAL_PROXY_PASSWORD_REF}.secret`), 'utf8')
    expect(disk).not.toContain('do-not-persist-plain')
    expect(await store.get(MANUAL_PROXY_PASSWORD_REF)).toBe('do-not-persist-plain')
    await store.delete(MANUAL_PROXY_PASSWORD_REF)
    expect(await store.get(MANUAL_PROXY_PASSWORD_REF)).toBeUndefined()
  })

  it('rejects Linux basic_text without writing plaintext', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-secrets-'))
    const store = new SafeStorageSecretStore(root, fakeSafeStorage('basic_text'), 'linux')
    await expect(store.status()).resolves.toMatchObject({ persistent: false, warning: 'plaintext-backend' })
    await expect(store.put(MANUAL_PROXY_PASSWORD_REF, 'secret')).rejects.toMatchObject({
      code: 'SECURE_STORAGE_PLAINTEXT_BACKEND',
    })
  })

  it('does not contact the macOS Keychain until a stored password is used', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-secrets-'))
    try {
      const safeStorage = fakeSafeStorage()
      const availability = vi.spyOn(safeStorage, 'isAsyncEncryptionAvailable')
      const store = new SafeStorageSecretStore(root, safeStorage, 'darwin')
      await expect(store.status()).resolves.toMatchObject({ persistent: true, backend: 'keychain' })
      await expect(store.get(MANUAL_PROXY_PASSWORD_REF)).resolves.toBeUndefined()
      expect(availability).not.toHaveBeenCalled()

      await store.put(MANUAL_PROXY_PASSWORD_REF, 'secret')
      expect(availability).toHaveBeenCalledOnce()
      await expect(store.get(MANUAL_PROXY_PASSWORD_REF)).resolves.toBe('secret')
      expect(availability).toHaveBeenCalledTimes(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function fakeSafeStorage(
  backend: ReturnType<SafeStorageApi['getSelectedStorageBackend']> = 'gnome_libsecret',
): SafeStorageApi {
  return {
    getSelectedStorageBackend: () => backend,
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async value => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptStringAsync: async value => ({
      result: value.toString('utf8').replace(/^encrypted:/u, ''),
      shouldReEncrypt: false,
    }),
  }
}
