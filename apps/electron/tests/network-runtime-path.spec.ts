import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveNetworkRuntimePath } from '../src/network/runtime-path.ts'

describe('Desktop Network Runtime path', () => {
  it('uses the packaged resources directory without consulting PATH', () => {
    expect(resolveNetworkRuntimePath({
      appPath: '/app',
      resourcesPath: '/resources',
      packaged: true,
      platform: 'win32',
      exists: () => true,
    })).toBe(join('/resources', 'network-runtime', 'dsh-electron-network-runtime.exe'))
  })

  it('fails with the exact missing application-owned path', () => {
    expect(() => resolveNetworkRuntimePath({
      appPath: '/app',
      resourcesPath: '/resources',
      packaged: false,
      platform: 'darwin',
      exists: () => false,
    })).toThrow(join('/app', '.electron-build', 'network-runtime', 'current', 'dsh-electron-network-runtime'))
  })
})
