import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeStudioSettings } from '../../src/constants.ts'
import { apply, inject, SETTINGS_NS } from '../../src/client/index.ts'
import { ThemeStudioRow } from '../../src/client/ThemeStudioRow.tsx'
import { ACTIVE_SOURCE, PREVIEW_SOURCE } from '../../src/client/runtime.ts'
import { stubSettingsScope } from '../harness.ts'
import type { createThemeStudioRowStore } from '../../src/client/store.ts'
import type { ThemeStudioRowInjected } from '../../src/client/ThemeStudioRow.tsx'

const NORDIC = 'dsh-theme-studio.nordic'

function fakeTheme() {
  const layers = new Map<string, { tokens: ThemeTokenOverrides; seq: number }>()
  let seq = 0
  return {
    layers,
    has(source: string) { return layers.has(source) },
    theme: {
      overrideTokens(source: string, tokens: ThemeTokenOverrides) {
        const layer = { tokens: structuredClone(tokens), seq: seq++ }
        layers.set(source, layer)
        return () => {
          if (layers.get(source) === layer) layers.delete(source)
        }
      },
    },
  }
}

function durableHost(value: ThemeStudioSettings) {
  const host = stubSettingsScope<ThemeStudioSettings>()
  host.publish({ status: 'ready', value, revision: 1, writable: true })
  host.set.mockImplementation((_field: string, next: unknown) => {
    host.publish({
      status: 'ready',
      value: { activeThemeId: next as string | null },
      revision: (host.scope.getSnapshot().revision ?? 0) + 1,
      writable: true,
    })
    return Promise.resolve()
  })
  return host
}

function fakeLocale() {
  let locale = 'zh'
  const packs = new Map<string, { zh: Record<string, string>; en: Record<string, string> }>()
  return {
    setLocale(next: string) { locale = next },
    register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }) {
      packs.set(ns, dicts)
      return () => { packs.delete(ns) }
    },
    bind(ns: string) {
      return (key: string) => packs.get(ns)?.[locale === 'en' ? 'en' : 'zh']?.[key] ?? key
    },
  }
}

function fakeSlots() {
  const items: Array<{
    options: { id?: string; order?: number; locale?: string }
    component: unknown
    store: unknown
    inject: unknown
  }> = []
  return {
    inject(_name: string, factory: () => () => void) {
      return factory()
    },
    register(
      options: { name: string; id?: string; order?: number; locale?: string; store?: unknown; inject?: unknown },
      component: unknown,
    ) {
      const entry = { options, component, store: options.store, inject: options.inject }
      items.push(entry)
      return () => {
        const index = items.indexOf(entry)
        if (index >= 0) items.splice(index, 1)
      }
    },
    entries() { return items },
  }
}

async function bench(value: ThemeStudioSettings = { activeThemeId: null }) {
  const ctx = new Context()
  const locale = fakeLocale()
  ctx.provide('locale', locale)
  const overlay = fakeTheme()
  ctx.provide('theme', overlay.theme)
  const host = durableHost(value)
  ctx.provide('settingsScope', { bind: () => host.scope } as never)
  ctx.provide('connection', { isLoopback: true } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  const slots = fakeSlots()
  ctx.provide('slots', slots)
  return { ctx, overlay, host, locale, slots }
}

function faceOf(slots: ReturnType<typeof fakeSlots>) {
  const entry = slots.entries().find(item => item.component === ThemeStudioRow)!
  const handle = entry.store as ReturnType<typeof createThemeStudioRowStore>
  const instance = handle.create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => ThemeStudioRowInjected)(instance.actions)
  return { entry, instance, face }
}

describe('Theme Studio client apply', () => {
  it('declares the required services', () => {
    expect(inject).toEqual(['theme', 'settingsScope', 'slots', 'locale', 'connection', 'remote'])
  })

  it('registers localized copy and the Themes row at order 20', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.locale.bind(SETTINGS_NS)('title')).toBe('主题')
    b.locale.setLocale('en')
    expect(b.locale.bind(SETTINGS_NS)('title')).toBe('Themes')
    const entry = b.slots.entries().find(item => item.component === ThemeStudioRow)!
    expect(entry.options).toMatchObject({ id: 'themes', order: 20 })
  })

  it('restores a durable theme and routes face writes through the runtime', async () => {
    const b = await bench({ activeThemeId: NORDIC })
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.overlay.has(ACTIVE_SOURCE)).toBe(true)
    const { instance, face } = faceOf(b.slots)
    expect(instance.getSnapshot().activeThemeId).toBe(NORDIC)
    face.previewTheme('dsh-theme-studio.graphite')
    expect(instance.getSnapshot().previewing).toBe(true)
    expect(b.overlay.has(PREVIEW_SOURCE)).toBe(true)
    face.cancelPreview()
    expect(b.overlay.has(PREVIEW_SOURCE)).toBe(false)
  })

  it('reloads from durable settings without duplicating the row', async () => {
    const b = await bench({ activeThemeId: NORDIC })
    const first = b.ctx.plugin({ inject: [...inject], apply })
    await first.await()
    expect(b.slots.entries()).toHaveLength(1)
    await first.dispose()
    expect(b.slots.entries()).toHaveLength(0)
    expect(b.overlay.has(ACTIVE_SOURCE)).toBe(false)
    expect(b.locale.bind(SETTINGS_NS)('title')).toBe('title')

    const second = b.ctx.plugin({ inject: [...inject], apply })
    await second.await()
    expect(b.slots.entries()).toHaveLength(1)
    expect(b.overlay.has(ACTIVE_SOURCE)).toBe(true)
    expect(b.locale.bind(SETTINGS_NS)('title')).toBe('主题')
    await second.dispose()
  })

  it('teardown without a declaration is quiet', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(b.slots.entries()).toHaveLength(0)
  })
})
