import {
  closeSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { HARNESS_START_TIMEOUT_MS } from './runtime.ts'
import { PluginRecoveryError } from './plugin-recovery.ts'

/** Cross-process exclusive lock for Desktop-owned `dsh plugin` mutations. */
export class PluginProfileLock {
  private descriptor: number | undefined

  /**
   * @param path - Absolute lock file path.
   * @param waitTimeoutMs - How long a new instance waits for a live owner.
   * @param pollIntervalMs - Poll interval while waiting.
   */
  constructor(
    private readonly path: string,
    private readonly waitTimeoutMs = HARNESS_START_TIMEOUT_MS,
    private readonly pollIntervalMs = 50,
  ) {}

  /**
   * Create the lock file exclusively, waiting while a live PID holds it.
   * Recycles a stale lock only after `process.kill(pid, 0)` fails with ESRCH.
   * @returns After this process owns the lock file.
   */
  async acquire(): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const deadline = Date.now() + this.waitTimeoutMs
    for (;;) {
      try {
        this.descriptor = openSync(this.path, 'wx', 0o600)
        this.writeOwner(process.pid)
        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (!ownerIsAlive(this.path)) {
          unlinkSync(this.path)
          continue
        }
        if (Date.now() >= deadline) {
          throw new PluginRecoveryError(
            'Another Desktop package transaction is still running.',
            'lock-timeout',
            `Lock owner is still alive at ${this.path}`,
          )
        }
        await delay(this.pollIntervalMs)
      }
    }
  }

  /**
   * Record the process that currently owns the package transaction.
   * Main writes its PID on acquire and after the child exits; it writes the
   * `dsh plugin` child PID for the duration of that subprocess.
   * @param pid - Owner process id.
   */
  writeOwner(pid: number): void {
    const descriptor = this.descriptor
    if (descriptor === undefined) throw new Error('plugin profile lock: transaction lost its lock')
    const content = Buffer.from(`${String(pid)}\n`)
    ftruncateSync(descriptor, 0)
    writeSync(descriptor, content, 0, content.byteLength, 0)
    fsyncSync(descriptor)
  }

  /**
   * Close the descriptor and delete the lock file after a settled mutation.
   */
  release(): void {
    const descriptor = this.descriptor
    if (descriptor === undefined) return
    this.descriptor = undefined
    closeSync(descriptor)
    try {
      unlinkSync(this.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  /**
   * Close the descriptor without deleting the lock, after writing a dead owner.
   * Crash-injection tests use this to leave a recyclable lock on disk.
   * @param pid - Owner recorded for the next instance.
   */
  abandon(pid: number): void {
    this.writeOwner(pid)
    const descriptor = this.descriptor
    if (descriptor === undefined) return
    this.descriptor = undefined
    closeSync(descriptor)
  }
}

/**
 * Resolve the web-profile lock path.
 * @param harnessHome - Active DSH home.
 * @param profile - Profile directory name.
 * @returns Absolute lock path.
 */
export function profileLockPath(harnessHome: string, profile = 'web'): string {
  return join(harnessHome, 'profiles', profile, 'lock')
}

/**
 * Read the lock owner PID when the file is a regular file.
 * @param path - Absolute lock path.
 * @returns Owner PID, or undefined when the file is missing.
 */
export function readLockOwner(path: string): number | undefined {
  try {
    const lock = lstatSync(path)
    if (lock.isSymbolicLink() || !lock.isFile()) {
      throw new Error('plugin profile lock: lock is not a regular file')
    }
    const owner = Number.parseInt(readFileSync(path, 'utf8').trim(), 10)
    return Number.isSafeInteger(owner) ? owner : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Whether `process.kill(pid, 0)` reports a live process.
 * @param pid - Candidate process id.
 * @returns true when the process exists or signaling is denied.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/**
 * Find a PID that `process.kill` reports as missing.
 * @param start - First candidate.
 * @returns Unused process id.
 */
export function unusedProcessId(start = 1_000_000): number {
  for (let pid = start; pid < start + 10_000; pid += 1) {
    if (!isProcessAlive(pid)) return pid
  }
  throw new Error('plugin profile lock: could not find an unused process id')
}

function ownerIsAlive(path: string): boolean {
  const lock = lstatSync(path)
  if (lock.isSymbolicLink() || !lock.isFile()) {
    throw new Error('plugin profile lock: lock is not a regular file')
  }
  const owner = Number.parseInt(readFileSync(path, 'utf8').trim(), 10)
  if (!Number.isSafeInteger(owner) || owner <= 0) return true
  return isProcessAlive(owner)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
