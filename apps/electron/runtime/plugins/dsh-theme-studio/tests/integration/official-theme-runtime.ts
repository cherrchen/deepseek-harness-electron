/**
 * Overlay composition copied from `@deepseek-ai/dsh-client-ui-theme` ThemeRuntime
 * (0.1.1-rc.2). The published client artifact is a ModuleLoader bundle that
 * pulls CSS modules through primitives, so tests instantiate this replica
 * instead of importing `/client`. Layer stacking, same-source replacement,
 * disposer identity, and light/dark/system selection match the official class.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeSettings {
  preference: ThemePreference
}

interface ThemeTokens {
  [name: string]: string
}

interface ThemeDefinition {
  id: string
  colorScheme: 'light' | 'dark'
  tokens: ThemeTokens
}

interface ThemeSnapshot {
  preference: ThemePreference
  active: ThemeDefinition
  themes: readonly ThemeDefinition[]
  revision: number
}

interface SettingsScope<T> {
  getSnapshot(): { value: T | undefined }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

const BUILTIN_THEMES: readonly ThemeDefinition[] = Object.freeze([
  Object.freeze({ id: 'light', colorScheme: 'light' as const, tokens: Object.freeze({}) }),
  Object.freeze({ id: 'dark', colorScheme: 'dark' as const, tokens: Object.freeze({}) }),
])

const DEFAULT_PREFERENCE: ThemePreference = 'system'
const THEME_PREFERENCE_FIELD = 'preference'

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function validateOverrides(source: string, tokens: ThemeTokenOverrides): ThemeTokenOverrides {
  const validated: ThemeTokenOverrides = {}
  for (const [name, value] of Object.entries<unknown>(tokens)) {
    if (typeof value === 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" is a bare string — pass { light, dark }`,
      )
    }
    if (typeof value !== 'object' || value === null
      || typeof (value as { light?: unknown }).light !== 'string'
      || typeof (value as { dark?: unknown }).dark !== 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" must map to a { light, dark } pair of strings`,
      )
    }
    const modes = value as { light: string; dark: string }
    validated[name] = { light: modes.light, dark: modes.dark }
  }
  return validated
}

/** Official ThemeRuntime overlay composer used by Theme Studio integration tests. */
export class ThemeRuntime {
  private readonly ctx: Context
  private readonly host: SettingsScope<ThemeSettings>
  private themes: ThemeDefinition[] = [...BUILTIN_THEMES]
  private preference: ThemePreference
  private revision = 0
  private snapshot: ThemeSnapshot
  private readonly media: MediaQueryList | undefined
  private readonly overrides = new Map<string, { seq: number; tokens: ThemeTokenOverrides }>()
  private overrideSeq = 0

  /**
   * @param ctx - owning context; media-query and scope listeners use ctx.effect.
   * @param host - durable Appearance preference scope.
   */
  constructor(ctx: Context, host: SettingsScope<ThemeSettings>) {
    this.ctx = ctx
    this.host = host
    this.preference = DEFAULT_PREFERENCE
    this.media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)')
    this.snapshot = this.buildSnapshot()
    if (this.media !== undefined) {
      const media = this.media
      const onChange = (): void => {
        if (this.preference !== 'system') return
        this.publish()
      }
      ctx.effect(() => {
        media.addEventListener('change', onChange)
        return () => { media.removeEventListener('change', onChange) }
      }, 'ui-theme: prefers-color-scheme listener')
    }
    ctx.effect(() => host.subscribe(() => { this.adopt() }), 'ui-theme: settings scope adoption')
    this.adopt()
  }

  /**
   * Read the current immutable theme snapshot.
   * @returns the current snapshot.
   */
  getTheme(): ThemeSnapshot {
    return this.snapshot
  }

  /**
   * Switch the official Appearance preference. Does not touch Theme Studio.
   * @param id - `light`, `dark`, or `system`.
   */
  setTheme(id: string): void {
    if (id !== 'system' && !this.themes.some(theme => theme.id === id)) {
      throw new Error(`theme "${id}" is not registered`)
    }
    if (this.preference === id) return
    this.preference = id as ThemePreference
    if (isThemePreference(id)) void this.host.set(THEME_PREFERENCE_FIELD, id)
    this.publish()
  }

  /**
   * Stack or replace one overlay layer. Later seq wins per token; the active
   * color scheme selects `light` or `dark`.
   * @param source - layer identity.
   * @param tokens - per-token light/dark values.
   * @returns disposer for the layer created by this call.
   */
  overrideTokens(source: string, tokens: ThemeTokenOverrides): () => void {
    const layer = { seq: this.overrideSeq++, tokens: validateOverrides(source, tokens) }
    this.overrides.set(source, layer)
    this.publish()
    return () => {
      if (this.overrides.get(source) !== layer) return
      this.overrides.delete(source)
      this.publish()
    }
  }

  private adopt(): void {
    const section = this.host.getSnapshot().value
    if (section === undefined || this.preference === section.preference) return
    this.preference = section.preference
    this.publish()
  }

  private buildSnapshot(): ThemeSnapshot {
    const resolvedId = this.preference === 'system'
      ? (this.media?.matches === true ? 'dark' : 'light')
      : this.preference
    const active = this.themes.find(theme => theme.id === resolvedId)
    if (active === undefined) throw new Error(`theme registry lost "${resolvedId}"`)
    return Object.freeze({
      preference: this.preference,
      active: this.composeActive(active),
      themes: Object.freeze([...this.themes]),
      revision: this.revision,
    })
  }

  private composeActive(active: ThemeDefinition): ThemeDefinition {
    if (this.overrides.size === 0) return active
    const tokens: ThemeTokens = { ...active.tokens }
    for (const layer of [...this.overrides.values()].sort((left, right) => left.seq - right.seq)) {
      for (const [name, modes] of Object.entries(layer.tokens)) {
        tokens[name] = modes[active.colorScheme]
      }
    }
    return Object.freeze({ ...active, tokens: Object.freeze(tokens) })
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    this.ctx.emit('theme/change', this.snapshot)
  }
}
