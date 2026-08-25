import { describe, expect, it } from 'vitest'
import { PluginRestartTracker } from '../src/plugin-restart-tracker.ts'
import type { ManagedPlugin } from '../src/runtime-plugins.ts'

const packageActions = { checkUpdates: false, update: 'source-refresh', reinstall: true, remove: true } as const

function entry(name: string, kind: ManagedPlugin['kind'], version: string): ManagedPlugin {
  return {
    name,
    version,
    directoryName: name,
    rootPath: `/profile/${name}`,
    hasClient: false,
    ownership: 'profile',
    kind,
    installSource: 'git',
    requestedSpec: `github:fixture/${name}`,
    manageable: false,
    required: false,
    activationMode: kind === 'bundle' ? 'profile-restart' : kind === 'runtime-plugin' ? 'hot' : 'none',
    health: 'healthy',
    packageActions,
  }
}

describe('plugin restart tracker', () => {
  it('starts empty and records bundle install, update, and removal against the Host baseline', () => {
    const bundle = entry('bundle', 'bundle', '1.0.0')
    const tracker = new PluginRestartTracker([bundle])
    expect(tracker.list()).toEqual([])

    tracker.reconcile([entry('bundle', 'bundle', '1.1.0')], 'update', 'bundle')
    expect(tracker.list()).toEqual([{
      name: 'bundle', operation: 'update', previousVersion: '1.0.0', targetVersion: '1.1.0',
    }])

    tracker.reconcile([], 'remove', 'bundle')
    expect(tracker.list()).toEqual([{
      name: 'bundle', operation: 'remove', previousVersion: '1.0.0',
    }])
  })

  it('retains same-version source refreshes and clears an install removed before restart', () => {
    const baseline = entry('baseline', 'bundle', '1.0.0')
    const tracker = new PluginRestartTracker([baseline])
    tracker.reconcile([baseline], 'update', 'baseline')
    expect(tracker.list()[0]?.operation).toBe('update')

    const added = entry('added', 'bundle', '1.0.0')
    const clean = new PluginRestartTracker([])
    clean.reconcile([added], 'install', 'added')
    expect(clean.list()[0]?.operation).toBe('install')
    clean.reconcile([], 'remove', 'added')
    expect(clean.list()).toEqual([])
  })

  it('keeps a removed startup bundle pending when it is installed again at the same version', () => {
    const bundle = entry('bundle', 'bundle', '1.0.0')
    const tracker = new PluginRestartTracker([bundle])
    tracker.reconcile([], 'remove', 'bundle')
    tracker.reconcile([bundle], 'install', 'bundle')
    expect(tracker.list()[0]?.operation).toBe('reinstall')
  })

  it('records both sides of the Bundle startup boundary when package kind changes', () => {
    const runtime = entry('plugin', 'runtime-plugin', '1.0.0')
    const becameBundle = new PluginRestartTracker([runtime])
    becameBundle.reconcile([entry('plugin', 'bundle', '2.0.0')], 'update', 'plugin')
    expect(becameBundle.list()[0]?.operation).toBe('update')

    const bundle = entry('plugin', 'bundle', '1.0.0')
    const becameRuntime = new PluginRestartTracker([bundle])
    becameRuntime.reconcile([entry('plugin', 'runtime-plugin', '2.0.0')], 'update', 'plugin')
    expect(becameRuntime.list()[0]?.operation).toBe('update')
  })

  it('treats a new tracker as a restarted Host with no pending changes', () => {
    const disk = [entry('bundle', 'bundle', '2.0.0')]
    const beforeRestart = new PluginRestartTracker([])
    beforeRestart.reconcile(disk, 'install', 'bundle')
    expect(beforeRestart.list()).toHaveLength(1)
    expect(new PluginRestartTracker(disk).list()).toEqual([])
  })
})
