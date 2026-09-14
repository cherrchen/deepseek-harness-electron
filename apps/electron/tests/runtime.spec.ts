import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  HARNESS_STARTUP_BUFFER_LIMIT,
  harnessArguments,
  parseHarnessReadyUrl,
  resolveDshBin,
  resolveHarnessHome,
  resolveHostRuntime,
  scanHarnessStartupChunk,
} from '../src/runtime.ts'

describe('Electron Harness runtime', () => {
  it('stores Harness state below the operating-system user home', () => {
    expect(resolveHarnessHome('/Users/person').replaceAll('\\', '/')).toBe('/Users/person/.dsh')
    expect(resolveHarnessHome('C:\\Users\\person').replaceAll('\\', '/')).toBe('C:/Users/person/.dsh')
  })

  it('resolves the dsh executable below the application root', () => {
    expect(resolveDshBin('/app/root').replaceAll('\\', '/')).toBe(
      '/app/root/node_modules/@deepseek-ai/dsh/lib/bin.js',
    )
  })

  it('enables Node internals for the upstream config watcher', () => {
    expect(harnessArguments('/app/dsh.js')).toEqual([
      '--expose-internals', '/app/dsh.js', 'web', '--port', '0', '--no-open',
    ])
    expect(harnessArguments('/path/to/dsh')).toEqual(
      [
        '--expose-internals',
        '/path/to/dsh',
        'web',
        '--port',
        '0',
        '--no-open',
      ],
    )
    expect(harnessArguments('C:\\app\\dsh\\bin.js', 'C:\\data\\picker.yml')).toEqual(
      [
        '--expose-internals',
        'C:\\app\\dsh\\bin.js',
        'web',
        '--patch',
        'C:\\data\\picker.yml',
        '--port',
        '0',
        '--no-open',
      ],
    )
  })

  it('parses the upstream readiness line after preceding output', () => {
    expect(parseHarnessReadyUrl('booting\ndsh web: http://127.0.0.1:43127\n')).toBe(
      'http://127.0.0.1:43127',
    )
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:43127/?token=abc_123-XYZ\n')).toBe(
      'http://127.0.0.1:43127/?token=abc_123-XYZ',
    )
  })

  it('waits for a complete valid loopback readiness line', () => {
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:')).toBeUndefined()
    expect(parseHarnessReadyUrl('dsh web: http://0.0.0.0:3080\n')).toBeUndefined()
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:70000\n')).toBeUndefined()
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:3080/?token=\n')).toBeUndefined()
  })

  it('drops the handshake buffer after the readiness URL and ignores later chunks', () => {
    const scan = { output: '', settled: false }
    expect(scanHarnessStartupChunk(scan, 'booting\n')).toBeUndefined()
    expect(scan.output.length).toBeGreaterThan(0)
    expect(scanHarnessStartupChunk(scan, 'dsh web: http://127.0.0.1:43127\n')).toBe(
      'http://127.0.0.1:43127',
    )
    expect(scan.settled).toBe(true)
    expect(scan.output).toBe('')
    expect(scanHarnessStartupChunk(scan, 'info: still running\n')).toBeUndefined()
    expect(scan.output).toBe('')
  })

  it('retains only the newest handshake window before the readiness line', () => {
    const scan = { output: '', settled: false }
    expect(scanHarnessStartupChunk(scan, `${'x'.repeat(HARNESS_STARTUP_BUFFER_LIMIT + 8)}\n`)).toBeUndefined()
    expect(scan.output.length).toBe(HARNESS_STARTUP_BUFFER_LIMIT)
    expect(scanHarnessStartupChunk(scan, 'dsh web: http://127.0.0.1:43127\n')).toBe(
      'http://127.0.0.1:43127',
    )
  })
})

describe('Host runtime resolution', () => {
  const packagedNode = join('/resources', 'node', 'node.exe')
  const preparedNode = join('/app', '.electron-build', 'node', 'win-x64', 'node.exe')

  it('keeps Electron as the Host executable outside Windows', () => {
    expect(resolveHostRuntime({
      appPath: '/app', resourcesPath: '/resources', packaged: true, platform: 'darwin', exists: () => false,
    })).toEqual({ executable: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } })
  })

  it('uses the packaged Node.js on Windows without Electron child mode', () => {
    expect(resolveHostRuntime({
      appPath: '/app',
      resourcesPath: '/resources',
      packaged: true,
      platform: 'win32',
      arch: 'x64',
      exists: path => path === packagedNode,
    })).toEqual({ executable: packagedNode, env: {} })
  })

  it('uses the prepared build-time Node.js for an unpackaged Windows run', () => {
    expect(resolveHostRuntime({
      appPath: '/app',
      resourcesPath: '/resources',
      packaged: false,
      platform: 'win32',
      arch: 'x64',
      exists: path => path === preparedNode,
    })).toEqual({ executable: preparedNode, env: {} })
  })

  it('prefers an explicit override over both locations', () => {
    expect(resolveHostRuntime({
      appPath: '/app',
      resourcesPath: '/resources',
      packaged: true,
      platform: 'win32',
      arch: 'x64',
      override: 'C:\\tools\\node.exe',
      exists: () => true,
    })).toEqual({ executable: 'C:\\tools\\node.exe', env: {} })
  })

  it('fails loudly when Windows has no prepared Node.js', () => {
    expect(() => resolveHostRuntime({
      appPath: '/app',
      resourcesPath: '/resources',
      packaged: false,
      platform: 'win32',
      arch: 'x64',
      exists: () => false,
    })).toThrow(/prepare:node/u)
  })
})
