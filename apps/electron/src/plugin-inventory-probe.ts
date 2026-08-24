import { randomUUID } from 'node:crypto'
import type { HarnessTransport } from './harness/transport.ts'

/** Loader fiber states exposed by the Host inventory gateway. */
export type PluginInventoryFiberPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null

/** One current Loader entry returned by the Host inventory gateway. */
export interface PluginInventoryEntry {
  entryId: string
  moduleName: string
  enabled: boolean
  fiberPhase: PluginInventoryFiberPhase
}

/** Snapshot returned by the Host inventory gateway. */
export interface PluginInventorySnapshot {
  entries: PluginInventoryEntry[]
}

/** Host inventory truth used by Electron runtime lifecycle orchestration. */
export interface PluginInventoryProbe {
  /** Read the current Host loader snapshot. */
  list(): Promise<PluginInventorySnapshot>
  /** Release probe resources. The HTTP probe holds none beyond the injected transport. */
  dispose(): Promise<void>
}

/**
 * Typed Main-process wrapper around the existing Host `pluginInventory` Remote namespace.
 */
export class RemotePluginInventoryProbe implements PluginInventoryProbe {
  constructor(private readonly transport: HarnessTransport) {}

  async list(): Promise<PluginInventorySnapshot> {
    const rpcId = randomUUID()
    const response = await this.transport.request({
      url: '/api/pluginInventory/list',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'pluginInventory/list',
        payload: { args: {} },
      }),
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`plugin inventory probe: transport failure: HTTP ${String(response.status)}`)
    }
    const envelope = JSON.parse(response.body) as {
      rpcId?: unknown
      result?: {
        ok?: unknown
        value?: unknown
        error?: { code?: unknown; message?: unknown }
      }
    }
    if (envelope.rpcId !== rpcId) {
      throw new Error(`plugin inventory probe: rpcId mismatch: sent ${rpcId}, got ${String(envelope.rpcId)}`)
    }
    if (envelope.result?.ok !== true) {
      const code = envelope.result?.error?.code
      const message = envelope.result?.error?.message
      throw new Error(`plugin inventory probe: pluginInventory.list failed: ${String(code)}: ${String(message)}`)
    }
    return parsePluginInventorySnapshot(envelope.result.value)
  }

  dispose(): Promise<void> {
    return Promise.resolve()
  }
}

function parsePluginInventorySnapshot(value: unknown): PluginInventorySnapshot {
  if (typeof value !== 'object' || value === null || !('entries' in value) || !Array.isArray(value.entries)) {
    throw new Error('plugin inventory probe: invalid snapshot payload')
  }
  const entries = value.entries.map(entry => parsePluginInventoryEntry(entry))
  return { entries }
}

function parsePluginInventoryEntry(value: unknown): PluginInventoryEntry {
  if (typeof value !== 'object' || value === null) {
    throw new Error('plugin inventory probe: invalid entry payload')
  }
  const record = value as {
    entryId?: unknown
    moduleName?: unknown
    enabled?: unknown
    fiberPhase?: unknown
  }
  if (typeof record.entryId !== 'string'
    || typeof record.moduleName !== 'string'
    || typeof record.enabled !== 'boolean'
    || !isValidFiberPhase(record.fiberPhase)) {
    throw new Error('plugin inventory probe: invalid entry fields')
  }
  return {
    entryId: record.entryId,
    moduleName: record.moduleName,
    enabled: record.enabled,
    fiberPhase: record.fiberPhase,
  }
}

function isValidFiberPhase(value: unknown): value is PluginInventoryFiberPhase {
  return value === null
    || value === 'pending'
    || value === 'loading'
    || value === 'active'
    || value === 'failed'
    || value === 'unloading'
}
