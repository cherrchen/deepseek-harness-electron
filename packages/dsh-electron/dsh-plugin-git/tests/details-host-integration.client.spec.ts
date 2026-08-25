// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { apply as applyGit, inject as injectGit } from '../src/client/index.ts'
import { GIT_DETAILS_SURFACE_ID, UpstreamDetailsPanel, integrationBench } from './harness/integration.client.ts'

function winner(slots: Awaited<ReturnType<typeof integrationBench>>['slots']): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

function DummySurface(): null {
  return null
}

async function disposeBench(bench: Awaited<ReturnType<typeof integrationBench>>): Promise<void> {
  await bench.gitFiber.dispose()
  await bench.detailsFiber.dispose()
  bench.disposeRoot()
  bench.disposeUpstream()
}

describe('Git + Details Host integration', () => {
  it('materializes the Git surface when shellDetails opens git', async () => {
    const bench = await integrationBench()
    const instance = bench.shellDetails.open({
      surfaceId: GIT_DETAILS_SURFACE_ID,
      payload: { tab: 'commit' },
    })
    expect(instance.surfaceId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(instance.payload).toEqual({ tab: 'commit' })
    expect(bench.shellDetails.activeId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(bench.shellDetails.activeInstance?.payload).toEqual({ tab: 'commit' })
    expect(winner(bench.slots)).not.toBe(UpstreamDetailsPanel)
    expect((winner(bench.slots) as { name?: string }).name).toBe('DetailsHost')
    expect(bench.slots.entries('shell.details.surface').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(true)
    expect(bench.layout.openDetails).toHaveBeenCalledTimes(1)
    await disposeBench(bench)
  })

  it('keeps legacy string open compatible', async () => {
    const bench = await integrationBench()
    bench.shellDetails.open(GIT_DETAILS_SURFACE_ID)
    expect(bench.shellDetails.activeId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(bench.shellDetails.activeInstance?.surfaceId).toBe(GIT_DETAILS_SURFACE_ID)
    await disposeBench(bench)
  })

  it('closes details when the Git surface registration is disposed', async () => {
    const bench = await integrationBench()
    bench.shellDetails.open(GIT_DETAILS_SURFACE_ID)
    const gitSurface = bench.slots.entries('shell.details.surface').find(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)
    expect(gitSurface).toBeDefined()
    await bench.gitFiber.dispose()
    await new Promise<void>(resolve => { queueMicrotask(resolve) })
    expect(bench.slots.entries('shell.details.surface').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(false)
    expect(bench.shellDetails.isOpen()).toBe(false)
    expect(winner(bench.slots)).toBe(UpstreamDetailsPanel)
    await bench.detailsFiber.dispose()
    bench.disposeRoot()
    bench.disposeUpstream()
  })

  it('restores Git details across session switch without leaking into an empty session', async () => {
    const bench = await integrationBench()
    const opened = bench.shellDetails.open({
      surfaceId: GIT_DETAILS_SURFACE_ID,
      payload: { tab: 'diff' },
    })
    expect(bench.shellDetails.activeId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(bench.shellDetails.activeInstance?.payload).toEqual({ tab: 'diff' })
    expect(bench.slots.entries('shell.details.header.actions').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(true)

    bench.sessions.setCurrent('session-b')
    expect(bench.shellDetails.isOpen()).toBe(false)
    expect(bench.shellDetails.activeInstance).toBeNull()
    expect(winner(bench.slots)).toBe(UpstreamDetailsPanel)
    expect(bench.slots.spec('shell.details.surface')).toBeUndefined()

    bench.sessions.setCurrent('session-a')
    expect(bench.shellDetails.activeId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(bench.shellDetails.activeInstance?.instanceId).toBe(opened.instanceId)
    expect(bench.shellDetails.activeInstance?.payload).toEqual({ tab: 'diff' })
    expect((winner(bench.slots) as { name?: string }).name).toBe('DetailsHost')
    expect(bench.slots.entries('shell.details.surface').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(true)
    expect(bench.slots.entries('shell.details.header.actions').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(true)
    await disposeBench(bench)
  })

  it('recovers Host after Git unload and rematerializes contributions on remount', async () => {
    const bench = await integrationBench()
    bench.shellDetails.open({
      surfaceId: GIT_DETAILS_SURFACE_ID,
      payload: { tab: 'changes' },
    })
    expect(bench.shellDetails.isOpen()).toBe(true)

    await bench.gitFiber.dispose()
    await new Promise<void>(resolve => { queueMicrotask(resolve) })
    expect(bench.shellDetails.isOpen()).toBe(false)
    expect(winner(bench.slots)).toBe(UpstreamDetailsPanel)
    expect(bench.slots.spec('shell.details.surface')).toBeUndefined()

    const remounted = bench.ctx.plugin({ inject: [...injectGit], apply: applyGit })
    await remounted.await()
    const rematerialized = bench.shellDetails.open({
      surfaceId: GIT_DETAILS_SURFACE_ID,
      payload: { tab: 'commit' },
    })
    expect(rematerialized.payload).toEqual({ tab: 'commit' })
    expect(bench.shellDetails.activeId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(bench.slots.entries('shell.details.surface').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(true)
    expect(bench.slots.entries('shell.details.header.actions').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(true)

    await remounted.dispose()
    await bench.detailsFiber.dispose()
    bench.disposeRoot()
    bench.disposeUpstream()
  })

  it('keeps Git history intact when navigating through a test-only dummy surface', async () => {
    const bench = await integrationBench()
    const stopDummy = bench.ctx.slots.inject('shell.details.surface', () => bench.ctx.slots.register({
      name: 'shell.details.surface',
      id: 'test.dummy',
      label: 'Dummy',
    } as never, DummySurface))
    bench.shellDetails.registerSurface({ id: 'test.dummy' })

    const git = bench.shellDetails.open({
      surfaceId: GIT_DETAILS_SURFACE_ID,
      payload: { tab: 'changes' },
    })
    bench.shellDetails.open({ surfaceId: 'test.dummy' })
    expect(bench.shellDetails.activeId).toBe('test.dummy')
    expect(bench.shellDetails.canGoBack()).toBe(true)
    expect(bench.shellDetails.getSnapshot().historyDepth).toBe(1)

    bench.shellDetails.back()
    expect(bench.shellDetails.activeId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(bench.shellDetails.activeInstance?.instanceId).toBe(git.instanceId)
    expect(bench.shellDetails.activeInstance?.payload).toEqual({ tab: 'changes' })
    expect(bench.shellDetails.canGoBack()).toBe(false)

    stopDummy()
    await disposeBench(bench)
  })
})
