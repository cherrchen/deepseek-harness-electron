import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Electron tray icon build', () => {
  it('documents the SVG source and raster ladder', async () => {
    const sourcePath = join(import.meta.dirname, '..', 'assets', 'tray', 'source.json')
    const source = JSON.parse(await readFile(sourcePath, 'utf8')) as {
      sourcePath: string
      rasterSizesPx: number[]
      glyphScale: number
    }

    expect(source.sourcePath).toBe('assets/tray/deepseek.svg')
    expect(source.rasterSizesPx).toEqual([16, 18, 20, 22, 24, 28, 32, 36, 44])
    expect(source.glyphScale).toBe(1)
    expect(source.macTemplate.glyphScale).toBe(1)
  })

  it('emits the expected tray PNG manifest after build:tray', async () => {
    const manifestPath = join(import.meta.dirname, '..', 'build', 'tray', 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      outputs: Record<string, string>
    }

    expect(Object.keys(manifest.outputs).sort()).toEqual([
      'deepseek-black-16.png',
      'deepseek-black-18.png',
      'deepseek-black-20.png',
      'deepseek-black-22.png',
      'deepseek-black-24.png',
      'deepseek-black-28.png',
      'deepseek-black-32.png',
      'deepseek-black-36.png',
      'deepseek-black-44.png',
      'deepseek-white-16.png',
      'deepseek-white-18.png',
      'deepseek-white-20.png',
      'deepseek-white-22.png',
      'deepseek-white-24.png',
      'deepseek-white-28.png',
      'deepseek-white-32.png',
      'deepseek-white-36.png',
      'deepseek-white-44.png',
      'deepseekTemplate.png',
      'deepseekTemplate@2x.png',
    ])
  })
})
