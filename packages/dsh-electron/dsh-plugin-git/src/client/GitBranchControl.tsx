import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconBranchOutline16, IconCheckOutline16, Input, Menu, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { ComposerToolTrigger } from './ComposerToolTrigger.tsx'
import { changedPathCount } from './changed-path-count.ts'
import type { GitClientController } from './controller.ts'
import type { GitDetailsTab } from './contract.ts'
import { formatLocale } from './locales.ts'
import css from './GitBranchControl.module.css'

export type GitBranchControlProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'git'>
  & {
    controller: GitClientController
    openDetails: (tab?: GitDetailsTab) => void
  }

/** Whether the repository has an unborn HEAD (initialized, no commits yet). */
export function isUnbornHead(repository: { head: string | null }): boolean {
  return repository.head === null
}

/**
 * Map create-branch failures to localized copy for empty repositories and other errors.
 * @param error - Rejection from the controller or Host.
 * @param unborn - Whether the current snapshot has no commits.
 * @param t - Locale binder.
 * @returns User-facing error text.
 */
export function createBranchErrorMessage(
  error: unknown,
  unborn: boolean,
  t: GitBranchControlProps['t'],
): string {
  if (unborn) return t('branch.unbornCreate')
  const message = error instanceof Error ? error.message : String(error)
  if (/not a valid object name/iu.test(message)) return t('branch.unbornCreate')
  return message.trim() === '' ? t('branch.createFailed') : message
}

/** Branch selector and changed-files chip for the composer `conversation.input.left` slot. */
export function GitBranchControl({ controller, openDetails, t, sessionId, useSessions }: GitBranchControlProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const workspacePath = useSessions((list) => {
    if (sessionId === undefined) return undefined
    return list.byId[sessionId]?.cwd
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [createError, setCreateError] = useState<string>()

  useEffect(() => {
    void controller.setWorkspace(workspacePath)
  }, [controller, workspacePath])

  useEffect(() => {
    const onFocus = (): void => { void controller.refresh() }
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('focus', onFocus) }
  }, [controller])

  const repository = state.repository
  const unborn = repository !== undefined && repository !== null && isUnbornHead(repository)
  const branchItems = useMemo((): readonly MenuEntry[] => {
    if (repository === undefined || repository === null) return []
    const rows: MenuEntry[] = [{ type: 'label', id: 'branches', text: t('branch.label') }]
    if (repository.branches.length === 0) {
      if (repository.branch !== null) {
        rows.push({
          id: repository.branch,
          label: repository.branch,
          icon: <IconCheckOutline16 size={16} />,
          disabled: true,
        })
      }
      if (repository.head === null) {
        rows.push({ type: 'label', id: 'unborn-hint', text: t('branch.unbornHint') })
      }
    } else {
      for (const branch of repository.branches) {
        rows.push({
          id: branch.name,
          label: branch.name,
          icon: branch.current ? <IconCheckOutline16 size={16} /> : undefined,
          disabled: branch.current,
        })
      }
    }
    rows.push({ type: 'separator', id: 'create-sep' })
    rows.push({
      id: 'create-branch',
      label: t('branch.create'),
      disabled: repository.head === null,
    })
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

  const closeCreate = (): void => {
    setCreating(false)
    setBranchName('')
    setCreateError(undefined)
  }

  const onBranchSelect = (id: string): void => {
    if (id === 'create-branch') {
      if (unborn) {
        setMenuOpen(false)
        setCreateError(t('branch.unbornCreate'))
        setCreating(true)
        return
      }
      setCreateError(undefined)
      setCreating(true)
      setMenuOpen(false)
      return
    }
    if (repository.branch === id) {
      setMenuOpen(false)
      return
    }
    void controller.switchBranch(id).then(() => { setMenuOpen(false) }).catch(() => {
      // Error text stays in controller state beside the open menu.
    })
  }

  const submitCreate = (): void => {
    const name = branchName.trim()
    if (name === '' || state.loading) return
    void controller.createBranch(name).then(() => {
      closeCreate()
    }).catch((error: unknown) => {
      setCreateError(createBranchErrorMessage(error, unborn, t))
    })
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
          onClick={() => { openDetails('changes') }}
        />
      </Tooltip>
      <Modal
        open={creating}
        onClose={closeCreate}
        title={t('branch.createDialogTitle')}
        closeLabel={t('branch.cancel')}
        footer={(
          <>
            <Button variant="outline" onClick={closeCreate}>{t('branch.cancel')}</Button>
            {unborn ? null : (
              <Button
                variant="primary"
                disabled={branchName.trim() === '' || state.loading}
                onClick={submitCreate}
              >
                {t('branch.createAction')}
              </Button>
            )}
          </>
        )}
      >
        {unborn ? (
          <p className={css.createHint} role="status">{t('branch.unbornCreate')}</p>
        ) : (
          <div className={css.createBody}>
            <label className={css.createField}>
              <span>{t('branch.createTitle')}</span>
              <Input
                value={branchName}
                onChange={(event) => { setBranchName(event.target.value) }}
                aria-label={t('branch.createTitle')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitCreate()
                }}
              />
            </label>
            {createError === undefined ? null : <p className={css.createError} role="alert">{createError}</p>}
          </div>
        )}
      </Modal>
    </span>
  )
}
