/** Authority that owns one catalog entry. */
export type PluginOwnership = 'system' | 'bundled' | 'profile'

/** Installed package behavior recognized by Desktop. */
export type PluginPackageKind = 'runtime-plugin' | 'bundle' | 'dependency'

/** Origin recorded for an installed package. */
export type PluginInstallSource = 'registry' | 'git' | 'local' | 'bundled' | 'unknown'

/** Activation mechanism supported by one installed package. */
export type PluginActivationMode = 'hot' | 'profile-restart' | 'none'

/** Whether one installed package is ready for its declared activation mechanism. */
export type PluginPackageHealth = 'healthy' | 'reconcile-required'

/** Main-owned package actions that the Renderer may request. */
export interface PluginPackageActions {
  checkUpdates: boolean
  update: 'registry' | 'source-refresh' | false
  reinstall: boolean
  remove: boolean
}

/** Serialized mutation descriptor exposed while Main owns plugin state. */
export interface PluginMutationDescriptor {
  kind: 'install' | 'enable' | 'disable' | 'reload' | 'check-updates' | 'update' | 'remove' | 'reinstall'
  plugin?: string
}

/** Package composition change that the running Host cannot apply dynamically. */
export interface PendingPluginRestartChange {
  name: string
  operation: 'install' | 'update' | 'remove' | 'reinstall'
  previousVersion?: string
  targetVersion?: string
}

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
  activationMode: PluginActivationMode
  health: PluginPackageHealth
  packageActions: PluginPackageActions
}

/** Ordered plugin lifecycle snapshot returned by Electron Main. */
export interface PluginLifecycleSnapshot {
  entries: PluginLifecycleEntry[]
  pendingRestart: PendingPluginRestartChange[]
  activeOperation?: PluginMutationDescriptor
}
