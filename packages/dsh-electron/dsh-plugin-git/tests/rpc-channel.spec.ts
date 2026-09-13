import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

/**
 * The `/git` channel adapter is the plugin's only transport to the browser, so
 * its host-context contract is asserted directly: `webServer` must be in the
 * nested inject dependency list and the connection service must resolve from
 * the root store. Dropping `webServer` from the list reproduces the silent
 * 405 failure recorded in docs/troubleshooting/git-rpc-channel-405.md.
 */
describe('/git channel registration contract', () => {
  it('declares webServer alongside connection in the nested inject', () => {
    const ctx = new Context()
    const injectCalls: string[][] = []
    const original = ctx.inject.bind(ctx)
    ctx.inject = ((names: string[], callback: (injected: Context) => unknown) => {
      injectCalls.push([...names])
      return original(names, callback)
    }) as typeof ctx.inject
    ctx.provide('subprocess', {} as never)
    ctx.provide('webServer', {} as never)
    ctx.provide('connection', { rpc: { handle: () => () => {} } } as never)
    apply(ctx, {} as never)
    expect(injectCalls.some((names) => names.includes('connection') && names.includes('webServer'))).toBe(true)
  })

  it('mounts the handler on the /git channel once the route table exists', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', {} as never)
    ctx.provide('webServer', {} as never)
    const channels: string[] = []
    ctx.provide('connection', {
      rpc: { handle: (channel: string) => { channels.push(channel); return () => {} } },
    } as never)
    apply(ctx, {} as never)
    await new Promise((resolve) => setImmediate(resolve))
    expect(channels).toEqual(['/git'])
  })

  it('stays unmounted while the route table service is absent', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', {} as never)
    const channels: string[] = []
    ctx.provide('connection', {
      rpc: { handle: (channel: string) => { channels.push(channel); return () => {} } },
    } as never)
    apply(ctx, {} as never)
    await new Promise((resolve) => setImmediate(resolve))
    expect(channels).toEqual([])
  })
})
