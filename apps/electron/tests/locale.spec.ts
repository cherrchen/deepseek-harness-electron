import { describe, expect, it } from 'vitest'
import { resolveDesktopMainLocale, en, zh } from '../src/locale.ts'

describe('desktop Main locale', () => {
  it('selects Chinese for zh locales and English otherwise', () => {
    expect(resolveDesktopMainLocale('zh-CN').messages).toBe(zh)
    expect(resolveDesktopMainLocale('zh-TW').id).toBe('zh-CN')
    expect(resolveDesktopMainLocale('en-US').messages).toBe(en)
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })
})
