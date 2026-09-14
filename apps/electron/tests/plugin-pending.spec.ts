import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clearPluginPending,
  packagesPendingPath,
  readPluginPending,
  writePluginPending,
} from '../src/plugin-pending.ts'

describe('plugin pending marker', () => {
  it('writes, reads, and clears a well-formed marker under DSH_HOME/electron', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-pending-'))
    const path = packagesPendingPath(root)
    mkdirSync(join(path, '..'), { recursive: true })
    try {
      expect(readPluginPending(path)).toBeUndefined()
      const written = await writePluginPending(path, 'add', 'github:owner/plugin')
      expect(readPluginPending(path)).toEqual(written)
      expect(written.command).toBe('add')
      expect(written.spec).toBe('github:owner/plugin')
      await clearPluginPending(path)
      expect(readPluginPending(path)).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a truncated marker so startup can require recovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-pending-invalid-'))
    const path = packagesPendingPath(root)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, '{ "command": "add" }\n', 'utf8')
    try {
      expect(() => readPluginPending(path)).toThrow(/invalid marker/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
