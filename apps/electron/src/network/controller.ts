import type { DesktopNetworkPreferencesV1 } from '../preferences.ts'
import { DesktopPreferencesStore } from '../preferences.ts'
import type {
  DesktopNetworkConfigInput,
  DesktopNetworkState,
  PasswordChange,
  PersistedAuthenticatedProxy,
  PersistedManualProxy,
  SanitizedManualProxy,
} from './domain.ts'
import { MANUAL_PROXY_PASSWORD_REF } from './domain.ts'
import {
  agentProxyPolicyForHost,
  environmentForAgent,
  environmentForHarnessLaunch,
  environmentForOwnedChild,
  type DesktopGatewayEndpoint,
  type NetworkEnvironmentPolicy,
} from './environment.ts'
import type { DesktopSecretStore } from './secret-store.ts'
import { consumeNetworkStartupOverride } from './startup-override.ts'
import { normalizeNetworkConfigInput } from './validation.ts'
import { NetworkRuntimeClient } from './runtime-client.ts'

/** Dependencies that keep the controller independent of Electron globals. */
export interface DesktopNetworkControllerOptions {
  userDataPath: string
  preferences: DesktopPreferencesStore
  secrets: DesktopSecretStore
  relaunch: () => Promise<void>
}

/** M1 lifecycle owner for persisted Network mode, secrets, and child environments. */
export class DesktopNetworkController {
  private current: DesktopNetworkState | undefined
  private gateway: DesktopGatewayEndpoint | undefined
  private runtime: NetworkRuntimeClient | undefined

  /** @param options - Main-owned persistence, secret, and lifecycle services. */
  constructor(private readonly options: DesktopNetworkControllerOptions) {}

  /** Load preferences, consume a one-shot override, and publish sanitized state. */
  async prepare(): Promise<void> {
    const loaded = this.options.preferences.load()
    const oneShot = await consumeNetworkStartupOverride(this.options.userDataPath)
    const secureStorage = await this.options.secrets.status()
    const configuredMode = loaded.preferences.network.mode
    const effectiveMode = oneShot.override?.mode ?? configuredMode
    this.current = {
      configuredMode,
      effectiveMode,
      ...(oneShot.override === undefined ? {} : { startupOverride: oneShot.override.mode }),
      ...sanitizedManualFields(loaded.preferences.network.manual, configuredMode === 'manual'),
      proxyAgentTraffic: loaded.preferences.network.proxyAgentTraffic,
      restartRequired: false,
      ...(loaded.warning === undefined ? {} : { preferencesWarning: loaded.warning }),
      runtime: { status: 'inactive' },
      secureStorage,
      testSettings: loaded.preferences.network.tests,
    }
    if (oneShot.warning !== undefined) console.warn(oneShot.warning)
  }

  /** @returns immutable sanitized state after {@link prepare}. */
  state(): DesktopNetworkState {
    if (this.current === undefined) throw new Error('desktop network: controller is not prepared')
    return structuredClone(this.current)
  }

  /** Start the native Gateway before any managed Desktop or Harness request can run. */
  async startRuntime(runtime: NetworkRuntimeClient): Promise<void> {
    const state = this.state()
    if (state.effectiveMode === 'default' || state.effectiveMode === 'direct') return
    this.current = { ...state, runtime: { status: 'starting' } }
    this.runtime = runtime
    try {
      const hello = await runtime.start()
      const configured = this.options.preferences.load().preferences.network
      if (state.effectiveMode === 'manual') {
        const proxy = configured.manual
        if (proxy === undefined) throw new Error('desktop network: Manual proxy is missing')
        const password = proxy.protocol === 'socks5' || proxy.credentialRef === undefined
          ? undefined : await this.options.secrets.get(proxy.credentialRef)
        await runtime.configure({
          mode: 'manual', strictFallback: true,
          proxy: proxy.protocol === 'socks5' ? proxy : {
            protocol: proxy.protocol, host: proxy.host, port: proxy.port,
            ...(proxy.username === undefined ? {} : { username: proxy.username }),
            ...(password === undefined ? {} : { password }),
          },
        })
      } else {
        await runtime.configure({ mode: 'system', strictFallback: true })
      }
      this.setGateway(hello.gateway)
      this.current = { ...this.state(), runtime: {
        status: 'ready', gateway: hello.gateway,
        protocolVersion: hello.protocolVersion,
        systemBackend: hello.systemBackend,
        capabilities: hello.capabilities,
      } }
      runtime.onEvent((event) => {
        if (event.event === 'runtime-exited') {
          this.current = { ...this.state(), runtime: { ...this.state().runtime, status: 'failed' } }
        }
      })
    } catch (error) {
      this.current = { ...this.state(), runtime: { status: 'failed' } }
      await runtime.shutdown()
      throw error
    }
  }

  /** Stop the Gateway after its consumers have drained. */
  async shutdown(): Promise<void> {
    await this.runtime?.shutdown()
    if (this.current !== undefined) this.current = { ...this.current, runtime: { status: 'stopped' } }
  }

  /**
   * Validate and persist Network settings, then relaunch only after every write succeeds.
   * @param input - Renderer submission containing at most one new password value.
   * @returns never when the relaunch dependency obeys its lifecycle contract.
   */
  async saveAndRestart(input: DesktopNetworkConfigInput): Promise<void> {
    const previous = this.options.preferences.load().preferences.network
    const normalized = normalizeNetworkConfigInput(input, previous.manual, previous.tests)
    const manual = await this.applyPasswordChange(normalized.manual, normalized.passwordChange, previous.manual)
    const network: DesktopNetworkPreferencesV1 = {
      mode: normalized.mode,
      ...(manual === undefined ? {} : { manual }),
      proxyAgentTraffic: normalized.proxyAgentTraffic,
      tests: normalized.tests,
    }
    await this.options.preferences.update({ network })
    await this.options.relaunch()
  }

  /** Persist Default while retaining the Manual draft and encrypted credential. */
  async restoreDefaultAndRestart(): Promise<void> {
    await this.options.preferences.updateNetwork({ mode: 'default', proxyAgentTraffic: false })
    await this.options.relaunch()
  }

  /** Set the ephemeral Gateway returned by a later runtime implementation. */
  setGateway(gateway: DesktopGatewayEndpoint | undefined): void {
    this.gateway = gateway
  }

  /** @param base - Ambient Harness environment. @returns effective routed environment. */
  environmentForHarness(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return environmentForHarnessLaunch(base, this.environmentPolicy())
  }

  /** @param base - Ambient Desktop-owned child environment. @returns effective routed environment. */
  environmentForOwnedChild(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return environmentForOwnedChild(base, this.environmentPolicy())
  }

  /** @param base - Existing Agent child environment. @returns effective opt-in routed environment. */
  environmentForAgent(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return environmentForAgent(base, this.environmentPolicy())
  }

  /** @param ambient - Electron's original environment. @returns Host-only Agent policy. */
  agentProxyPolicyForHost(ambient: NodeJS.ProcessEnv): string | undefined {
    return agentProxyPolicyForHost(ambient, this.environmentPolicy())
  }

  private environmentPolicy(): NetworkEnvironmentPolicy {
    const state = this.state()
    return {
      mode: state.effectiveMode,
      proxyAgentTraffic: state.proxyAgentTraffic,
      ...(this.gateway === undefined ? {} : { gateway: this.gateway }),
    }
  }

  private async applyPasswordChange(
    manual: PersistedManualProxy | undefined,
    change: PasswordChange | undefined,
    previous: PersistedManualProxy | undefined,
  ): Promise<PersistedManualProxy | undefined> {
    if (manual === undefined || manual.protocol === 'socks5') return manual
    const previousRef = previous !== undefined && previous.protocol !== 'socks5'
      ? previous.credentialRef
      : undefined
    if (change === undefined || change.action === 'keep') return withCredentialRef(manual, previousRef)
    if (change.action === 'remove') {
      await this.options.secrets.delete(MANUAL_PROXY_PASSWORD_REF)
      return manual
    }
    await this.options.secrets.put(MANUAL_PROXY_PASSWORD_REF, change.value)
    return withCredentialRef(manual, MANUAL_PROXY_PASSWORD_REF)
  }
}

function sanitizedManualFields(manual: PersistedManualProxy | undefined, active: boolean): {
  manual?: SanitizedManualProxy
  lastManual?: SanitizedManualProxy
} {
  if (manual === undefined) return {}
  const sanitized: SanitizedManualProxy = manual.protocol === 'socks5'
    ? manual
    : {
      protocol: manual.protocol,
      host: manual.host,
      port: manual.port,
      ...(manual.username === undefined ? {} : { username: manual.username }),
      hasPassword: manual.credentialRef !== undefined,
    }
  return { ...(active ? { manual: sanitized } : {}), lastManual: sanitized }
}

function withCredentialRef(
  manual: PersistedAuthenticatedProxy,
  credentialRef: PersistedAuthenticatedProxy['credentialRef'],
): PersistedAuthenticatedProxy {
  return { ...manual, ...(credentialRef === undefined ? {} : { credentialRef }) }
}
