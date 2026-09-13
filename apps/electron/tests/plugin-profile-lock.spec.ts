import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PluginRecoveryError } from '../src/plugin-recovery.ts'
import {
  PluginProfileLock,
  isProcessAlive,
  readLockOwner,
  unusedProcessId,
} from '../src/plugin-profile-lock.ts'

describe('plugin profile lock', () => {
  it('waits for a live owner and recycles a dead PID', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-lock-'))
    const path = join(root, 'profiles', 'web', 'lock')
    mkdirSync(join(path, '..'), { recursive: true })
    try {
      const first = new PluginProfileLock(path, 1_000, 10)
      await first.acquire()
      expect(readLockOwner(path)).toBe(process.pid)
      expect(isProcessAlive(process.pid)).toBe(true)

      const waiter = new PluginProfileLock(path, 1_000, 10)
      const waiting = waiter.acquire()
      first.release()
      await waiting
      expect(readLockOwner(path)).toBe(process.pid)
      waiter.release()

      writeFileSync(path, `${String(unusedProcessId())}\n`, { encoding: 'utf8', mode: 0o600 })
      const recycled = new PluginProfileLock(path, 200, 10)
      await recycled.acquire()
      expect(readLockOwner(path)).toBe(process.pid)
      recycled.release()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('times out while a live PID still holds the lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-lock-timeout-'))
    const path = join(root, 'profiles', 'web', 'lock')
    mkdirSync(join(path, '..'), { recursive: true })
    const holder = new PluginProfileLock(path, 1_000, 10)
    await holder.acquire()
    try {
      const waiter = new PluginProfileLock(path, 80, 10)
      const failure = await waiter.acquire().catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(PluginRecoveryError)
      expect((failure as PluginRecoveryError).reason).toBe('lock-timeout')
    } finally {
      holder.release()
      await rm(root, { recursive: true, force: true })
    }
  })
})
