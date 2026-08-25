import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPlugin } from '../src/plugin.ts'

const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('profile plugin reconciliation', () => {
  it('removes an installed bundle whose declared Host entry is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-reconcile-'))
    roots.push(root)
    const profileDir = join(root, 'profiles', 'test')
    const packageDir = join(profileDir, 'node_modules', 'broken-bundle')
    const binDir = join(root, 'bin')
    mkdirSync(packageDir, { recursive: true })
    mkdirSync(binDir)
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-test',
      private: true,
      dependencies: { 'broken-bundle': '1.0.0' },
      dsh: { profile: { bundles: ['broken-bundle'] } },
    }))
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: 'broken-bundle',
      version: '1.0.0',
      main: 'lib/index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), '[]\n')
    const pnpm = process.platform === 'win32' ? join(binDir, 'pnpm.cmd') : join(binDir, 'pnpm')
    writeFileSync(pnpm, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
    if (process.platform !== 'win32') chmodSync(pnpm, 0o700)
    const previousHome = process.env.DSH_HOME
    const previousPath = process.env.PATH
    process.env.DSH_HOME = root
    process.env.PATH = `${binDir}${delimiter}${previousPath ?? ''}`
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      expect(runPlugin('test', ['install'])).toBe(0)
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      if (previousPath === undefined) delete process.env.PATH
      else process.env.PATH = previousPath
    }
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } }
    }
    expect(manifest.dsh.profile.bundles).toEqual([])
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('declared Host entry does not exist: lib/index.js'))
  })
})
