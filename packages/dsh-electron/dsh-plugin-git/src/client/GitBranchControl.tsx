import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconBranchOutline16, IconCheckOutline16, Input, Menu, StateDot, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { changedPathCount } from './changed-path-count.ts'
import type { GitClientController } from './controller.ts'
import { formatLocale } from './locales.ts'
import css from './GitBranchControl.module.css'

export type GitBranchControlProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Render branch selector and changed-files indicator in the composer tool row. */
export function GitBranchControl({ controller, t, useWorkspaces }: GitBranchControlProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const workspaces = useWorkspaces(value => value)
  const current = workspaces.items.find(item => item.workspaceId === workspaces.recentWorkspaceId)
  const workspacePath = current?.path
  const [menuOpen, setMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [branchName, setBranchName] = useState('')

  useEffect(() => {
    void controller.setWorkspace(workspacePath)
  }, [controller, workspacePath])

  useEffect(() => {
    const onFocus = (): void => { void controller.refresh() }
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('focus', onFocus) }
  }, [controller])

  useEffect(() => {
    if (menuOpen) void controller.refresh()
  }, [controller, menuOpen])

  const repository = state.repository
  const branchItems = useMemo((): readonly MenuEntry[] => {
    if (repository === undefined || repository === null) return []
    const rows: MenuEntry[] = [{ type: 'label', id: 'branches', text: t('branch.label') }]
    for (const branch of repository.branches) {
      rows.push({
        id: branch.name,
        label: branch.name,
        icon: branch.current ? <IconCheckOutline16 size={16} /> : undefined,
        disabled: branch.current,
      })
    }
    rows.push({ type: 'separator', id: 'create-sep' })
    rows.push({ id: 'create-branch', label: t('branch.create') })
    return rows
  }, [repository, t])

  if (repository === undefined || repository === null) return null

  const branchLabel = repository.branch ?? (
    repository.head === null
      ? t('branch.loading')
      : formatLocale(t('branch.detached'), { hash: repository.head.slice(0, 8) })
  )
  const count = changedPathCount(repository)

  const onBranchSelect = (id: string): void => {
    if (id === 'create-branch') {
      setCreating(true)
      setMenuOpen(false)
      return
    }
    if (repository.branch === id) {
      setMenuOpen(false)
      return
    }
    void controller.switchBranch(id).then(() => { setMenuOpen(false) })
  }

  return (
    <span className={css.root}>
      <Menu
        open={menuOpen}
        onClose={() => { setMenuOpen(false) }}
        onSelect={onBranchSelect}
        selectedId={repository.branch ?? undefined}
        items={branchItems}
        compact
        portal
        anchor={(
          <button
            type="button"
            className={css.branchButton}
            disabled={state.loading}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => { setMenuOpen(open => !open) }}
          >
            <IconBranchOutline16 size={14} />
            <span className={css.branchText}>{branchLabel}</span>
          </button>
        )}
      />
      {state.error !== undefined && menuOpen && (
        <span className={css.menuError} role="alert">{state.error}</span>
      )}
      <Tooltip label={formatLocale(t('changes.indicator'), { count })}>
        <button
          type="button"
          className={css.changesButton}
          aria-label={formatLocale(t('changes.indicator'), { count })}
          onClick={() => { void controller.openDrawer('changes') }}
        >
          {count > 0 && <StateDot state="warning" size={8} />}
          <span>{formatLocale(t('changes.indicatorCompact'), { count })}</span>
        </button>
      </Tooltip>
      {creating && (
        <span className={css.createForm} role="dialog" aria-label={t('branch.createTitle')}>
          <span className={css.createTitle}>{t('branch.createTitle')}</span>
          <Input
            value={branchName}
            onChange={(event) => { setBranchName(event.target.value) }}
            aria-label={t('branch.createTitle')}
          />
          <span className={css.createActions}>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setBranchName('') }}>
              {t('branch.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={branchName.trim() === '' || state.loading}
              onClick={() => {
                void controller.createBranch(branchName.trim()).then(() => {
                  setCreating(false)
                  setBranchName('')
                })
              }}
            >
              {t('branch.createAction')}
            </Button>
          </span>
        </span>
      )}
    </span>
  )
}
