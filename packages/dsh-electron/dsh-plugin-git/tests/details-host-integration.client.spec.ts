// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { apply as applyGit, inject as injectGit } from '../src/client/index.ts'
import {
  GIT_CHANGES_SURFACE_ID,
  GIT_DIFF_SURFACE_ID,
  GIT_GRAPH_SURFACE_ID,
  UpstreamDetailsPanel,
  integrationBench,
} from './harness/integration.client.ts'

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
  it('opens Git Changes as a details tab and dedupes repeated opens', async () => {
    const bench = await integrationBench()
    const instance = bench.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
    expect(instance.surfaceId).toBe(GIT_CHANGES_SURFACE_ID)
    expect(bench.shellDetails.activeId).toBe(GIT_CHANGES_SURFACE_ID)
    expect(winner(bench.slots)).not.toBe(UpstreamDetailsPanel)
    expect((winner(bench.slots) as { name?: string }).name).toBe('DetailsHost')
    expect(bench.slots.entries('shell.details.surface').some(entry => entry.options.id === GIT_CHANGES_SURFACE_ID)).toBe(true)
    expect(bench.layout.openDetails).toHaveBeenCalledTimes(1)

    // Repeated opens reuse the tab (stable changes dedupe key).
    const again = bench.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
    expect(again.instanceId).toBe(instance.instanceId)
    expect(bench.shellDetails.getSnapshot().tabs).toHaveLength(1)
    await disposeBench(bench)
  })

  it('opens a changed file as its own diff tab with a stable key', async () => {
    const bench = await integrationBench()
    bench.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
    const diff = bench.shellDetails.open({
      surfaceId: GIT_DIFF_SURFACE_ID,
      payload: { path: 'README.md', staged: false },
    })
    expect(bench.shellDetails.activeId).toBe(GIT_DIFF_SURFACE_ID)
    expect(bench.shellDetails.getSnapshot().tabs.map(tab => tab.surfaceId)).toEqual([
      GIT_CHANGES_SURFACE_ID,
      GIT_DIFF_SURFACE_ID,
    ])

    // Same path + side reuses the tab; the other side opens a new one.
    const repeat = bench.shellDetails.open({
      surfaceId: GIT_DIFF_SURFACE_ID,
      payload: { path: 'README.md', staged: false },
    })
    expect(repeat.instanceId).toBe(diff.instanceId)
    const stagedTab = bench.shellDetails.open({
      surfaceId: GIT_DIFF_SURFACE_ID,
      payload: { path: 'README.md', staged: true },
    })
    expect(stagedTab.instanceId).not.toBe(diff.instanceId)
    expect(bench.shellDetails.getSnapshot().tabs).toHaveLength(3)
    await disposeBench(bench)
  })

  it('prunes Git tabs when their registrations disappear and keeps the dock alive', async () => {
    const bench = await integrationBench()
    bench.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
    await bench.gitFiber.dispose()
    await new Promise<void>((resolve) => { queueMicrotask(resolve) })
    expect(bench.shellDetails.isOpen()).toBe(false)
    expect(bench.shellDetails.getSnapshot().tabs).toEqual([])
    // v3 keeps the takeover; the Launcher page shows instead of the upstream panel.
    expect(winner(bench.slots)).not.toBe(UpstreamDetailsPanel)
    expect((winner(bench.slots) as { name?: string }).name).toBe('DetailsHost')
    await bench.detailsFiber.dispose()
    bench.disposeRoot()
    bench.disposeUpstream()
  })

  it('restores Git tabs across a session switch without leaking into an empty session', async () => {
    const bench = await integrationBench()
    const opened = bench.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
    expect(bench.shellDetails.activeId).toBe(GIT_CHANGES_SURFACE_ID)
    expect(bench.slots.entries('shell.details.header.actions').some(entry => entry.options.id === GIT_CHANGES_SURFACE_ID)).toBe(true)

    bench.sessions.setCurrent('session-b')
    expect(bench.shellDetails.activeId).toBeNull()
    expect(bench.shellDetails.activeInstance).toBeNull()
    expect(bench.shellDetails.getSnapshot().tabs).toEqual([])

    bench.sessions.setCurrent('session-a')
    expect(bench.shellDetails.activeId).toBe(GIT_CHANGES_SURFACE_ID)
    expect(bench.shellDetails.activeInstance?.instanceId).toBe(opened.instanceId)
    expect((winner(bench.slots) as { name?: string }).name).toBe('DetailsHost')
    await disposeBench(bench)
  })

  it('rematerializes Git contributions after plugin reload', async () => {
    const bench = await integrationBench()
    bench.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
    await bench.gitFiber.dispose()
    await new Promise<void>((resolve) => { queueMicrotask(resolve) })

    const remounted = bench.ctx.plugin({ inject: [...injectGit], apply: applyGit })
    await remounted.await()
    const reopened = bench.shellDetails.open({ surfaceId: GIT_GRAPH_SURFACE_ID })
    expect(bench.shellDetails.activeId).toBe(GIT_GRAPH_SURFACE_ID)
    expect(bench.slots.entries('shell.details.surface').some(entry => entry.options.id === GIT_GRAPH_SURFACE_ID)).toBe(true)
    expect(bench.shellDetails.getSnapshot().tabs.map(tab => tab.surfaceId)).toEqual([GIT_GRAPH_SURFACE_ID])
    void reopened

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

    const git = bench.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
    bench.shellDetails.open({ surfaceId: 'test.dummy' })
    expect(bench.shellDetails.activeId).toBe('test.dummy')
    expect(bench.shellDetails.canGoBack()).toBe(true)
    expect(bench.shellDetails.getSnapshot().historyDepth).toBe(1)

    bench.shellDetails.back()
    expect(bench.shellDetails.activeId).toBe(GIT_CHANGES_SURFACE_ID)
    expect(bench.shellDetails.activeInstance?.instanceId).toBe(git.instanceId)
    // MRU back navigation toggles: the dummy tab is now restorable.
    expect(bench.shellDetails.canGoBack()).toBe(true)

    stopDummy()
    await disposeBench(bench)
  })
})
