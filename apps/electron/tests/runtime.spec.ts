import { describe, expect, it } from 'vitest'
import { harnessArguments, parseHarnessReadyUrl, resolveDshBin } from '../src/runtime.ts'

describe('Electron Harness runtime', () => {
  it('resolves the dsh executable below the application root', () => {
    expect(resolveDshBin('/app/root').replaceAll('\\', '/')).toBe(
      '/app/root/node_modules/@deepseek-ai/dsh/lib/bin.js',
    )
  })

  it('enables Node internals for the upstream config watcher', () => {
    expect(harnessArguments('/app/dsh.js')).toEqual([
      '--expose-internals', '/app/dsh.js', 'web', '--port', '0',
    ])
  })

  it('parses the upstream readiness line after preceding output', () => {
    expect(parseHarnessReadyUrl('booting\ndsh web: http://127.0.0.1:43127\n')).toBe(
      'http://127.0.0.1:43127',
    )
  })

  it('waits for a complete valid loopback readiness line', () => {
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:')).toBeUndefined()
    expect(parseHarnessReadyUrl('dsh web: http://0.0.0.0:3080\n')).toBeUndefined()
    expect(parseHarnessReadyUrl('dsh web: http://127.0.0.1:70000\n')).toBeUndefined()
  })
})
