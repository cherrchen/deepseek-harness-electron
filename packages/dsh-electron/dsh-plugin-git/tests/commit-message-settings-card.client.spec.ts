import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CommitMessageSettingsCardController,
  commitMessageDisplayedMode,
  commitMessageModelCandidates,
  commitMessageModelKey,
  type CommitMessageCardSettings,
  type CommitMessageCatalogGroup,
} from '../src/client/settings/commit-message-card-controller.ts'

type PathOp = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }

interface Host {
  scope: SettingsScope<CommitMessageCardSettings>
  mutate: ReturnType<typeof vi.fn>
  publish: (next: Partial<SettingsScopeSnapshot<CommitMessageCardSettings>>) => void
}

function applyOps(
  value: CommitMessageCardSettings,
  user: Record<string, unknown>,
  ops: readonly PathOp[],
): { value: CommitMessageCardSettings; user: Record<string, unknown> } {
  const nextValue: Record<string, unknown> = { ...value }
  const nextUser: Record<string, unknown> = { ...user }
  for (const op of ops) {
    const field = op.path[0]
    if (typeof field !== 'string') continue
    if (op.op === 'set') {
      nextValue[field] = op.value
      nextUser[field] = op.value
    } else {
      delete nextValue[field]
      delete nextUser[field]
    }
  }
  return { value: nextValue as CommitMessageCardSettings, user: nextUser }
}

function fakeScope(initial: Partial<SettingsScopeSnapshot<CommitMessageCardSettings>> = {}): Host {
  let snapshot: SettingsScopeSnapshot<CommitMessageCardSettings> = {
    status: 'ready',
    value: {},
    base: {},
    user: {},
    revision: 0,
    writable: true,
    mode: 'host',
    ...initial,
  }
  const listeners = new Set<() => void>()
  const mutate = vi.fn(async (ops: readonly PathOp[]) => {
    const next = applyOps(snapshot.value ?? {}, (snapshot.user ?? {}) as Record<string, unknown>, ops)
    snapshot = {
      ...snapshot,
      value: next.value,
      user: next.user,
      revision: (snapshot.revision ?? 0) + 1,
    }
    for (const listener of listeners) listener()
  })
  return {
    mutate,
    publish: (next) => {
      snapshot = { ...snapshot, ...next }
      for (const listener of listeners) listener()
    },
    scope: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      mutate,
      set: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
    },
  }
}

const GROUPS: readonly CommitMessageCatalogGroup[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [{ id: 'chat', name: 'DeepSeek Chat' }, { id: 'reasoner', name: 'DeepSeek Reasoner' }],
  },
]

describe('commitMessageDisplayedMode', () => {
  it('treats a named route without inherit as custom', () => {
    expect(commitMessageDisplayedMode({ provider: 'a', model: 'b' })).toBe('custom')
    expect(commitMessageDisplayedMode({ mode: 'inherit', provider: 'a', model: 'b' })).toBe('inherit')
    expect(commitMessageDisplayedMode({})).toBe('inherit')
  })
})

describe('commitMessageModelCandidates', () => {
  it('retains a stored route that left the catalog', () => {
    const candidates = commitMessageModelCandidates(GROUPS, { provider: 'gone', model: 'old' })
    expect(candidates.map(candidate => candidate.key)).toContain(commitMessageModelKey({ provider: 'gone', model: 'old' }))
    expect(candidates.find(candidate => candidate.provider === 'gone')?.available).toBe(false)
  })
})

describe('CommitMessageSettingsCardController', () => {
  it('hides the card while the namespace is unavailable', () => {
    const host = fakeScope({ status: 'unavailable', value: undefined })
    const subject = new CommitMessageSettingsCardController(host.scope)
    expect(subject.getSnapshot().available).toBe(false)
    subject.dispose()
  })

  it('stages inherit vs custom without writing until save', () => {
    const host = fakeScope()
    const subject = new CommitMessageSettingsCardController(host.scope)
    subject.setMode('custom')
    expect(subject.getSnapshot()).toMatchObject({ mode: 'custom', dirty: true, invalid: true })
    expect(host.mutate).not.toHaveBeenCalled()
    subject.discard()
    expect(subject.getSnapshot()).toMatchObject({ mode: 'inherit', dirty: false })
    subject.dispose()
  })

  it('writes inherit by clearing a leftover custom route', async () => {
    const host = fakeScope({
      value: { mode: 'inherit', provider: 'leftover', model: 'leftover-model' },
      user: { mode: 'inherit', provider: 'leftover', model: 'leftover-model' },
    })
    const subject = new CommitMessageSettingsCardController(host.scope)
    subject.setSystemPrompt('Write conventional commits.')
    subject.save()
    await vi.waitFor(() => { expect(host.mutate).toHaveBeenCalled() })
    expect(host.mutate.mock.calls[0]![0]).toEqual([
      { op: 'set', path: ['mode'], value: 'inherit' },
      { op: 'unset', path: ['provider'] },
      { op: 'unset', path: ['model'] },
      { op: 'set', path: ['systemPrompt'], value: 'Write conventional commits.' },
    ])
    expect(subject.getSnapshot()).toMatchObject({ dirty: false, failed: false, systemPrompt: 'Write conventional commits.' })
    subject.dispose()
  })

  it('saves a catalog model as a custom route', async () => {
    const host = fakeScope()
    const subject = new CommitMessageSettingsCardController(host.scope, async () => ({ groups: GROUPS, partial: false }))
    subject.setMode('custom')
    await vi.waitFor(() => { expect(subject.getSnapshot().catalogStatus).toBe('ready') })
    subject.setModel(commitMessageModelKey({ provider: 'deepseek', model: 'chat' }))
    subject.save()
    await vi.waitFor(() => { expect(subject.getSnapshot().dirty).toBe(false) })
    expect(host.mutate.mock.calls[0]![0]).toEqual([
      { op: 'set', path: ['mode'], value: 'custom' },
      { op: 'set', path: ['provider'], value: 'deepseek' },
      { op: 'set', path: ['model'], value: 'chat' },
      { op: 'unset', path: ['systemPrompt'] },
    ])
    subject.dispose()
  })

  it('settles a rejected catalog load as an error instead of spinning', async () => {
    const host = fakeScope()
    const subject = new CommitMessageSettingsCardController(host.scope, async () => {
      throw new Error('catalog exploded')
    })
    subject.setMode('custom')
    await vi.waitFor(() => { expect(subject.getSnapshot().catalogStatus).toBe('error') })
    expect(subject.getSnapshot().invalid).toBe(true)
    subject.dispose()
  })

  it('treats a missing catalog loader as an error rather than leaving loading idle', () => {
    const host = fakeScope()
    const subject = new CommitMessageSettingsCardController(host.scope)
    subject.setMode('custom')
    expect(subject.getSnapshot().catalogStatus).toBe('error')
    subject.dispose()
  })

  it('refuses to save custom without both halves of the route', async () => {
    const host = fakeScope()
    const subject = new CommitMessageSettingsCardController(host.scope)
    subject.setMode('custom')
    subject.setProviderText('only-provider')
    subject.save()
    await Promise.resolve()
    expect(host.mutate).not.toHaveBeenCalled()
    expect(subject.getSnapshot().invalid).toBe(true)
    subject.dispose()
  })

  it('clears a blank system prompt back to the built-in default', async () => {
    const host = fakeScope({
      value: { systemPrompt: 'Custom' },
      user: { systemPrompt: 'Custom' },
    })
    const subject = new CommitMessageSettingsCardController(host.scope)
    subject.setSystemPrompt('   ')
    subject.save()
    await vi.waitFor(() => { expect(subject.getSnapshot().dirty).toBe(false) })
    expect(host.mutate.mock.calls[0]![0]).toContainEqual({ op: 'unset', path: ['systemPrompt'] })
    subject.dispose()
  })
})
