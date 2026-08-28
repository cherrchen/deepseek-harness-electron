import { describe, expect, it } from 'vitest'
import { pluginCommandArguments } from '../src/plugin-install.ts'
import { parsePluginUpdates, PluginPackageError } from '../src/plugin-package-contract.ts'

describe('plugin update parser', () => {
  it('separates wanted range updates from the latest major release', () => {
    expect(parsePluginUpdates(JSON.stringify({
      '@fixture/plugin': { current: '1.2.1', wanted: '1.4.3', latest: '2.0.0' },
    }))).toEqual([{
      name: '@fixture/plugin',
      currentVersion: '1.2.1',
      wantedVersion: '1.4.3',
      latestVersion: '2.0.0',
      updateAvailable: true,
    }])
  })

  it('accepts an empty up-to-date result and rejects non-JSON diagnostics', () => {
    expect(parsePluginUpdates('{}')).toEqual([])
    expect(() => parsePluginUpdates('registry authentication failed')).toThrow(PluginPackageError)
  })
})

describe('plugin command adapter', () => {
  it('preserves every package operation as plain launcher arguments', () => {
    expect(pluginCommandArguments({ kind: 'add', spec: 'github:fixture/plugin#main', force: true }))
      .toEqual(['add', 'github:fixture/plugin#main', '--force'])
    expect(pluginCommandArguments({ kind: 'remove', name: '@fixture/plugin' }))
      .toEqual(['remove', '@fixture/plugin'])
    expect(pluginCommandArguments({ kind: 'update', name: '@fixture/plugin' }))
      .toEqual(['update', '@fixture/plugin'])
    expect(pluginCommandArguments({ kind: 'outdated' })).toEqual(['outdated', '--format', 'json'])
  })
})
