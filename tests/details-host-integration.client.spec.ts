// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { GIT_DETAILS_SURFACE_ID, UpstreamDetailsPanel, integrationBench } from './harness/integration.client.ts'

function winner(slots: Awaited<ReturnType<typeof integrationBench>>['slots']): unknown {
  return slots.entriesOfSlot('details')[0]?.component
}

describe('Git + Details Host integration', () => {
  it('materializes the Git surface when shellDetails opens git', async () => {
    const bench = await integrationBench()
    bench.shellDetails.open(GIT_DETAILS_SURFACE_ID)
    expect(bench.shellDetails.activeId).toBe(GIT_DETAILS_SURFACE_ID)
    expect(winner(bench.slots)).not.toBe(UpstreamDetailsPanel)
    expect((winner(bench.slots) as { name?: string }).name).toBe('DetailsHost')
    expect(bench.slots.entries('shell.details.surface').some(entry => entry.options.id === GIT_DETAILS_SURFACE_ID)).toBe(true)
    expect(bench.layout.openDetails).toHaveBeenCalledTimes(1)
    await bench.gitFiber.dispose()
    await bench.detailsFiber.dispose()
    bench.disposeRoot()
    bench.disposeUpstream()
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
})
