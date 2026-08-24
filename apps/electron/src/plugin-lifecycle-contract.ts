/** Distribution origin of one plugin managed by Electron. */
export type ManagedPluginSource = 'desktop-runtime' | 'ecosystem'

/** Host lifecycle phases exposed to the Electron renderer. */
export type PluginRuntimeState =
  | 'absent'
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'

/** Renderer-facing lifecycle state for one plugin bundled with Desktop. */
export interface PluginLifecycleEntry {
  name: string
  version: string
  description?: string
  source: ManagedPluginSource
  hasClient: boolean
  manageable: boolean
  required: boolean
  desiredEnabled: boolean
  runtime: PluginRuntimeState
}

/** Ordered plugin lifecycle snapshot returned by Electron Main. */
export interface PluginLifecycleSnapshot {
  entries: PluginLifecycleEntry[]
}
