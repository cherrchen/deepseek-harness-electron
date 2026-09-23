import type { App, ProxyConfig, Session } from 'electron'
import type { DesktopNetworkMode } from './domain.ts'
import type { DesktopGatewayEndpoint } from './environment.ts'

/** Applies one Desktop route to Chromium's app and every registered Session. */
export class ElectronProxyApplier {
  private readonly sessions = new Set<Session>()
  private config: ProxyConfig | undefined

  constructor(private readonly application: Pick<App, 'setProxy'>, defaultSession: Session) {
    this.sessions.add(defaultSession)
  }

  /** Register a Session before its first request. @returns a disposer for its ownership. */
  async register(session: Session): Promise<() => void> {
    this.sessions.add(session)
    try {
      if (this.config !== undefined) await session.setProxy(this.config)
    } catch (error) {
      this.sessions.delete(session)
      throw error
    }
    return () => { this.sessions.delete(session) }
  }

  /** Default leaves Chromium's existing configuration untouched. */
  async apply(mode: DesktopNetworkMode, gateway?: DesktopGatewayEndpoint): Promise<void> {
    if (mode === 'default') return
    const config: ProxyConfig = mode === 'direct'
      ? { mode: 'direct' }
      : { mode: 'fixed_servers', proxyRules: gatewayRule(gateway) }
    await this.application.setProxy(config)
    await Promise.all([...this.sessions].map(async (owned) => { await owned.setProxy(config) }))
    this.config = config
    await this.closeConnections()
  }

  /** Close pooled Chromium connections after System policy changes. */
  async closeConnections(): Promise<void> {
    await Promise.all([...this.sessions].map(async (owned) => { await owned.closeAllConnections() }))
  }
}

function gatewayRule(gateway: DesktopGatewayEndpoint | undefined): string {
  if (gateway === undefined || !Number.isInteger(gateway.port) || gateway.port < 1 || gateway.port > 65_535) {
    throw new Error('desktop network: managed Electron proxy requires a ready Gateway')
  }
  const host = gateway.host === '::1' ? '[::1]' : gateway.host
  return `http://${host}:${String(gateway.port)}`
}
