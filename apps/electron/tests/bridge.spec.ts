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
      'deepseek-desktop:dialog:pickDirectory',
      'deepseek-desktop:clipboard:readText',
      'deepseek-desktop:clipboard:writeText',
      'deepseek-desktop:shell:openExternal',
      'deepseek-desktop:shell:openPath',
      'deepseek-desktop:shell:showItemInFolder',
      'deepseek-desktop:notification:show',
      'deepseek-desktop:updater:check',
      'deepseek-desktop:updater:download',
      'deepseek-desktop:updater:install',
      'deepseek-desktop:updater:getState',
      'deepseek-desktop:updater:subscribe',
      'deepseek-desktop:theme:getState',
      'deepseek-desktop:theme:subscribe',
      'deepseek-desktop:window:minimize',
      'deepseek-desktop:window:maximize',
      'deepseek-desktop:window:close',
      'deepseek-desktop:window:getState',
    ])
  })

  it('resolves the renderer dist under the application root', () => {
    expect(resolveRendererRoot('/app/root').replaceAll('\\', '/')).toBe('/app/root/dist/renderer')
  })
})
