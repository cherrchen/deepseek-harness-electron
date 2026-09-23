import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { createPluginCommandRunner } from '../src/plugin-install.ts'
import type { HostRuntime } from '../src/runtime.ts'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

afterEach(() => { vi.resetAllMocks() })

function setup(pid?: number, runtime: HostRuntime = { executable: 'node', env: {} }) {
  const child = Object.assign(new EventEmitter(), {
    pid,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>)
  const run = createPluginCommandRunner({
    runtime, dshBin: 'dsh', harnessHome: 'home', profile: 'web', envPath: '',
  })
  return { child, run }
}

describe('plugin command process lifecycle', () => {
  it('passes Desktop-owned package commands through the managed environment policy', async () => {
    const { child } = setup(42)
    const policy = vi.fn((base: NodeJS.ProcessEnv) => ({ ...base, HTTP_PROXY: 'http://127.0.0.1:4123' }))
    const run = createPluginCommandRunner({
      runtime: { executable: 'node', env: {} }, dshBin: 'dsh', harnessHome: 'home',
      profile: 'web', envPath: '', environmentForOwnedChild: policy,
    })
    const result = run({ kind: 'outdated' })
    child.emit('close', 0)
    await result
    expect(policy).toHaveBeenCalledOnce()
    expect(vi.mocked(spawn).mock.calls.at(-1)?.[2]?.env?.HTTP_PROXY).toBe('http://127.0.0.1:4123')
  })
  it('reports an actual missing executable without an unhandled process error', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    vi.mocked(spawn).mockImplementation(actual.spawn)
    const root = await mkdtemp(join(tmpdir(), 'dsh-command-spawn-'))
    try {
      const run = createPluginCommandRunner({
        runtime: { executable: join(root, 'missing'), env: {} },
        dshBin: 'dsh', harnessHome: root, profile: 'web', envPath: '',
      })
      await expect(run({ kind: 'outdated' })).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('contains a spawn error and rejects after the child closes', async () => {
    const { child, run } = setup(42)
    child.pid = undefined
    const error = new Error('spawn ENOENT')
    const onSpawn = vi.fn()
    const result = run({ kind: 'outdated' }, { onSpawn })
    const rejected = expect(result).rejects.toBe(error)
    expect(() => child.emit('error', error)).not.toThrow()
    child.emit('close', -2)
    await rejected
    expect(onSpawn).not.toHaveBeenCalled()
  })

  it('kills the child after owner handoff fails and waits for close before releasing the caller', async () => {
    const { child, run } = setup(42)
    const error = new Error('lock fsync failed')
    const result = run({ kind: 'outdated' }, { onSpawn: () => { throw error } })
    const settled = vi.fn()
    void result.then(settled, settled)
    const rejected = expect(result).rejects.toBe(error)
    expect(() => child.emit('spawn')).not.toThrow()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(settled).not.toHaveBeenCalled()
    child.emit('error', new Error('kill failed'))
    child.emit('close', null)
    await rejected
  })

  it('hands off the spawned PID and captures output through close', async () => {
    const { child, run } = setup(42)
    const onSpawn = vi.fn()
    const result = run({ kind: 'outdated' }, { onSpawn })
    expect(onSpawn).not.toHaveBeenCalled()
    child.emit('spawn')
    expect(onSpawn).toHaveBeenCalledWith(42)
    child.stdout.write('output')
    child.stderr.write('diagnostic')
    child.emit('close', 1)
    await expect(result).resolves.toEqual({ exitCode: 1, stdout: 'output', stderr: 'diagnostic' })
  })

  it('runs the dsh child with the console-bearing stdio and without Electron child mode', async () => {
    const { child, run } = setup(42)
    const result = run({ kind: 'outdated' })
    child.emit('close', 0)
    await result
    const options = vi.mocked(spawn).mock.calls[0]?.[2]
    // A piped-only stdio would make libuv pass CREATE_NO_WINDOW and leave the child without the
    // console its package-manager descendants inherit.
    expect(options?.stdio).toEqual([expect.any(Number), 'pipe', 'pipe'])
    expect(options?.windowsHide).toBe(true)
    expect(options?.env?.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(vi.mocked(spawn).mock.calls[0]?.[0]).toBe('node')
  })

  it('forwards the Electron child mode of a non-Windows runtime', async () => {
    const { child, run } = setup(42, { executable: 'electron', env: { ELECTRON_RUN_AS_NODE: '1' } })
    const result = run({ kind: 'outdated' })
    child.emit('close', 0)
    await result
    const options = vi.mocked(spawn).mock.calls[0]?.[2]
    expect(options?.env?.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(vi.mocked(spawn).mock.calls[0]?.[0]).toBe('electron')
  })
})
