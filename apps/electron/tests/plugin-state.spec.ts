import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PLUGIN_STATE_VERSION,
  loadPluginState,
  reconcilePluginState,
  savePluginState,
  type PluginState,
} from '../src/plugin-state.ts'

function statePath(root: string): string {
  return join(root, 'plugin-state.json')
}

describe('plugin state', () => {
  it('treats a missing state file as an empty disabled set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-plugin-state-'))
    try {
      expect(loadPluginState(statePath(root))).toEqual({
        state: { version: 1, disabled: [] },
        dirty: false,
        warnings: [],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('round-trips a valid disabled set through disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-plugin-state-'))
    const state: PluginState = { version: PLUGIN_STATE_VERSION, disabled: ['@dsh-electron/dsh-plugin-git'] }
    try {
      await savePluginState(statePath(root), state)
      expect(loadPluginState(statePath(root))).toEqual({
        state,
        dirty: false,
        warnings: [],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('deduplicates repeated names and warns on stale inventory names when reconciled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-plugin-state-'))
    try {
      writeFileSync(statePath(root), JSON.stringify({
        version: 1,
        disabled: ['@dsh-electron/dsh-plugin-git', '@dsh-electron/dsh-plugin-git', '@old/plugin'],
      }), 'utf8')
      const loaded = loadPluginState(statePath(root))
      expect(loaded.state.disabled).toEqual(['@dsh-electron/dsh-plugin-git', '@old/plugin'])
      expect(loaded.dirty).toBe(true)
      const reconciled = reconcilePluginState(loaded.state, ['@dsh-electron/dsh-plugin-git'])
      expect(reconciled.state.disabled).toEqual(['@dsh-electron/dsh-plugin-git'])
      expect(reconciled.removed).toEqual(['@old/plugin'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('falls back from corrupt JSON without overwriting the file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-plugin-state-'))
    try {
      writeFileSync(statePath(root), '{"version":1,"disabled":[', 'utf8')
      const loaded = loadPluginState(statePath(root))
      expect(loaded.state).toEqual({ version: 1, disabled: [] })
      expect(loaded.warnings[0]).toContain('failed to parse')
      expect(readFileSync(statePath(root), 'utf8')).toBe('{"version":1,"disabled":[')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('falls back when the stored version is unsupported', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-electron-plugin-state-'))
    try {
      writeFileSync(statePath(root), JSON.stringify({ version: 99, disabled: ['@dsh-electron/dsh-plugin-git'] }), 'utf8')
      const loaded = loadPluginState(statePath(root))
      expect(loaded.state).toEqual({ version: 1, disabled: [] })
      expect(loaded.warnings[0]).toContain('unsupported version 99')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
