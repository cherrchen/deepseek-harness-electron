import { describe, expect, it } from 'vitest'
import { PluginMutationCoordinator } from '../src/plugin-mutation.ts'

describe('PluginMutationCoordinator', () => {
  it('refuses new work after shutdown and waits for the in-flight mutation', async () => {
    const coordinator = new PluginMutationCoordinator()
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const operation = coordinator.run({ kind: 'install' }, async () => {
      await blocked
      return 'installed'
    })
    await Promise.resolve()
    expect(coordinator.getActiveOperation()).toEqual({ kind: 'install' })

    const shuttingDown = coordinator.shutdown()
    await expect(coordinator.run({ kind: 'enable', plugin: 'x' }, async () => 'nope'))
      .rejects.toThrow(/shutdown/u)

    let shutdownDone = false
    const shutdownFinished = shuttingDown.then(() => { shutdownDone = true })
    await Promise.resolve()
    expect(shutdownDone).toBe(false)

    release()
    await expect(operation).resolves.toBe('installed')
    await shutdownFinished
    expect(coordinator.getActiveOperation()).toBeUndefined()
  })
})
