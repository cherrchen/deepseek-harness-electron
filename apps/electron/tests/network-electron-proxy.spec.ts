import { describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'
import { ElectronProxyApplier } from '../src/network/electron-proxy.ts'

function session() {
  return { setProxy: vi.fn().mockResolvedValue(undefined), closeAllConnections: vi.fn().mockResolvedValue(undefined) }
}

describe('Electron network application', () => {
  it('leaves Default sessions and app untouched', async () => {
    const application = { setProxy: vi.fn() }
    const primary = session()
    const updater = session()
    const applier = new ElectronProxyApplier(application, primary as unknown as Session)
    await applier.register(updater as unknown as Session)
    await applier.apply('default')
    expect(application.setProxy).not.toHaveBeenCalled()
    expect(primary.setProxy).not.toHaveBeenCalled()
    expect(updater.setProxy).not.toHaveBeenCalled()
  })

  it('routes every registered Session and app to the same single Gateway', async () => {
    const application = { setProxy: vi.fn().mockResolvedValue(undefined) }
    const primary = session()
    const updater = session()
    const applier = new ElectronProxyApplier(application, primary as unknown as Session)
    await applier.register(updater as unknown as Session)
    await applier.apply('system', { host: '127.0.0.1', port: 4123 })
    const expected = { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:4123' }
    for (const target of [application, primary, updater]) expect(target.setProxy).toHaveBeenCalledWith(expected)
    expect(primary.closeAllConnections).toHaveBeenCalledOnce()
    expect(updater.closeAllConnections).toHaveBeenCalledOnce()
    const late = session()
    await applier.register(late as unknown as Session)
    expect(late.setProxy).toHaveBeenCalledWith(expected)
    await applier.closeConnections()
    expect(late.closeAllConnections).toHaveBeenCalledOnce()
  })

  it('sets Direct explicitly and rejects Managed without a Gateway', async () => {
    const application = { setProxy: vi.fn().mockResolvedValue(undefined) }
    const primary = session()
    const applier = new ElectronProxyApplier(application, primary as unknown as Session)
    await expect(applier.apply('manual')).rejects.toThrow(/ready Gateway/)
    expect(application.setProxy).not.toHaveBeenCalled()
    await applier.apply('direct')
    expect(application.setProxy).toHaveBeenCalledWith({ mode: 'direct' })
    expect(primary.setProxy).toHaveBeenCalledWith({ mode: 'direct' })
  })
})
