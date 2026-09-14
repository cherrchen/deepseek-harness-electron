import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { prepareStartupWorkspace } from '../src/plugin-startup.ts'
import { PluginProfileLock } from '../src/plugin-profile-lock.ts'
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
    expect(load(merged)).toMatchObject({ allowBuilds: { 'user-native': true } })
    expect(load(merged)).toMatchObject({ allowBuilds: WEB_PROFILE_ALLOW_BUILDS })
    expect(merged).toContain('protobufjs: false')
    expect(merged).toContain('node-addon-require-builtin: false')
  })

  it('merges inline and quoted keys while preserving user overrides and unrelated mappings', () => {
    const merged = mergeWorkspacePolicy('"strictDepBuilds": false\nallowBuilds: { esbuild: false, custom: true }\nother: { protobufjs: true }\n')
    expect(load(merged)).toEqual({
      strictDepBuilds: true,
      allowBuilds: { ...WEB_PROFILE_ALLOW_BUILDS, esbuild: false, custom: true },
      other: { protobufjs: true },
    })
    expect(mergeWorkspacePolicy(merged)).toBe(merged)
  })

  it.each(['[]', 'allowBuilds: []', 'allowBuilds: true', 'allowBuilds: {'])('rejects invalid policy %s', (text) => {
    expect(() => mergeWorkspacePolicy(text)).toThrow()
  })

  it('leaves workspace policy untouched while a live transaction owns the profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-workspace-'))
    const owner = new PluginProfileLock(join(root, 'lock'))
    try {
      const path = join(root, 'pnpm-workspace.yaml')
      const original = 'allowBuilds: { custom: true }\n'
      writeFileSync(path, original)
      await owner.acquire()
      await expect(prepareStartupWorkspace(root, new PluginProfileLock(join(root, 'lock'), 0, 1)))
        .rejects.toMatchObject({ reason: 'lock-timeout' })
      expect(readFileSync(path, 'utf8')).toBe(original)
      owner.release()
      await prepareStartupWorkspace(root, new PluginProfileLock(join(root, 'lock')))
      expect(load(readFileSync(path, 'utf8'))).toMatchObject({ strictDepBuilds: true })
    } finally {
      owner.release()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('writes the policy file when the profile workspace is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-workspace-'))
    try {
      ensureWebProfileWorkspace(root)
      const text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
      expect(text).toContain('strictDepBuilds: true')
      expect(load(text)).toMatchObject({ allowBuilds: WEB_PROFILE_ALLOW_BUILDS })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
