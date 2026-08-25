import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginLifecycleController } from './plugin-lifecycle.ts'
import type { PluginCatalog } from './plugin-catalog.ts'
import {
  normalizePluginInstallRequest,
  PluginInstallError,
  type PluginInstallRequest,
  type PluginInstallResult,
} from './plugin-install-contract.ts'
import { inspectProfilePackageState } from './plugin-package-inspector.ts'
import type { PluginMutationCoordinator } from './plugin-mutation.ts'
import {
  parsePluginUpdates,
  PluginPackageError,
  type PluginPackageCommand,
  type PluginPackageMutationResult,
  type PluginUpdateInfo,
} from './plugin-package-contract.ts'
import type { PluginRestartTracker } from './plugin-restart-tracker.ts'
import { loadPluginState, savePluginState } from './plugin-state.ts'

/** Captured dsh plugin subprocess result. */
export interface PluginCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

/** Injectable command executor for the upstream dsh plugin interface. */
export type PluginCommandRunner = (command: PluginPackageCommand) => Promise<PluginCommandResult>

/**
 * Build the packaged `dsh plugin --profile web` command runner.
 * @param options - Executable, profile, Harness home, and controlled PATH values.
 * @returns command runner that captures upstream diagnostics.
 */
export function createPluginCommandRunner(options: {
  electronExecutable: string
  dshBin: string
  harnessHome: string
  profile: string
  envPath: string
}): PluginCommandRunner {
  return async command => await new Promise((resolve, reject) => {
    const args = pluginCommandArguments(command)
    const child = spawn(options.electronExecutable, [
      '--expose-internals',
      options.dshBin,
      'plugin',
      '--profile',
      options.profile,
      ...args,
    ], {
      env: {
        ...safeInstallEnvironment(process.env),
        DSH_HOME: options.harnessHome,
        ELECTRON_RUN_AS_NODE: '1',
        PATH: options.envPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code) => { resolve({ exitCode: code ?? 1, stdout, stderr }) })
  })
}

/**
 * Convert a typed package command into arguments understood by every bundled dsh launcher.
 * @param command - Validated package command.
 * @returns arguments following `dsh plugin --profile <name>`.
 */
export function pluginCommandArguments(command: PluginPackageCommand): string[] {
  switch (command.kind) {
    case 'add': return ['add', command.spec, ...(command.force === true ? ['--force'] : [])]
    case 'remove': return ['remove', command.name]
    case 'update': return ['update', command.name]
    case 'outdated': return ['outdated', '--format', 'json']
    default: {
      const _exhaustive: never = command
      return _exhaustive
    }
  }
}

function safeInstallEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !/(?:KEY|SECRET|TOKEN|PASSWORD)/i.test(name)))
}

/** Installs profile packages through upstream dsh and activates ordinary runtime plugins. */
export class PluginPackageService {
  /**
   * @param profileDir - Absolute active profile directory.
   * @param statePath - Desktop plugin state file.
   * @param runCommand - Upstream dsh plugin command executor.
   * @param lifecycle - Runtime activation controller.
   * @param mutations - Coordinator shared with lifecycle actions.
   * @param reservedPackageNames - Distribution-owned package names that profile dependencies cannot shadow.
   */
  constructor(
    private readonly profileDir: string,
    private readonly statePath: string,
    private readonly runCommand: PluginCommandRunner,
    private readonly lifecycle: PluginLifecycleController,
    private readonly mutations: PluginMutationCoordinator,
    private readonly reservedPackageNames: ReadonlySet<string> = new Set(),
    private readonly catalog?: PluginCatalog,
    private readonly restartTracker?: PluginRestartTracker,
  ) {}

  /**
   * Install one package and return its real installed identity and activation outcome.
   * @param request - Typed package source request from the Renderer.
   * @returns installed package classification.
   */
  install(request: PluginInstallRequest): Promise<PluginInstallResult> {
    return this.mutations.run({ kind: 'install' }, async () => {
      const normalized = normalizePluginInstallRequest(request)
      if (normalized.source === 'local') {
        const path = normalized.spec.replace(/^(?:file|link):/, '')
        if (!existsSync(path)) throw new PluginInstallError('local-path-missing', `Local plugin path does not exist: ${path}`)
      }
      const registryName = normalized.source === 'registry' ? registryPackageName(normalized.spec) : undefined
      if (registryName !== undefined && this.reservedPackageNames.has(registryName)) {
        throw packageConflict(registryName)
      }
      const before = readDependencies(this.profileDir)
      let command: PluginCommandResult
      try {
        command = await this.runCommand({ kind: 'add', spec: normalized.spec })
      } catch (error) {
        throw new PluginInstallError('package-manager-failed', 'The plugin package manager could not start.', String(error))
      }
      const after = readDependencies(this.profileDir)
      const changedDependencies = changedDependencyNames(before, after)
      if (command.exitCode !== 0) {
        if (changedDependencies.length > 0) await this.reconcileRestart('install')
        throw classifyCommandFailure(command.stderr, changedDependencies)
      }
      let dependencyName: string
      let inspected: ReturnType<typeof inspectProfilePackageState>
      try {
        dependencyName = identifyInstalledDependency(before, after, normalized.spec)
        inspected = inspectProfilePackageState(this.profileDir, dependencyName)
      } catch (error) {
        throw markProfileChanged(error, changedDependencies.length > 0)
      }
      if (this.reservedPackageNames.has(inspected.name)) {
        throw await this.rollbackPackageConflict(inspected.name, dependencyName, before[dependencyName])
      }
      if (inspected.entryProblem !== undefined) {
        throw new PluginInstallError(
          'invalid-package',
          `Installed package ${inspected.name} is invalid.`,
          inspected.entryProblem,
          changedDependencies.length > 0,
        )
      }
      const loaded = loadPluginState(this.statePath)
      const shouldManage = inspected.kind === 'runtime-plugin'
      const state = !shouldManage || loaded.state.profileManaged.includes(inspected.name)
        ? loaded.state
        : { ...loaded.state, profileManaged: [...loaded.state.profileManaged, inspected.name] }
      await savePluginState(this.statePath, state)

      if (inspected.kind === 'runtime-plugin') {
        try {
          await this.lifecycle.activateInstalled(inspected.name)
        } catch (error) {
          throw new PluginInstallError(
            'activation-failed',
            `${inspected.name} was installed but could not be activated.`,
            String(error),
            true,
          )
        }
      }
      await this.reconcileRestart('install', inspected.name)
      return {
        name: inspected.name,
        version: inspected.version,
        kind: inspected.kind,
        activation: inspected.kind === 'runtime-plugin'
          ? 'activated'
          : inspected.kind === 'bundle' ? 'restart-required' : 'not-applicable',
        source: normalized.source,
      }
    })
  }

  /** Check registry-owned profile dependencies without querying Git or local sources. */
  checkUpdates(): Promise<PluginUpdateInfo[]> {
    return this.mutations.run({ kind: 'check-updates' }, async () => {
      const eligible = new Set((await this.requireCatalog().list())
        .filter(entry => entry.ownership === 'profile' && entry.packageActions.checkUpdates)
        .map(entry => entry.name))
      if (eligible.size === 0) return []
      let command: PluginCommandResult
      try {
        command = await this.runCommand({ kind: 'outdated' })
      } catch (error) {
        throw new PluginPackageError('update-check-failed', 'Could not check plugins for updates.', 'unchanged', String(error))
      }
      if (command.stdout.trim().length === 0 && command.exitCode === 0) return []
      let updates: PluginUpdateInfo[]
      try {
        updates = parsePluginUpdates(command.stdout)
      } catch (error) {
        if (error instanceof PluginPackageError && command.stderr.trim().length > 0) {
          throw new PluginPackageError(error.code, error.message, error.recovery, command.stderr.trim())
        }
        throw error
      }
      if (command.exitCode !== 0 && updates.length === 0) {
        throw new PluginPackageError('update-check-failed', 'Could not check plugins for updates.', 'unchanged', command.stderr.trim())
      }
      return updates.filter(update => eligible.has(update.name))
    })
  }

  /** Update one Registry package or refresh its Git/local source. */
  update(name: string): Promise<PluginPackageMutationResult> {
    return this.mutatePackage('update', name)
  }

  /** Re-resolve one dependency from its current requested spec. */
  reinstall(name: string): Promise<PluginPackageMutationResult> {
    return this.mutatePackage('reinstall', name)
  }

  /** Remove one direct profile dependency after its runtime code becomes quiescent. */
  remove(name: string): Promise<PluginPackageMutationResult> {
    return this.mutatePackage('remove', name)
  }

  private mutatePackage(
    operation: 'update' | 'reinstall' | 'remove',
    name: string,
  ): Promise<PluginPackageMutationResult> {
    return this.mutations.run({ kind: operation, plugin: name }, async () => {
      const catalog = this.requireCatalog()
      const beforeEntries = await catalog.list()
      const entry = beforeEntries.find(candidate => candidate.name === name)
      if (entry === undefined || entry.ownership !== 'profile') {
        throw new PluginPackageError('package-not-manageable', `${name} is not a profile package.`, 'unchanged')
      }
      const allowed = operation === 'remove'
        ? entry.packageActions.remove
        : operation === 'reinstall' ? entry.packageActions.reinstall : entry.packageActions.update !== false
      if (!allowed) {
        throw new PluginPackageError('package-not-manageable', `${name} does not support ${operation}.`, 'unchanged')
      }
      const beforeDisk = readPackageDiskSnapshot(this.profileDir, name)
      let token: Awaited<ReturnType<PluginLifecycleController['quiesceForPackageMutation']>>
      try {
        token = await this.lifecycle.quiesceForPackageMutation(name)
      } catch (error) {
        throw new PluginPackageError('runtime-quiesce-failed', `${name} could not be unloaded for ${operation}.`, 'unchanged', String(error))
      }
      let command: PluginCommandResult
      try {
        command = await this.runCommand(operation === 'remove'
          ? { kind: 'remove', name }
          : operation === 'update' && entry.installSource !== 'local'
            ? { kind: 'update', name }
            : { kind: 'add', spec: entry.requestedSpec ?? name, force: true })
      } catch (error) {
        return await this.failMutation(operation, name, token, beforeDisk, String(error))
      }
      if (command.exitCode !== 0) {
        return await this.failMutation(operation, name, token, beforeDisk, command.stderr.trim())
      }
      const afterDependencies = readDependencies(this.profileDir)
      if (operation === 'remove' && afterDependencies[name] !== undefined) {
        return await this.failMutation(operation, name, token, beforeDisk, 'The dependency remains in the profile manifest.')
      }
      if (operation !== 'remove' && afterDependencies[name] === undefined) {
        return await this.failMutation(operation, name, token, beforeDisk, 'The dependency is missing from the profile manifest.')
      }
      if (operation === 'remove') {
        const loaded = loadPluginState(this.statePath).state
        await savePluginState(this.statePath, {
          ...loaded,
          disabled: loaded.disabled.filter(candidate => candidate !== name),
          profileManaged: loaded.profileManaged.filter(candidate => candidate !== name),
        })
        await this.lifecycle.refreshAfterPackageRemoval(token.hasClient)
        await this.reconcileRestart('remove', name)
        return {
          name,
          operation,
          previousVersion: entry.version,
          restartRequired: this.restartTracker?.list().some(change => change.name === name) ?? false,
        }
      }
      const inspected = inspectProfilePackageState(this.profileDir, name)
      if (inspected.entryProblem !== undefined) {
        await this.reconcileRestart(operation, name)
        throw new PluginPackageError(
          operation === 'update' ? 'update-failed' : 'reinstall-failed',
          `${name} is installed but requires repair.`,
          'profile-changed',
          inspected.entryProblem,
        )
      }
      const state = loadPluginState(this.statePath).state
      const startedAsBundle = entry.kind === 'bundle'
      if (inspected.kind === 'runtime-plugin' && !startedAsBundle && state.profileManaged.includes(name)) {
        try {
          await this.lifecycle.activateAfterPackageMutation(name)
        } catch (error) {
          await this.reconcileRestart(operation, name)
          throw new PluginPackageError(
            'runtime-activation-failed',
            `${name} was ${operation === 'update' ? 'updated' : 'reinstalled'} but could not be activated.`,
            'profile-changed',
            String(error),
          )
        }
      }
      await this.reconcileRestart(operation, name)
      return {
        name,
        operation,
        previousVersion: entry.version,
        version: inspected.version,
        kind: inspected.kind,
        restartRequired: this.restartTracker?.list().some(change => change.name === name) ?? false,
      }
    })
  }

  private async failMutation(
    operation: 'update' | 'reinstall' | 'remove',
    name: string,
    token: Awaited<ReturnType<PluginLifecycleController['quiesceForPackageMutation']>>,
    beforeDisk: PackageDiskSnapshot,
    details: string,
  ): Promise<never> {
    const changed = !sameDiskSnapshot(beforeDisk, readPackageDiskSnapshot(this.profileDir, name))
    if (changed) {
      await this.reconcileRestart(operation, name)
      throw new PluginPackageError(errorCode(operation), `${capitalize(operation)} failed after the profile changed.`, 'profile-changed', details)
    }
    try {
      await this.lifecycle.restoreAfterPackageMutation(token)
    } catch (error) {
      throw new PluginPackageError('runtime-restore-failed', `${capitalize(operation)} failed and ${name} could not be restored.`, 'unchanged', `${details}\n${String(error)}`)
    }
    throw new PluginPackageError(errorCode(operation), `${capitalize(operation)} failed.`, token.wasActive ? 'restored' : 'unchanged', details)
  }

  private requireCatalog(): PluginCatalog {
    if (this.catalog === undefined) throw new Error('plugin package service: profile catalog is unavailable')
    return this.catalog
  }

  private async reconcileRestart(operation: 'install' | 'update' | 'remove' | 'reinstall', name?: string): Promise<void> {
    if (this.restartTracker === undefined || this.catalog === undefined) return
    this.restartTracker.reconcile(await this.catalog.list(), operation, name)
  }

  private async rollbackPackageConflict(
    packageName: string,
    dependencyName: string,
    previousSpec: string | undefined,
  ): Promise<PluginInstallError> {
    if (previousSpec !== undefined) {
      return new PluginInstallError(
        'package-conflict',
        packageConflict(packageName).message,
        `The conflicting dependency already existed with spec ${previousSpec}; remove ${dependencyName} from the web profile before restarting Desktop.`,
        true,
      )
    }
    let rollback: PluginCommandResult
    try {
      rollback = await this.runCommand({ kind: 'remove', name: dependencyName })
    } catch (error) {
      return new PluginInstallError(
        'package-conflict',
        packageConflict(packageName).message,
        `Automatic removal could not start: ${String(error)}`,
        true,
      )
    }
    const restored = rollback.exitCode === 0 && readDependencies(this.profileDir)[dependencyName] === undefined
    return new PluginInstallError(
      'package-conflict',
      packageConflict(packageName).message,
      restored
        ? 'The newly added conflicting dependency was removed from the web profile.'
        : `Automatic removal failed. Remove ${dependencyName} from the web profile before restarting Desktop.\n${rollback.stderr.trim()}`,
      !restored,
    )
  }
}

function errorCode(operation: 'update' | 'reinstall' | 'remove'): 'update-failed' | 'reinstall-failed' | 'remove-failed' {
  return operation === 'update' ? 'update-failed' : operation === 'reinstall' ? 'reinstall-failed' : 'remove-failed'
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`
}

function registryPackageName(spec: string): string | undefined {
  return /^(?<name>(?:@[^/@]+\/)?[^/@]+)@/.exec(spec)?.groups?.name
}

function packageConflict(packageName: string): PluginInstallError {
  return new PluginInstallError(
    'package-conflict',
    `${packageName} is provided by Desktop and cannot be installed into the web profile because it would shadow required application code.`,
  )
}

function markProfileChanged(error: unknown, profileChanged: boolean): unknown {
  if (!profileChanged || !(error instanceof PluginInstallError) || error.profileChanged) return error
  return new PluginInstallError(error.code, error.message, error.details, true)
}

function readDependencies(profileDir: string): Record<string, string> {
  const path = join(profileDir, 'package.json')
  if (!existsSync(path)) return {}
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: Record<string, string> }
    return manifest.dependencies ?? {}
  } catch (error) {
    throw new PluginInstallError('profile-reconcile-failed', `The web profile manifest is invalid: ${path}`, String(error))
  }
}

interface PackageDiskSnapshot {
  dependencies: Record<string, string>
  lockfile?: string
  installedManifest?: string
}

function readPackageDiskSnapshot(profileDir: string, name: string): PackageDiskSnapshot {
  const lockfilePath = join(profileDir, 'pnpm-lock.yaml')
  const installedManifestPath = join(profileDir, 'node_modules', ...name.split('/'), 'package.json')
  return {
    dependencies: readDependencies(profileDir),
    ...(existsSync(lockfilePath) ? { lockfile: readFileSync(lockfilePath, 'utf8') } : {}),
    ...(existsSync(installedManifestPath) ? { installedManifest: readFileSync(installedManifestPath, 'utf8') } : {}),
  }
}

function sameDiskSnapshot(left: PackageDiskSnapshot, right: PackageDiskSnapshot): boolean {
  return JSON.stringify(left.dependencies) === JSON.stringify(right.dependencies)
    && left.lockfile === right.lockfile
    && left.installedManifest === right.installedManifest
}

function identifyInstalledDependency(
  before: Record<string, string>,
  after: Record<string, string>,
  requestedSpec: string,
): string {
  const changed = Object.keys(after).filter(name => before[name] !== after[name])
  const [changedName] = changed
  if (changedName !== undefined && changed.length === 1) return changedName
  const registryName = /^(?<name>(?:@[^/@]+\/)?[^/@]+)(?:@.+)?$/.exec(requestedSpec)?.groups?.name
  if (registryName !== undefined && after[registryName] !== undefined) return registryName
  const matchingSpecs = Object.keys(after).filter(name => after[name] === requestedSpec)
  if (matchingSpecs.length === 1 && matchingSpecs[0] !== undefined) return matchingSpecs[0]
  throw new PluginInstallError('profile-reconcile-failed', 'The installed package could not be identified in the web profile.')
}

function changedDependencyNames(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(name => before[name] !== after[name])
}

function classifyCommandFailure(stderr: string, changedDependencies: readonly string[]): PluginInstallError {
  const details = stderr.trim()
  const residue = changedDependencies.length === 0
    ? ''
    : ` Profile dependencies changed before pnpm stopped: ${changedDependencies.join(', ')}. The resulting packages remain installed but inactive.`
  if (/allowBuilds|approve-builds|ignored build scripts/i.test(stderr)) {
    const blocked = blockedBuildPackages(stderr)
    const subject = blocked.length === 0 ? 'one or more packages' : blocked.join(', ')
    return new PluginInstallError(
      'build-script-blocked',
      `pnpm blocked install-time build scripts required by the current web profile: ${subject}. Review those packages before allowing them.${residue}`,
      details,
      changedDependencies.length > 0,
    )
  }
  if (/ERR_PNPM_FETCH_404|404 Not Found/i.test(stderr)) {
    return new PluginInstallError('package-not-found', `The requested plugin package was not found.${residue}`, details, changedDependencies.length > 0)
  }
  if (/authentication failed|permission denied \(publickey\)|repository not found/i.test(stderr)) {
    return new PluginInstallError('git-auth-failed', `Git could not authenticate to the repository.${residue}`, details, changedDependencies.length > 0)
  }
  if (/git.*(?:not found|ENOENT)/i.test(stderr)) {
    return new PluginInstallError('git-unavailable', `Git is unavailable on this system.${residue}`, details, changedDependencies.length > 0)
  }
  return new PluginInstallError('package-manager-failed', `Plugin installation failed.${residue}`, details, changedDependencies.length > 0)
}

function blockedBuildPackages(stderr: string): string[] {
  const plain = stderr.replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
  const list = /Ignored build scripts?:\s*([^\n]+)/i.exec(plain)?.[1]
  return list === undefined ? [] : list.split(',').map(value => value.trim()).filter(Boolean)
}
