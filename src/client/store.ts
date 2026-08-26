/**
 * Themes row slot store: a mirror of ThemeStudioRuntime. The plugin apply
 * listener is the only writer; the row reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemePreview } from './types.ts'
import type { ThemeStudioSnapshot } from './runtime.ts'

/** One card in the Themes row, including Default. */
export interface ThemeStudioCard {
  /** Builtin id, or `null` for Default. */
  id: string | null
  /** Locale key for the card name. */
  nameKey: string
  /** Locale key for the card description. */
  descriptionKey: string
  /** Mosaic colors for each official color scheme. */
  preview: { light: ThemePreview; dark: ThemePreview }
}

/** Store state mirrored from the runtime snapshot plus static cards. */
export interface ThemeStudioRowState extends ThemeStudioSnapshot {
  /** Default plus builtin cards in display order. */
  cards: readonly ThemeStudioCard[]
}

/** Declared action shape giving the exported factory a stable return type. */
type ThemeStudioRowActions = {
  sync: (draft: ThemeStudioRowState, snapshot: ThemeStudioSnapshot) => void
}

/**
 * Declares the Themes row state and write surface.
 * @param cards - Default plus builtin cards; stored once at construction.
 * @returns the store handle.
 */
export function createThemeStudioRowStore(
  cards: readonly ThemeStudioCard[],
): EngineStoreHandle<ThemeStudioRowState, ThemeStudioRowActions> {
  return defineStore({
    init: (): ThemeStudioRowState => ({
      activeThemeId: null,
      previewThemeId: null,
      previewing: false,
      settingsStatus: 'loading',
      revision: -1,
      cards,
    }),
    actions: {
      sync: (draft, snapshot: ThemeStudioSnapshot) => {
        if (snapshot.revision <= draft.revision) return
        draft.activeThemeId = snapshot.activeThemeId
        draft.previewThemeId = snapshot.previewThemeId
        draft.previewing = snapshot.previewing
        draft.settingsStatus = snapshot.settingsStatus
        draft.revision = snapshot.revision
      },
    },
  })
}
