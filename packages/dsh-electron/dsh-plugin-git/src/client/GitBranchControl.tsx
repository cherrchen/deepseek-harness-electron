import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconBranchOutline16, IconCheckOutline16, Input, Menu, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { ComposerToolTrigger } from './ComposerToolTrigger.tsx'
import { changedPathCount } from './changed-path-count.ts'
import type { GitClientController } from './controller.ts'
import { formatLocale } from './locales.ts'
import css from './GitBranchControl.module.css'

export type GitBranchControlProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Branch selector and changed-files chip for the composer `conversation.input.left` slot. */
export function GitBranchControl({ controller, t, sessionId, useSessions }: GitBranchControlProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const workspacePath = useSessions((list) => {
    if (sessionId === undefined) return undefined
    return list.byId[sessionId]?.cwd
  })
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

  if (workspacePath === undefined || workspacePath === '') return null
  if (repository === undefined || repository === null) return null

  const branchLabel = repository.branch ?? (
    repository.head === null
      ? t('branch.loading')
      : formatLocale(t('branch.detached'), { hash: repository.head.slice(0, 8) })
  )
  const count = changedPathCount(repository)
  const changesLabel = formatLocale(t('changes.indicator'), { count })

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
        items={branchItems}
        selectedId={repository.branch ?? undefined}
        onSelect={onBranchSelect}
        onClose={() => { setMenuOpen(false) }}
        side="top"
        anchor={(
          <ComposerToolTrigger
            icon={<IconBranchOutline16 size={16} />}
            label={branchLabel}
            chevron
            open={menuOpen}
            aria-label={branchLabel}
            onClick={() => { setMenuOpen(open => !open) }}
          />
        )}
      />
      {state.error !== undefined && menuOpen && (
        <span className={css.menuError} role="alert">{state.error}</span>
      )}
      <Tooltip label={changesLabel} side="top" delayMs={200}>
        <ComposerToolTrigger
          metric
          label={formatLocale(t('changes.indicatorCompact'), { count })}
          labelClassName={count > 0 ? css.changesLabelWarn : css.changesLabelCaption}
          aria-label={changesLabel}
          onClick={() => { void controller.openDrawer('changes') }}
        />
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
