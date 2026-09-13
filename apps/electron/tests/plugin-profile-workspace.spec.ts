import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ensureWebProfileWorkspace,
  mergeWorkspacePolicy,
  WEB_PROFILE_ALLOW_BUILDS,
} from '../src/plugin-profile-workspace.ts'

describe('web profile workspace policy', () => {
  it('merges strictDepBuilds and reviewed allowBuilds without dropping user keys', () => {
    const merged = mergeWorkspacePolicy(`packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
allowBuilds:
  esbuild: true
  'user-native': true
`)
    expect(merged).toMatch(/^strictDepBuilds:\s*true$/m)
    expect(merged).toContain('esbuild: true')
    expect(merged).toContain("'user-native': true")
    expect(merged).toContain("'@google/genai': false")
    expect(merged).toContain('protobufjs: false')
    expect(merged).toContain('node-addon-require-builtin: false')
  })

  it('writes the policy file when the profile workspace is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-workspace-'))
    try {
      ensureWebProfileWorkspace(root)
      const text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
      expect(text).toContain('strictDepBuilds: true')
      for (const [name, allowed] of Object.entries(WEB_PROFILE_ALLOW_BUILDS)) {
        expect(text).toContain(`${name.startsWith('@') ? `'${name}'` : name}: ${String(allowed)}`)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
