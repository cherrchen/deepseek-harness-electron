import { access, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  consumeNetworkStartupOverride,
  startupOverridePath,
  writeDefaultStartupOverride,
} from '../src/network/startup-override.ts'

describe('Desktop Network one-shot startup override', () => {
  it('writes Default and consumes it exactly once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-override-'))
    await writeDefaultStartupOverride(root, () => new Date('2026-09-20T00:00:00.000Z'), () => 'nonce')
    await expect(consumeNetworkStartupOverride(root)).resolves.toEqual({
      override: { version: 1, mode: 'default', createdAt: '2026-09-20T00:00:00.000Z', nonce: 'nonce' },
    })
    await expect(consumeNetworkStartupOverride(root)).resolves.toEqual({})
  })

  it('deletes and ignores an invalid override', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-override-'))
    const path = startupOverridePath(root)
    await writeFile(path, '{"mode":"direct"}')
    const result = await consumeNetworkStartupOverride(root)
    expect(typeof result.warning).toBe('string')
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
