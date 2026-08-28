import type { ManagedPlugin } from './runtime-plugins.ts'
import type { PendingPluginRestartChange } from './plugin-lifecycle-contract.ts'

type RestartOperation = PendingPluginRestartChange['operation']

interface PackageBaseline {
  kind: ManagedPlugin['kind']
  version: string
}

/** Tracks disk composition changes that the running Host can apply only at startup. */
export class PluginRestartTracker {
  private readonly baseline: ReadonlyMap<string, PackageBaseline>
  private pending: PendingPluginRestartChange[] = []
  private readonly forced = new Map<string, Extract<RestartOperation, 'update' | 'reinstall'>>()

  /** @param startupEntries - Profile packages observed before the Host starts. */
  constructor(startupEntries: readonly ManagedPlugin[]) {
    this.baseline = new Map(startupEntries
      .filter(entry => entry.ownership === 'profile')
      .map(entry => [entry.name, { kind: entry.kind, version: entry.version }]))
  }

  /** Reconcile pending restart facts against current disk state. */
  reconcile(currentEntries: readonly ManagedPlugin[], operation: RestartOperation, mutatedName?: string): void {
    const current = new Map(currentEntries
      .filter(entry => entry.ownership === 'profile')
      .map(entry => [entry.name, { kind: entry.kind, version: entry.version }]))
    const changes: PendingPluginRestartChange[] = []
    if ((operation === 'update' || operation === 'reinstall') && mutatedName !== undefined) {
      const before = this.baseline.get(mutatedName)
      const after = current.get(mutatedName)
      if (before?.kind === 'bundle' || after?.kind === 'bundle') this.forced.set(mutatedName, operation)
    }
    if (operation === 'install' && mutatedName !== undefined) {
      const before = this.baseline.get(mutatedName)
      const after = current.get(mutatedName)
      if (before?.kind === 'bundle' && after?.kind === 'bundle') this.forced.set(mutatedName, 'reinstall')
    }
    for (const name of new Set([...this.baseline.keys(), ...current.keys()])) {
      const before = this.baseline.get(name)
      const after = current.get(name)
      if (after === undefined) this.forced.delete(name)
      const forcedOperation = this.forced.get(name)
      if (samePackage(before, after) && forcedOperation === undefined) continue
      if (before?.kind !== 'bundle' && after?.kind !== 'bundle') continue
      changes.push({
        name,
        operation: before === undefined ? 'install' : after === undefined ? 'remove' : forcedOperation ?? operation,
        ...(before === undefined ? {} : { previousVersion: before.version }),
        ...(after === undefined ? {} : { targetVersion: after.version }),
      })
    }
    this.pending = changes.sort((left, right) => left.name.localeCompare(right.name))
  }

  /** @returns immutable pending restart changes for the active Host. */
  list(): PendingPluginRestartChange[] {
    return this.pending.map(change => ({ ...change }))
  }
}

function samePackage(left: PackageBaseline | undefined, right: PackageBaseline | undefined): boolean {
  return left?.kind === right?.kind && left?.version === right?.version
}
