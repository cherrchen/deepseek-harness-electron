import { describe, expect, it } from 'vitest'
import {
  DesktopIpcChannel,
  RENDERER_ENTRY_URL,
  RENDERER_ORIGIN,
  RENDERER_SCHEME,
} from '../src/bridge-types.ts'
import { resolveRendererRoot } from '../src/protocol.ts'

describe('desktop bridge constants', () => {
  it('keeps the renderer origin on localhost for upstream loopback gates', () => {
    expect(RENDERER_SCHEME).toBe('dsh-electron')
    expect(RENDERER_ORIGIN).toBe('dsh-electron://localhost')
    expect(RENDERER_ENTRY_URL).toBe('dsh-electron://localhost/index.html')
    expect(new URL(RENDERER_ORIGIN).hostname).toBe('localhost')
  })

  it('exposes a closed IPC channel set', () => {
    expect(Object.values(DesktopIpcChannel)).toEqual([
      'deepseek-desktop:host:getBootstrap',
      'deepseek-desktop:host:request',
      'deepseek-desktop:host:openStream',
      'deepseek-desktop:app:getVersion',
      'deepseek-desktop:app:getPlatform',
    ])
  })

  it('resolves the renderer dist under the application root', () => {
    expect(resolveRendererRoot('/app/root').replaceAll('\\', '/')).toBe('/app/root/dist/renderer')
  })
})
