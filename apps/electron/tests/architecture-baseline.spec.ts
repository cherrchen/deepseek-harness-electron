import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { downstreamPluginPackages, verifyDownstreamPluginWorkspace } from '../scripts/verify-downstream-plugin-workspace.mjs'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))

describe('runtime plugin architecture baselines', () => {
  it('keeps bundled plugins under runtime/plugins', () => {
    expect(existsSync(join(electronRoot, 'runtime', 'plugins'))).toBe(true)
  })

  it('keeps renderer/main.ts as a thin bootstrap without feature plugin imports', () => {
    const source = readFileSync(join(electronRoot, 'src', 'renderer', 'main.ts'), 'utf8')
    expect(source).toContain('installDesktopWebSocket')
    expect(source).toContain('installDesktopClipboardShim')
    expect(source).toContain('installHostBootstrap')
    expect(source).toContain('AppWebEntry')
    expect(source).not.toContain('runtime/plugins')
    expect(source).not.toContain('dsh-electron-ui-directory-picker')
    expect(source).not.toContain('dsh-electron-desktop-capabilities')
  })

  it('keeps downstream ecosystem packages visible to pnpm', () => {
    const root = join(electronRoot, '..', '..')
    expect(downstreamPluginPackages(root)).toEqual(expect.any(Array))
    expect(() => { verifyDownstreamPluginWorkspace(root) }).not.toThrow()
  })

  it('does not modify upstream CLI or boot packages', () => {
    const root = join(electronRoot, '..', '..')
    const diff = spawnSync('git', ['diff', '--', 'apps/cli', 'packages/boot'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(diff.status).toBe(0)
    expect(diff.stdout).toBe('')
  })

  it('keeps Git client sources free of Details Host runtime imports', () => {
    const gitRoot = join(electronRoot, '..', '..', 'packages', 'dsh-electron', 'dsh-plugin-git')
    const manifest = JSON.parse(readFileSync(join(gitRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      dsh?: { client?: { inject?: string[] } }
    }
    expect(JSON.stringify(manifest.dependencies ?? {})).not.toContain('dsh-client-ui-details-host')
    expect(JSON.stringify(manifest.peerDependencies ?? {})).not.toContain('dsh-client-ui-details-host')
    expect(manifest.dsh?.client?.inject ?? []).not.toContain('@dsh-electron/dsh-client-ui-details-host')
    expect(readFileSync(join(gitRoot, 'src', 'client', 'index.ts'), 'utf8')).toContain('sidebarRight')
    expect(readFileSync(join(gitRoot, 'src', 'client', 'index.ts'), 'utf8')).not.toContain('shellDetails')
  })
})
