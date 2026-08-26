/** Theme Studio Host settings namespace, schema, and defaults. */

import z from '@deepseek-ai/schemastery'
import {
  ACTIVE_THEME_ID_FIELD, THEME_STUDIO_SETTINGS_NAMESPACE, type ThemeStudioSettings,
} from './constants.ts'

export { ACTIVE_THEME_ID_FIELD, THEME_STUDIO_SETTINGS_NAMESPACE, type ThemeStudioSettings }

/** Default section: no Theme Studio overlay, official Appearance only. */
export const DEFAULT_THEME_STUDIO_SETTINGS: ThemeStudioSettings = {
  activeThemeId: null,
}

/** Host schema for the Theme Studio namespace. */
export const ThemeStudioSettingsSchema: z<ThemeStudioSettings> = z.object({
  [ACTIVE_THEME_ID_FIELD]: z.union([z.string(), z.const(null)]).default(null),
})
