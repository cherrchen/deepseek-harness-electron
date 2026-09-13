/**
 * Hand-rolled fake of `ctx.sidebarRight` + `ctx.sidebarRightTabs` with the
 * semantics this plugin's migration depends on: a kind or id registers once,
 * page types dedupe per pane, resource tabs reveal by exact address and bump a
 * navigation revision. Disposal mirrors upstream `SidebarRightTabRegistry.leave`:
 * it only removes the definition — every tab record stays in `tabs()`, and in
 * production the body seat dispatches such orphaned tabs to the owner's
 * `tab.unavailable` fallback until the type is registered again, while new
 * opens for the unregistered kind throw. A real-registry integration test is
 * impossible from this package: upstream `client.js` exports only `apply`/
 * `inject`; the registry and store are bundle-internal. Mounting the real
 * sidebar was rejected as disproportionate (layout + session + dockkit graph).
 */
import { Context } from '@deepseek-ai/cordis'
import { vi } from 'vitest'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { apply as applyGit, inject as injectGit } from '../../src/client/index.ts'

/** What a body's `useTabInfo().tab.navigation` carries on the fake. */
export interface FakeNavigation {
  readonly address: string
  readonly params: { readonly path: string; readonly staged: boolean } | undefined
  readonly revision: number
}

/** One open tab as the fake observes it. */
export interface FakeTab {
  readonly id: number
  readonly kind: string
  readonly address: string
  readonly paneId: string
  navigation: FakeNavigation
}

/** The fake navigation face (`ctx.sidebarRight`). */
export interface FakeSidebarRight {
  openTab(kind: string, options?: { readonly params?: unknown; readonly paneId?: string }): void
  openResource(address: string, options?: { readonly params?: unknown; readonly paneId?: string }): void
  isExpanded(): boolean
  tabs(): readonly FakeTab[]
}

/** The fake tab-type registry (`ctx.sidebarRightTabs`). */
export interface FakeSidebarRightTabs {
  register(definition: SidebarRightTabDefinition): () => void
  /** Look up the definition in force for a kind, as upstream's `get(kind)` does. */
  get(kind: string): SidebarRightTabDefinition | undefined
  guide(): ReadonlyArray<{ kind: string; order: number; title: () => string }>
}

/** The assembled fake: both service faces and teardown. */
export interface SidebarFake {
  readonly sidebarRight: FakeSidebarRight
  readonly sidebarRightTabs: FakeSidebarRightTabs
  dispose(): void
}

/** Picomatch-free matcher for this plugin's scheme-qualified `/**` patterns. */
function patternMatches(pattern: string, address: string): boolean {
  if (pattern.endsWith('/**')) return address.startsWith(pattern.slice(0, -3))
  return pattern === address
}

/** Create the fake registry and navigation faces. */
export function createSidebarFake(): SidebarFake {
  const definitions = new Map<string, SidebarRightTabDefinition>()
  const tabs: FakeTab[] = []
  let nextTabId = 1

  const requireKind = (kind: string): SidebarRightTabDefinition => {
    const definition = [...definitions.values()].find(candidate => candidate.kind === kind)
    if (definition === undefined) throw new Error(`tab kind ${kind} is not registered`)
    return definition
  }

  const claim = (address: string): SidebarRightTabDefinition => {
    const winner = [...definitions.values()].find(definition =>
      definition.patterns?.some(pattern => patternMatches(pattern, address)) === true
      && definition.canOpen?.(address) !== false)
    if (winner === undefined) throw new Error(`no tab type claims ${address}`)
    return winner
  }

  const navigate = (
    definition: SidebarRightTabDefinition,
    address: string,
    params: FakeNavigation['params'],
    paneId: string,
  ): void => {
    const isResource = definition.patterns !== undefined
    const existing = tabs.find(tab =>
      tab.kind === definition.kind
      && tab.paneId === paneId
      && (isResource ? tab.address === address : true))
    if (existing !== undefined) {
      existing.navigation = { address, params, revision: existing.navigation.revision + 1 }
      return
    }
    tabs.push({
      id: nextTabId,
      kind: definition.kind,
      address,
      paneId,
      navigation: { address, params, revision: isResource ? 1 : 0 },
    })
    nextTabId += 1
  }

  const sidebarRight: FakeSidebarRight = {
    openTab: vi.fn((kind: string, options?: { readonly params?: unknown; readonly paneId?: string }) => {
      const definition = requireKind(kind)
      if (definition.patterns !== undefined) throw new Error(`${kind} is a resource type; open it by address`)
      navigate(definition, `sidebar://${kind}`, options?.params as FakeNavigation['params'], options?.paneId ?? 'pane-a')
    }),
    openResource: vi.fn((address: string, options?: { readonly params?: unknown; readonly paneId?: string }) => {
      const definition = claim(address)
      navigate(definition, address, options?.params as FakeNavigation['params'], options?.paneId ?? 'pane-a')
    }),
    isExpanded: () => tabs.length > 0,
    tabs: () => tabs,
  }

  const sidebarRightTabs: FakeSidebarRightTabs = {
    register(definition: SidebarRightTabDefinition): () => void {
      if (definitions.has(definition.id)) throw new Error(`duplicate tab id ${definition.id}`)
      if ([...definitions.values()].some(entry => entry.kind === definition.kind)) {
        throw new Error(`duplicate tab kind ${definition.kind}`)
      }
      definitions.set(definition.id, definition)
      return () => {
        definitions.delete(definition.id)
        // Upstream `leave` only mutates registry maps: the tabs of an
        // unregistered kind keep their records. Their bodies render the owner
        // fallback; a re-registration restores them.
      }
    },
    get(kind: string) {
      return [...definitions.values()].find(definition => definition.kind === kind)
    },
    guide() {
      return [...definitions.values()]
        .flatMap(definition => (definition.guide ?? []).map(entry => ({ ...entry, kind: definition.kind })))
        .sort((left, right) => left.order - right.order)
    },
  }

  return {
    sidebarRight,
    sidebarRightTabs,
    dispose: () => {
      definitions.clear()
      tabs.length = 0
    },
  }
}

/**
 * One registered keyed slot entry as recorded by the fake slots service. The
 * body seats and the title-seat registrations (Changes, Graph) both flow
 * through this same list, keyed by `name` + `key`.
 */
export interface FakeSlotEntry {
  name: string
  key?: string
  id?: string
}

/** Git plugin mounted against the fake sidebar services, with its slot record. */
export interface GitBench {
  ctx: Context
  fake: SidebarFake
  registrations: FakeSlotEntry[]
  fiber: Awaited<ReturnType<Context['plugin']>>
}

/** Mount Git against the fake sidebar services. */
export async function gitBench(): Promise<GitBench> {
  const ctx = new Context()
  const fake = createSidebarFake()
  const registrations: FakeSlotEntry[] = []
  const track = (entry: FakeSlotEntry): (() => void) => {
    registrations.push(entry)
    return () => {
      const index = registrations.indexOf(entry)
      if (index >= 0) registrations.splice(index, 1)
    }
  }
  ctx.provide('slots', {
    inject: (_name: string, callback: () => unknown) => ctx.effect(() => callback() as () => void),
    register: (entry: FakeSlotEntry) => track(entry),
  } as never)
  ctx.provide('connection', { rpc: { call: vi.fn() } } as never)
  ctx.provide('locale', {
    register: () => () => {},
    bind: () => (key: string) => key,
    subscribe: () => () => {},
  } as never)
  ctx.provide('sidebarRight', fake.sidebarRight as never)
  ctx.provide('sidebarRightTabs', fake.sidebarRightTabs as never)
  const fiber = ctx.plugin({ inject: injectGit, apply: applyGit })
  await fiber.await()
  return { ctx, fake, registrations, fiber }
}
