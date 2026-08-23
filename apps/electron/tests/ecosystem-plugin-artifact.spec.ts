import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateRuntimePlugin } from '../src/runtime-plugins.ts'

const electronRoot = fileURLToPath(new URL('..', import.meta.url))
const pluginRoot = join(electronRoot, '..', '..', 'packages', 'dsh-electron', 'dsh-plugin-git')

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('standard ecosystem plugin artifact portability', () => {
  it('validates Native and Electron installs extracted from the same tgz', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'dsh-plugin-git-artifact-'))
    try {
      const pack = execFileSync('pnpm', ['pack', '--pack-destination', scratch], {
        cwd: pluginRoot,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
      })
      const tarball = pack.trim().split('\n').at(-1)
      if (tarball === undefined || !tarball.endsWith('.tgz')) throw new Error(`pnpm pack did not report a tgz: ${pack}`)
      const packedChecksum = sha256(tarball)
      const installs = ['native', 'electron'].map((name) => {
        const root = join(scratch, name)
        mkdirSync(root)
        execFileSync('tar', ['-xzf', tarball, '-C', root])
        const packageRoot = join(root, 'package')
        validateRuntimePlugin({
          name: '@dsh-electron/dsh-plugin-git',
          directoryName: 'dsh-plugin-git',
          rootPath: packageRoot,
          hasClient: true,
        })
        return packageRoot
      })
      expect(sha256(tarball)).toBe(packedChecksum)
      for (const artifact of ['package.json', 'lib/index.js', 'lib/client.js', 'lib/types.js']) {
        expect(sha256(join(installs[0] ?? '', artifact))).toBe(sha256(join(installs[1] ?? '', artifact)))
      }
      const client = readFileSync(join(installs[0] ?? '', 'lib', 'client.js'), 'utf8')
      expect(client).not.toContain('window.deepseekDesktop')
      expect(client).not.toContain('ipcRenderer')
      expect(client).not.toContain('dsh-electron-desktop-capabilities')
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })
})
