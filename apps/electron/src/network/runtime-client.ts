/** Main-owned JSONL subprocess client; credentials travel only through private stdin. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { DesktopNetworkOperationError } from './errors.ts'
import type { RuntimeNetworkConfig } from './domain.ts'
import { resolveNetworkRuntimePath } from './runtime-path.ts'
import type { RuntimeCommand, RuntimeHelloResult, RuntimeLimits } from './runtime-protocol.ts'

const MAX_FRAME_BYTES = 1024 * 1024

/** Application-owned helper location and deadlines; no PATH lookup or shell invocation. */
export interface NetworkRuntimeClientOptions {
  appPath: string
  resourcesPath: string
  packaged: boolean
  requestTimeoutMs?: number
  shutdownTimeoutMs?: number
}

/** Sanitized runtime observation available only to Main. */
export interface NetworkRuntimeObservation {
  event: string
  payload: unknown
}

/** Single-use Runtime lifecycle. Any transport/protocol timeout terminates the helper. */
export class NetworkRuntimeClient {
  private child: ChildProcessWithoutNullStreams | undefined
  private exited: Promise<void> = Promise.resolve()
  private pending = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private listeners = new Set<(event: NetworkRuntimeObservation) => void>()
  private sequence = 0
  private buffer = Buffer.alloc(0)
  private stopping = false
  private started = false
  private failure: DesktopNetworkOperationError | undefined

  /** @param options - Fixed application resource roots and bounded request deadlines. */
  constructor(private readonly options: NetworkRuntimeClientOptions) {}

  /** Start once and validate hello before permitting configuration. @returns negotiated capabilities and loopback endpoint. */
  async start(): Promise<RuntimeHelloResult> {
    if (this.started) throw new Error('desktop network: runtime client is single-use')
    this.started = true
    try {
      const path = resolveNetworkRuntimePath(this.options)
      const env: NodeJS.ProcessEnv = {}
      for (const key of ['SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP']) {
        const value = process.env[key]
        if (value !== undefined) env[key] = value
      }
      const child = spawn(path, [], { stdio: 'pipe', windowsHide: true, env })
      this.child = child
      this.exited = new Promise((resolve) => {
        child.once('close', () => {
          if (!this.stopping) this.fail('NETWORK_RUNTIME_EXITED')
          else this.rejectPending(new DesktopNetworkOperationError('NETWORK_RUNTIME_EXITED', 'Network Runtime stopped.'))
          resolve()
        })
      })
      child.on('error', () => { this.fail('NETWORK_RUNTIME_START_FAILED') })
      child.stdin.on('error', () => { this.fail('NETWORK_RUNTIME_EXITED') })
      child.stdout.on('data', (chunk: Buffer) => { this.receive(chunk) })
      // Drain stderr without forwarding arbitrary native text into application logs.
      child.stderr.resume()
      const hello = await this.request('hello', {})
      if (!isHello(hello)) {
        throw this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH')
      }
      return hello
    } catch {
      const failure = this.fail(this.failure?.code ?? 'NETWORK_RUNTIME_START_FAILED')
      await this.exited
      throw failure
    }
  }

  /**
   * Replace the active route and cancel old tunnels.
   * @param config - In-memory route, including optional ephemeral password.
   * @param limits - Runtime resource deadlines.
   */
  async configure(config: RuntimeNetworkConfig, limits?: RuntimeLimits): Promise<void> {
    await this.request('configure', { config, ...(limits === undefined ? {} : { limits }) })
  }

  /** @returns whether a validated route has been configured; never returns credentials. */
  async diagnostics(): Promise<{ configured: boolean }> {
    const result = await this.request('get_diagnostics', {})
    if (!isRecord(result) || typeof result.configured !== 'boolean') {
      throw this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH')
    }
    return { configured: result.configured }
  }

  /** @param listener - Main-only event consumer. @returns subscription disposer. */
  onEvent(listener: (event: NetworkRuntimeObservation) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Drain the Gateway, then wait for process exit; terminate a stalled helper within the shutdown deadline. */
  async shutdown(): Promise<void> {
    if (this.stopping) { await this.exited; return }
    this.stopping = true
    const child = this.child
    if (child === undefined) return
    const kill = setTimeout(() => { child.kill('SIGKILL') }, this.options.shutdownTimeoutMs ?? 10_000)
    try {
      if (this.failure === undefined) {
        try { await this.request('shutdown', {}) } catch { /* Failed transport is already terminated by fail(). */ }
      }
      child.stdin.end()
      await this.exited
    } finally {
      clearTimeout(kill)
      this.rejectPending(new DesktopNetworkOperationError('NETWORK_RUNTIME_EXITED', 'Network Runtime stopped.'))
      this.listeners.clear()
    }
  }

  private request(type: RuntimeCommand, payload: unknown): Promise<unknown> {
    if (this.failure !== undefined) return Promise.reject(this.failure)
    const child = this.child
    if (child === undefined || (this.stopping && type !== 'shutdown')) return Promise.reject(new Error('desktop network: runtime is not active'))
    const id = String(++this.sequence)
    const frame = Buffer.from(`${JSON.stringify({ v: 1, id, type, payload })}\n`)
    if (frame.byteLength > MAX_FRAME_BYTES) {
      frame.fill(0)
      return Promise.reject(new DesktopNetworkOperationError('INVALID_CONFIG', 'Network Runtime request exceeds the frame limit.'))
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.fail('NETWORK_RUNTIME_EXITED') }, this.options.requestTimeoutMs ?? 40_000)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(frame, () => { frame.fill(0) })
    })
  }

  private receive(chunk: Buffer): void {
    if (this.failure !== undefined) return
    this.buffer = Buffer.concat([this.buffer, chunk])
    let newline: number
    while ((newline = this.buffer.indexOf(10)) !== -1) {
      if (newline > MAX_FRAME_BYTES) { this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH'); return }
      const line = this.buffer.subarray(0, newline)
      this.buffer = this.buffer.subarray(newline + 1)
      let frame: unknown
      try { frame = JSON.parse(line.toString('utf8')) } catch { this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH'); return }
      if (!isRecord(frame) || frame.v !== 1) { this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH'); return }
      if (typeof frame.event === 'string' && EVENT_NAMES.has(frame.event) && 'payload' in frame) {
        this.emit({ event: frame.event, payload: frame.payload })
        continue
      }
      const pending = typeof frame.id === 'string' ? this.pending.get(frame.id) : undefined
      if (pending === undefined || typeof frame.ok !== 'boolean') { this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH'); return }
      this.pending.delete(frame.id as string)
      clearTimeout(pending.timer)
      if (frame.ok && 'result' in frame) pending.resolve(frame.result)
      else if (!frame.ok && isRecord(frame.error) && typeof frame.error.code === 'string') {
        const code = frame.error.code === 'INVALID_CONFIG' || frame.error.code === 'SYSTEM_PROXY_BACKEND_UNAVAILABLE'
          ? frame.error.code : 'NETWORK_RUNTIME_PROTOCOL_MISMATCH'
        pending.reject(new DesktopNetworkOperationError(code, 'Network Runtime rejected the request.'))
        if (code === 'NETWORK_RUNTIME_PROTOCOL_MISMATCH') this.fail(code)
      } else {
        pending.reject(new DesktopNetworkOperationError('NETWORK_RUNTIME_PROTOCOL_MISMATCH', 'Invalid Network Runtime response.'))
        this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH')
      }
    }
    if (this.buffer.byteLength > MAX_FRAME_BYTES) this.fail('NETWORK_RUNTIME_PROTOCOL_MISMATCH')
  }

  private fail(code: DesktopNetworkOperationError['code']): DesktopNetworkOperationError {
    if (this.failure !== undefined) return this.failure
    this.failure = new DesktopNetworkOperationError(code, 'Network Runtime is unavailable; managed traffic remains blocked.')
    this.rejectPending(this.failure)
    this.child?.kill('SIGKILL')
    this.buffer = Buffer.alloc(0)
    if (!this.stopping) this.emit({ event: 'runtime-exited', payload: { code } })
    return this.failure
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
  }

  private emit(event: NetworkRuntimeObservation): void {
    for (const listener of this.listeners) {
      try { listener(event) } catch { console.warn('desktop network: runtime event listener failed') }
    }
  }
}

const EVENT_NAMES = new Set(['ready', 'system_policy_changed', 'network_changed', 'route_selected', 'proxy_failure', 'credential_required', 'credential_rejected', 'runtime_warning'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHello(value: unknown): value is RuntimeHelloResult {
  if (!isRecord(value) || value.protocolVersion !== 1 || value.systemBackend !== 'unsupported' || !isRecord(value.gateway)) return false
  if (value.gateway.host !== '127.0.0.1' || !Number.isInteger(value.gateway.port) || Number(value.gateway.port) < 1 || Number(value.gateway.port) > 65535) return false
  if (!isRecord(value.capabilities)) return false
  for (const [group, keys] of Object.entries({ manual: ['http', 'https', 'socks5', 'socks5Auth'], system: ['manual', 'pac', 'wpad', 'watchers'], auth: ['basic', 'digest', 'ntlm', 'negotiate'] })) {
    const capabilities = value.capabilities[group]
    if (!isRecord(capabilities) || keys.some(key => typeof capabilities[key] !== 'boolean')) return false
  }
  return true
}
