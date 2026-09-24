import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { writeDesktopFileAtomic } from '../atomic-file.ts'
import type { DesktopSecureStorageState, SecretRef } from './domain.ts'
import { DesktopNetworkOperationError } from './errors.ts'

/** Narrow Electron safeStorage API used by the Desktop secret store. */
export interface SafeStorageApi {
  getSelectedStorageBackend(): 'basic_text' | 'gnome_libsecret' | 'kwallet' | 'kwallet5' | 'kwallet6' | 'unknown'
  isAsyncEncryptionAvailable(): Promise<boolean>
  encryptStringAsync(value: string): Promise<Buffer>
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>
}

/** Secret persistence used by the Network controller. */
export interface DesktopSecretStore {
  /** @returns current backend availability without exposing stored values. */
  status(): Promise<DesktopSecureStorageState>
  /** @param ref - validated secret reference. @param value - plaintext retained only for encryption. */
  put(ref: SecretRef, value: string): Promise<void>
  /** @param ref - validated secret reference. @returns decrypted value, or undefined when absent. */
  get(ref: SecretRef): Promise<string | undefined>
  /** @param ref - validated secret reference. */
  delete(ref: SecretRef): Promise<void>
}

/** Electron safeStorage-backed secret store with no plaintext fallback. */
export class SafeStorageSecretStore implements DesktopSecretStore {
  /**
   * @param root - Desktop-private directory for encrypted blobs.
   * @param safeStorage - Electron encryption adapter.
   * @param platform - Runtime platform used to interpret backend identity.
   */
  constructor(
    private readonly root: string,
    private readonly safeStorage: SafeStorageApi,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  /** @returns interpreted platform storage state. */
  async status(): Promise<DesktopSecureStorageState> {
    const available = await this.safeStorage.isAsyncEncryptionAvailable().catch(() => false)
    if (this.platform === 'linux') {
      const backend = this.safeStorage.getSelectedStorageBackend()
      if (backend === 'basic_text') {
        return { available, persistent: false, backend, warning: 'plaintext-backend' }
      }
      if (!available || backend === 'unknown') {
        return { available, persistent: false, backend, warning: available ? 'temporarily-unavailable' : 'unavailable' }
      }
      return { available: true, persistent: true, backend }
    }
    if (!available) return { available: false, persistent: false, warning: 'temporarily-unavailable' }
    return { available: true, persistent: true, backend: this.platform === 'darwin' ? 'keychain' : 'dpapi' }
  }

  /** Encrypt and atomically persist a secret. */
  async put(ref: SecretRef, value: string): Promise<void> {
    await this.requirePersistentStorage()
    const encrypted = await this.safeStorage.encryptStringAsync(value)
    await writeDesktopFileAtomic(this.pathFor(ref), `${encrypted.toString('base64')}\n`)
  }

  /** Decrypt a stored secret and rotate its ciphertext when Electron requests it. */
  async get(ref: SecretRef): Promise<string | undefined> {
    await this.requirePersistentStorage()
    let encoded: string
    try {
      encoded = await readFile(this.pathFor(ref), 'utf8')
    } catch (error) {
      if (isMissingFileError(error)) return undefined
      throw error
    }
    const encrypted = Buffer.from(encoded.trim(), 'base64')
    const decrypted = await this.safeStorage.decryptStringAsync(encrypted)
    if (decrypted.shouldReEncrypt) await this.put(ref, decrypted.result)
    return decrypted.result
  }

  /** Delete an encrypted blob without changing the Manual endpoint. */
  async delete(ref: SecretRef): Promise<void> {
    await rm(this.pathFor(ref), { force: true })
  }

  private async requirePersistentStorage(): Promise<void> {
    const state = await this.status()
    if (state.persistent) return
    throw new DesktopNetworkOperationError(
      state.warning === 'plaintext-backend' ? 'SECURE_STORAGE_PLAINTEXT_BACKEND' : 'SECURE_STORAGE_UNAVAILABLE',
      state.warning === 'plaintext-backend'
        ? 'Secure credential storage selected a plaintext backend.'
        : 'Secure credential storage is unavailable.',
    )
  }

  private pathFor(ref: SecretRef): string {
    if (!/^[a-z0-9._-]+$/u.test(ref)) throw new Error('desktop network: invalid secret reference')
    return join(this.root, `${ref}.secret`)
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
