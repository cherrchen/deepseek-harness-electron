import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { collectReleaseArtifacts } from '../scripts/merge-update-metadata.mjs'

describe('Electron release metadata', () => {
  it('merges per-architecture files and collects release artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-update-'))
    const input = join(root, 'input')
    const output = join(root, 'output')
    await Promise.all([mkdir(join(input, 'x64'), { recursive: true }), mkdir(join(input, 'arm64'), { recursive: true })])
    await Promise.all([
      writeFile(join(input, 'x64', 'latest.yml'), metadata('1.2.3', 'DeepSeek-x64.exe', 'x64hash')),
      writeFile(join(input, 'arm64', 'latest.yml'), metadata('1.2.3', 'DeepSeek-arm64.exe', 'arm64hash')),
      writeFile(join(input, 'x64', 'DeepSeek-x64.exe'), 'x64 installer'),
      writeFile(join(input, 'arm64', 'DeepSeek-arm64.exe'), 'arm64 installer'),
    ])

    await collectReleaseArtifacts(input, output)

    const merged = load(await readFile(join(output, 'latest.yml'), 'utf8')) as {
      files: Array<{ url: string }>
      path: string
      version: string
    }
    expect(merged.version).toBe('1.2.3')
    expect(merged.files.map(file => file.url).sort()).toEqual(['DeepSeek-arm64.exe', 'DeepSeek-x64.exe'])
    expect(merged.files.map(file => file.url)).toContain(merged.path)
    await expect(readFile(join(output, 'DeepSeek-x64.exe'), 'utf8')).resolves.toBe('x64 installer')
    await expect(readFile(join(output, 'DeepSeek-arm64.exe'), 'utf8')).resolves.toBe('arm64 installer')
  })

  it('rejects metadata from different application versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-update-'))
    const input = join(root, 'input')
    await Promise.all([mkdir(join(input, 'a'), { recursive: true }), mkdir(join(input, 'b'), { recursive: true })])
    await Promise.all([
      writeFile(join(input, 'a', 'latest-mac.yml'), metadata('1.0.0', 'DeepSeek-x64.zip', 'x64hash')),
      writeFile(join(input, 'b', 'latest-mac.yml'), metadata('2.0.0', 'DeepSeek-arm64.zip', 'arm64hash')),
    ])
    await expect(collectReleaseArtifacts(input, join(root, 'output'))).rejects.toThrow(
      'latest-mac.yml contains multiple versions',
    )
  })
})

function metadata(version: string, url: string, sha512: string): string {
  return `version: ${version}\nfiles:\n  - url: ${url}\n    sha512: ${sha512}\npath: ${url}\nsha512: ${sha512}\n`
}
