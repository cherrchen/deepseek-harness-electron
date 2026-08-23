import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { changedPathCount } from './changed-path-count.ts'
import type { GitClientController, GitDrawerTab } from './controller.ts'
import { ChangesTab } from './drawer/ChangesTab.tsx'
import { CommitTab } from './drawer/CommitTab.tsx'
import { DiffTab } from './drawer/DiffTab.tsx'
import { repoFolderName } from './path-display.ts'
import type { GitLocaleKey } from './locales.ts'
import css from './GitDrawer.module.css'

export type GitDrawerProps = PropsRuntime<'shell.overlay'> & PropsLocale<'git'>
  & { controller: GitClientController }

const TABS: readonly GitDrawerTab[] = ['changes', 'diff', 'commit']

const TAB_LABEL: Record<GitDrawerTab, GitLocaleKey> = {
  changes: 'drawer.tab.changes',
  diff: 'drawer.tab.diff',
  commit: 'drawer.tab.commit',
}

/** Render the right-side Git drawer over the application frame. */
export function GitDrawer({ controller, t }: GitDrawerProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => {
    if (!state.drawerOpen) return
    void controller.refresh()
  }, [controller, state.drawerOpen])

  if (!state.drawerOpen) return null

  const repository = state.repository
  const clean = repository !== undefined && repository !== null && changedPathCount(repository) === 0
  const branchLabel = repository !== undefined && repository !== null
    ? (repository.branch ?? repository.head?.slice(0, 8) ?? 'HEAD')
    : undefined

  return (
    <aside className={css.drawer} aria-label={t('drawer.title')}>
      <header className={css.header}>
        <div className={css.headerMain}>
          <h2>{t('drawer.title')}</h2>
          {repository !== undefined && repository !== null && (
            <div className={css.headerMeta}>
              <span className={css.repoName} title={repository.root}>{repoFolderName(repository.root)}</span>
              {branchLabel !== undefined && <span className={css.branchName}>{branchLabel}</span>}
            </div>
          )}
        </div>
        <span className={css.headerActions}>
          {state.desktopAvailable && repository !== undefined && repository !== null && (
            <Button size="sm" variant="ghost" onClick={() => { void controller.reveal() }}>{t('drawer.reveal')}</Button>
          )}
          <Button size="sm" variant="outline" disabled={state.loading} onClick={() => { void controller.refresh() }}>
            {t('drawer.refresh')}
          </Button>
          <button type="button" className={css.closeButton} aria-label={t('drawer.close')} onClick={() => { controller.closeDrawer() }}>
            <IconCloseOutline16 size={16} />
          </button>
        </span>
      </header>
      <nav className={css.tabs} aria-label={t('drawer.title')}>
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            className={state.activeTab === tab ? css.tabActive : css.tab}
            aria-current={state.activeTab === tab ? 'page' : undefined}
            onClick={() => { controller.selectTab(tab) }}
          >
            {t(TAB_LABEL[tab])}
          </button>
        ))}
      </nav>
      <div className={css.body}>
        {state.loading && repository === undefined && <p className={css.empty}>{t('drawer.loading')}</p>}
        {!state.loading && state.workspacePath === undefined && <p className={css.empty}>{t('drawer.noWorkspace')}</p>}
        {!state.loading && repository === null && <p className={css.empty}>{t('drawer.notRepository')}</p>}
        {repository !== undefined && repository !== null && state.activeTab === 'changes' && (
          <ChangesTab repository={repository} controller={controller} t={t} loading={state.loading} error={state.error} />
        )}
        {repository !== undefined && repository !== null && state.activeTab === 'diff' && (
          <DiffTab
            repository={repository}
            selectedDiff={state.selectedDiff}
            diff={state.diff}
            clean={clean}
            t={t}
            error={state.error}
          />
        )}
        {repository !== undefined && repository !== null && state.activeTab === 'commit' && (
          <CommitTab repository={repository} controller={controller} t={t} loading={state.loading} error={state.error} />
        )}
      </div>
    </aside>
  )
}
