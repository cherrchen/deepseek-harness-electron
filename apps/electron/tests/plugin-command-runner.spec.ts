import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { createPluginCommandRunner } from '../src/plugin-install.ts'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

afterEach(() => { vi.resetAllMocks() })

function setup(pid?: number) {
  const child = Object.assign(new EventEmitter(), {
    pid,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>)
  const run = createPluginCommandRunner({
    electronExecutable: 'electron', dshBin: 'dsh', harnessHome: 'home', profile: 'web', envPath: '',
  })
  return { child, run }
}

describe('plugin command process lifecycle', () => {
  it('reports an actual missing executable without an unhandled process error', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    vi.mocked(spawn).mockImplementation(actual.spawn)
    const root = await mkdtemp(join(tmpdir(), 'dsh-command-spawn-'))
    try {
      const run = createPluginCommandRunner({
        electronExecutable: join(root, 'missing'), dshBin: 'dsh', harnessHome: root, profile: 'web', envPath: '',
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
})
