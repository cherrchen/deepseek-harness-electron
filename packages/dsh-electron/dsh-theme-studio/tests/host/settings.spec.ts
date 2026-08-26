import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, THEME_STUDIO_SETTINGS_NAMESPACE, ThemeStudioSettingsSchema } from '../../src/index.ts'

describe('Theme Studio host settings', () => {
  it('accepts a persisted theme id and the Default null value', () => {
    expect(ThemeStudioSettingsSchema({ activeThemeId: null })).toEqual({ activeThemeId: null })
    expect(ThemeStudioSettingsSchema({ activeThemeId: 'dsh-theme-studio.nordic' }))
      .toEqual({ activeThemeId: 'dsh-theme-studio.nordic' })
  })

  it('rejects a non-string, non-null activeThemeId', () => {
    expect(() => ThemeStudioSettingsSchema({ activeThemeId: 1 })).toThrow()
  })

  it('registers the namespace when settings exist and disposes with the fiber', async () => {
    const ctx = new Context()
    const dispose = vi.fn()
    const register = vi.fn(() => dispose)
    ctx.provide('settings', { register, get: () => undefined } as never)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(register).toHaveBeenCalledWith(THEME_STUDIO_SETTINGS_NAMESPACE, ThemeStudioSettingsSchema)
    await fiber.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('is a no-op without a settings service', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    await fiber.dispose()
  })
})
