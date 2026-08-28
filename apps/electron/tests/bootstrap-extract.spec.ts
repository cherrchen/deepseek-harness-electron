import { describe, expect, it } from 'vitest'
import { extractHostBootstrap } from '../src/bootstrap-extract.ts'

describe('extractHostBootstrap', () => {
  it('reads the boot graph and classic preload script URLs', () => {
    const html = [
      '<html><head>',
      '<script>window.__ModuleLoader__={}</script>',
      '<script src="/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=abc"></script>',
      '<script src="/plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=def"></script>',
      '<script>globalThis["__DSH_BOOT__"] = {"rev":"g1","entries":[{"id":"@deepseek-ai/dsh-client-modules","url":"/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=abc","rev":"abc"}]}</script>',
      '</head><body></body></html>',
    ].join('')

    expect(extractHostBootstrap(html)).toEqual({
      boot: {
        rev: 'g1',
        entries: [{
          id: '@deepseek-ai/dsh-client-modules',
          url: '/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=abc',
          rev: 'abc',
        }],
      },
      preloadUrls: [
        '/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=abc',
        '/plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=def',
      ],
    })
  })

  it('rejects Host HTML without a boot assignment', () => {
    expect(() => extractHostBootstrap('<html></html>')).toThrow(/__DSH_BOOT__/)
  })

  it('rejects Host HTML without plugin preload scripts', () => {
    const html = '<script>globalThis["__DSH_BOOT__"] = {"rev":"x","entries":[]}</script>'
    expect(() => extractHostBootstrap(html)).toThrow(/preload/)
  })
})
