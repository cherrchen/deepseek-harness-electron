/** Authority that owns one catalog entry. */
export type PluginOwnership = 'system' | 'bundled' | 'profile'

/** Installed package behavior recognized by Desktop. */
export type PluginPackageKind = 'runtime-plugin' | 'bundle' | 'dependency'

/** Origin recorded for an installed package. */
export type PluginInstallSource = 'registry' | 'git' | 'local' | 'bundled' | 'unknown'

/** Activation behavior for one catalog entry. */
export type PluginActivation = 'hot' | 'profile-restart' | 'none'

/** Host lifecycle phases exposed to the Electron renderer. */
export type PluginRuntimeState =
  | 'absent'
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'

/** Renderer-facing state for one package in the Desktop plugin catalog. */
export interface PluginLifecycleEntry {
  name: string
  version: string
  description?: string
  ownership: PluginOwnership
  kind: PluginPackageKind
  installSource: PluginInstallSource
  requestedSpec?: string
  hasClient: boolean
  manageable: boolean
  required: boolean
  desiredEnabled?: boolean
  runtime?: PluginRuntimeState
  activation: PluginActivation
}

/** Ordered plugin lifecycle snapshot returned by Electron Main. */
export interface PluginLifecycleSnapshot {
  entries: PluginLifecycleEntry[]
}
