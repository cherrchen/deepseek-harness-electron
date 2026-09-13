// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { GIT_CHANGES_ID, GIT_GRAPH_ID, gitDiffAddress } from '../src/client/contract.ts'
import { changesDefinition } from '../src/client/tab-definitions.ts'
import { gitBench } from './harness/sidebar-fake.client.ts'

describe('Git + right-sidebar migration', () => {
  it('registers all three tab types with their guide entries', async () => {
    const bench = await gitBench()
    expect(bench.fake.sidebarRightTabs.guide().map(entry => [entry.kind, entry.order])).toEqual([
      ['git.changes', 10],
      ['git.graph', 11],
    ])
    await bench.fiber.dispose()
    expect(bench.fake.sidebarRightTabs.guide()).toHaveLength(0)
  })

  it('registers live titles for the Changes and Graph chips only', async () => {
    const bench = await gitBench()
    const titleKeys = bench.registrations
      .filter(entry => entry.name === 'sidebar.right.pane.tab.title')
      .map(entry => entry.key)
    expect(titleKeys).toContain(GIT_CHANGES_ID)
    expect(titleKeys).toContain(GIT_GRAPH_ID)
    // Diff chips title after the compared file (language-neutral path text),
    // so no title registration exists for the diff type.
    expect(titleKeys).toHaveLength(2)
    await bench.fiber.dispose()
    expect(bench.registrations.filter(entry => entry.name === 'sidebar.right.pane.tab.title')).toHaveLength(0)
  })

  it('opens Git Changes once per pane and reveals on repeated opens', async () => {
    const bench = await gitBench()
    bench.fake.sidebarRight.openTab('git.changes')
    expect(bench.fake.sidebarRight.tabs().map(tab => tab.kind)).toEqual(['git.changes'])

    bench.fake.sidebarRight.openTab('git.changes')
    expect(bench.fake.sidebarRight.tabs()).toHaveLength(1)

    // A second pane gets its own Changes tab.
    bench.fake.sidebarRight.openTab('git.changes', { paneId: 'pane-b' })
    expect(bench.fake.sidebarRight.tabs().filter(tab => tab.kind === 'git.changes')).toHaveLength(2)

    // Upstream unload semantics: disposing the registration removes the type,
    // never the tab records (the body seat renders the owner fallback until a
    // reload restores the type).
    const opened = bench.fake.sidebarRight.tabs().map(tab => [tab.kind, tab.address])
    await bench.fiber.dispose()
    expect(bench.fake.sidebarRightTabs.get('git.changes')).toBeUndefined()
    expect(bench.fake.sidebarRight.tabs().map(tab => [tab.kind, tab.address])).toEqual(opened)
  })

  it('resurrects a retained tab body when the type re-registers', async () => {
    const bench = await gitBench()
    bench.fake.sidebarRight.openTab('git.changes')
    await bench.fiber.dispose()
    // The record survived the unload; its kind no longer resolves.
    expect(bench.fake.sidebarRight.tabs().map(tab => tab.kind)).toEqual(['git.changes'])
    expect(bench.fake.sidebarRightTabs.get('git.changes')).toBeUndefined()
    // Re-registering the type (the "shadowed builtin resumes" model) makes the
    // persisted tab live again without a fresh open.
    bench.fake.sidebarRightTabs.register(changesDefinition(key => key))
    expect(bench.fake.sidebarRightTabs.get('git.changes')).toBeDefined()
    expect(bench.fake.sidebarRight.tabs()).toHaveLength(1)
  })

  it('opens one diff tab per path and side, revealing the exact address on repeat', async () => {
    const bench = await gitBench()
    const composer = bench.registrations.find(entry => entry.id === 'git-context') as {
      inject?: () => { controller: { openDiff(path: string, staged: boolean): void } }
    }
    const controller = composer.inject?.().controller
    expect(controller).toBeDefined()

    controller?.openDiff('a.ts', true)
    const [worktree] = bench.fake.sidebarRight.tabs()
    expect(worktree?.kind).toBe('git.diff')
    expect(worktree?.address).toBe(gitDiffAddress('a.ts', true))
    expect(worktree?.navigation.params).toEqual({ path: 'a.ts', staged: true })

    // Re-opening the same file + side reveals the tab and bumps its revision.
    controller?.openDiff('a.ts', true)
    expect(bench.fake.sidebarRight.tabs()).toHaveLength(1)
    expect(bench.fake.sidebarRight.tabs()[0]?.navigation.revision).toBe(2)

    // A different side is a different address, hence a second tab.
    controller?.openDiff('a.ts', false)
    expect(bench.fake.sidebarRight.tabs().map(tab => tab.address)).toEqual([
      gitDiffAddress('a.ts', true),
      gitDiffAddress('a.ts', false),
    ])

    // A different path opens its own tab.
    controller?.openDiff('dir/b.ts', false)
    expect(bench.fake.sidebarRight.tabs()).toHaveLength(3)

    // Unload keeps the records and drops only the type.
    const opened = bench.fake.sidebarRight.tabs().map(tab => [tab.kind, tab.address])
    await bench.fiber.dispose()
    expect(bench.fake.sidebarRightTabs.get('git.diff')).toBeUndefined()
    expect(bench.fake.sidebarRight.tabs().map(tab => [tab.kind, tab.address])).toEqual(opened)
  })

  it('claims diff addresses through the registered pattern and canOpen veto', async () => {
    const bench = await gitBench()
    // Address matching the pattern but undecodable: vetoed by canOpen.
    expect(() => { bench.fake.sidebarRight.openResource('dsh-resource://git/diff/x') }).toThrow(/no tab type claims/)
    // Non-resource schemes never route through the resource face.
    expect(() => { bench.fake.sidebarRight.openResource('file:///tmp/x') }).toThrow(/no tab type claims/)
    // The diff page face refuses to open a page kind over the tab face.
    expect(() => { bench.fake.sidebarRight.openTab('git.diff') }).toThrow(/resource type/)
    await bench.fiber.dispose()
  })

  it('routes the composer chip through openTab and survives unload', async () => {
    const bench = await gitBench()
    const composer = bench.registrations.find(entry => entry.id === 'git-context') as {
      inject?: () => { openDetails: () => void }
    }
    composer.inject?.().openDetails()
    expect(bench.fake.sidebarRight.tabs().map(tab => tab.kind)).toEqual(['git.changes'])

    await bench.fiber.dispose()
    // With the registrations gone, the navigation faces refuse new opens.
    expect(() => { bench.fake.sidebarRight.openTab('git.changes') }).toThrow(/not registered/)
  })
})
