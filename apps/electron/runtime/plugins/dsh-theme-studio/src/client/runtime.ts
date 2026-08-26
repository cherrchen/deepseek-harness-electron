/** Theme Studio overlay runtime: active/preview layers and settings adoption. */

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import {
  ACTIVE_SOURCE, ACTIVE_THEME_ID_FIELD, PREVIEW_SOURCE, THEME_STUDIO_SETTINGS_NAMESPACE,
  type ThemeStudioSettings,
} from '../constants.ts'
import { presetToOverrides } from './adapter.ts'
import type { BuiltinThemePreset, ThemeCatalog } from './types.ts'

export {
  ACTIVE_SOURCE, ACTIVE_THEME_ID_FIELD, PREVIEW_SOURCE, THEME_STUDIO_SETTINGS_NAMESPACE,
}

/** Structural ThemeRuntime face consumed by this plugin. */
export interface ThemeOverrideSurface {
  /**
   * Stack or replace one overlay layer.
   * @param source - layer identity.
   * @param tokens - per-token light/dark values.
   * @returns disposer for the layer created by this call.
   */
  overrideTokens(source: string, tokens: ThemeTokenOverrides): () => void
}

/** Published Theme Studio state for the Settings UI. */
export interface ThemeStudioSnapshot {
  /** Persisted overlay id, or `null` for Default. */
  activeThemeId: string | null
  /** Preview overlay id, or `null` when previewing Default or not previewing. */
  previewThemeId: string | null
  /** Whether a transient preview is installed. */
  previewing: boolean
  /** Settings-scope readiness. */
  settingsStatus: 'loading' | 'ready' | 'unavailable'
  /** Monotonic change counter. */
  revision: number
}

/** Construction inputs. Catalog is swapped in Stage 2 without rewriting runtime. */
export interface ThemeStudioRuntimeOptions {
  /** Official ThemeRuntime or a test double. */
  theme: ThemeOverrideSurface
  /** Durable Theme Studio section; omitted when settings are unavailable. */
  host: SettingsScope<ThemeStudioSettings> | undefined
  /** Theme lookup used by activate/preview. */
  catalog: ThemeCatalog
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.length === 0) return null
  return value
}

/**
 * Owns Theme Studio overlay layers. The Host settings snapshot is the durable
 * authority; visual state may update optimistically and then reconverge.
 */
export class ThemeStudioRuntime {
  private readonly theme: ThemeOverrideSurface
  private readonly host: SettingsScope<ThemeStudioSettings> | undefined
  private readonly catalog: ThemeCatalog
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribeHost: (() => void) | undefined
  private activeDisposer: (() => void) | undefined
  private previewDisposer: (() => void) | undefined
  private persistGeneration = 0
  private repairingUnknown = false
  private disposed = false
  private activeThemeId: string | null = null
  private previewThemeId: string | null = null
  private previewing = false
  private settingsStatus: ThemeStudioSnapshot['settingsStatus']
  private revision = 0
  private snapshot: ThemeStudioSnapshot

  /**
   * @param options - theme overlay surface, optional settings scope, catalog.
   */
  constructor(options: ThemeStudioRuntimeOptions) {
    this.theme = options.theme
    this.host = options.host
    this.catalog = options.catalog
    this.settingsStatus = options.host === undefined ? 'unavailable' : 'loading'
    this.snapshot = this.buildSnapshot()
    if (this.host !== undefined) {
      this.unsubscribeHost = this.host.subscribe(() => { this.adopt() })
    }
    this.adopt()
  }

  /**
   * Read the current immutable snapshot.
   * @returns the current snapshot (stable until the next change).
   */
  getSnapshot(): ThemeStudioSnapshot {
    return this.snapshot
  }

  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Install a transient overlay. Does not write settings. `null` previews Default
   * by temporarily removing the active overlay.
   * @param id - builtin theme id, or `null` for Default.
   */
  previewTheme(id: string | null): void {
    this.assertOpen()
    if (id === null) {
      this.disposePreviewLayer()
      this.clearActiveLayer()
      this.previewThemeId = null
      this.previewing = true
      this.publish()
      return
    }
    const preset = this.requirePreset(id)
    if (this.previewing && this.previewThemeId === null) this.ensureActiveLayer()
    this.installPreview(preset)
    this.previewThemeId = id
    this.previewing = true
    this.publish()
  }

  /** Remove the preview overlay and restore the active overlay. */
  cancelPreview(): void {
    this.assertOpen()
    if (!this.previewing) return
    this.disposePreviewLayer()
    if (this.previewThemeId === null) this.ensureActiveLayer()
    this.previewThemeId = null
    this.previewing = false
    this.publish()
  }

  /**
   * Persist the current preview as the active overlay.
   * No-op when nothing is being previewed.
   */
  applyPreview(): void {
    this.assertOpen()
    if (!this.previewing) return
    const id = this.previewThemeId
    if (id === null) {
      this.restoreDefault()
      return
    }
    const preset = this.requirePreset(id)
    this.installActive(preset)
    this.disposePreviewLayer()
    this.activeThemeId = id
    this.previewThemeId = null
    this.previewing = false
    this.publish()
    void this.persist(id)
  }

  /**
   * Persist a builtin theme as the active overlay.
   * @param id - builtin theme id.
   */
  activateTheme(id: string): void {
    this.assertOpen()
    const preset = this.requirePreset(id)
    this.disposePreviewLayer()
    this.previewThemeId = null
    this.previewing = false
    this.installActive(preset)
    this.activeThemeId = id
    this.publish()
    void this.persist(id)
  }

  /** Clear Theme Studio overlays without changing official Appearance. */
  restoreDefault(): void {
    this.assertOpen()
    this.disposePreviewLayer()
    this.clearActiveLayer()
    this.activeThemeId = null
    this.previewThemeId = null
    this.previewing = false
    this.publish()
    void this.persist(null)
  }

  /** Drop overlays, listeners, and pending persist work. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.persistGeneration += 1
    this.unsubscribeHost?.()
    this.disposePreviewLayer()
    this.clearActiveLayer()
    this.listeners.clear()
  }

  private adopt(): void {
    if (this.disposed) return
    if (this.host === undefined) {
      if (this.settingsStatus !== 'unavailable') {
        this.settingsStatus = 'unavailable'
        this.publish()
      }
      return
    }
    const section = this.host.getSnapshot()
    if (section.status !== 'ready') {
      if (this.settingsStatus !== section.status) {
        this.settingsStatus = section.status
        this.publish()
      }
      return
    }
    this.settingsStatus = 'ready'
    this.applyDurable(section.value?.activeThemeId)
  }

  private applyDurable(raw: unknown): void {
    const id = normalizeId(raw)
    if (typeof raw === 'string' && this.catalog.get(raw) === undefined) {
      this.disposePreviewLayer()
      this.clearActiveLayer()
      this.activeThemeId = null
      this.previewThemeId = null
      this.previewing = false
      this.publish()
      this.repairUnknown()
      return
    }
    if (id === this.activeThemeId) {
      if (!this.previewing) {
        if (id === null) this.clearActiveLayer()
        else this.ensureActiveLayer()
      }
      if (this.snapshot.settingsStatus !== this.settingsStatus) this.publish()
      return
    }
    this.disposePreviewLayer()
    this.previewThemeId = null
    this.previewing = false
    if (id === null) {
      this.clearActiveLayer()
      this.activeThemeId = null
      this.publish()
      return
    }
    const preset = this.catalog.get(id)
    if (preset === undefined) return
    this.installActive(preset)
    this.activeThemeId = id
    this.publish()
  }

  private repairUnknown(): void {
    if (this.host === undefined || this.repairingUnknown) return
    this.repairingUnknown = true
    void this.host.set(ACTIVE_THEME_ID_FIELD, null).finally(() => {
      this.repairingUnknown = false
    })
  }

  private async persist(id: string | null): Promise<void> {
    const generation = ++this.persistGeneration
    if (this.host === undefined) return
    await this.host.set(ACTIVE_THEME_ID_FIELD, id)
    if (this.disposed || generation !== this.persistGeneration) return
    const section = this.host.getSnapshot()
    if (section.status !== 'ready') return
    if (normalizeId(section.value?.activeThemeId) !== this.activeThemeId) {
      this.applyDurable(section.value?.activeThemeId)
    }
  }

  private requirePreset(id: string): BuiltinThemePreset {
    const preset = this.catalog.get(id)
    if (preset === undefined) throw new Error(`theme ${JSON.stringify(id)} is not in the catalog`)
    return preset
  }

  private installActive(preset: BuiltinThemePreset): void {
    this.activeDisposer = this.theme.overrideTokens(ACTIVE_SOURCE, presetToOverrides(preset))
  }

  private installPreview(preset: BuiltinThemePreset): void {
    this.previewDisposer = this.theme.overrideTokens(PREVIEW_SOURCE, presetToOverrides(preset))
  }

  private ensureActiveLayer(): void {
    if (this.activeThemeId === null || this.activeDisposer !== undefined) return
    const preset = this.catalog.get(this.activeThemeId)
    if (preset !== undefined) this.installActive(preset)
  }

  private clearActiveLayer(): void {
    this.activeDisposer?.()
    this.activeDisposer = undefined
  }

  private disposePreviewLayer(): void {
    this.previewDisposer?.()
    this.previewDisposer = undefined
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error('ThemeStudioRuntime is disposed')
  }

  private buildSnapshot(): ThemeStudioSnapshot {
    return Object.freeze({
      activeThemeId: this.activeThemeId,
      previewThemeId: this.previewThemeId,
      previewing: this.previewing,
      settingsStatus: this.settingsStatus,
      revision: this.revision,
    })
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    for (const listener of [...this.listeners]) listener()
  }
}
