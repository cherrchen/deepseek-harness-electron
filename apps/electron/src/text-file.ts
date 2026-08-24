import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Read one UTF-8 file or return undefined when it does not exist. */
export async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Atomically rewrite a text file unless its content already matches.
 * Retries replacement on common transient Windows file-lock errors.
 * @param path - Absolute target path.
 * @param content - Complete next file content.
 * @returns Whether a write was committed.
 */
export async function writeTextFileAtomic(path: string, content: string): Promise<boolean> {
  const current = await readTextFile(path)
  if (current === content) return false
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  let delayMs = 20
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tempPath = `${path}.${randomBytes(6).toString('hex')}.tmp`
    try {
      await writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(tempPath, path)
      return true
    } catch (error) {
      await rm(tempPath, { force: true })
      if (!isRetryableAtomicWriteError(error) || attempt === 4) throw error
      await delay(delayMs)
      delayMs *= 2
    }
  }
  return false
}

function isRetryableAtomicWriteError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'EACCES' || code === 'EBUSY' || code === 'EPERM'
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
