import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { changedPathCount } from './changed-path-count.ts'
import type { GitClientController } from './controller.ts'
import type { GitDetailsTab } from './contract.ts'
import { ChangesTab } from './details/ChangesTab.tsx'
import { CommitTab } from './details/CommitTab.tsx'
import { DiffTab } from './details/DiffTab.tsx'
import { repoFolderName } from './path-display.ts'
import type { GitLocaleKey } from './locales.ts'
import css from './GitDetailsSurface.module.css'

export type GitDetailsSurfaceProps = PropsRuntime<'shell.details.surface'> & PropsLocale<'git'>
  & { controller: GitClientController }

const TABS: readonly GitDetailsTab[] = ['changes', 'diff', 'commit']

const TAB_LABEL: Record<GitDetailsTab, GitLocaleKey> = {
  changes: 'details.tab.changes',
  diff: 'details.tab.diff',
  commit: 'details.tab.commit',
}

/** Render the Git details surface body hosted by Details Host. */
export function GitDetailsSurface({ controller, t }: GitDetailsSurfaceProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => {
    void controller.refresh()
  }, [controller])

  const repository = state.repository
  const clean = repository !== undefined && repository !== null && changedPathCount(repository) === 0
  const branchLabel = repository !== undefined && repository !== null
    ? (repository.branch ?? repository.head?.slice(0, 8) ?? 'HEAD')
    : undefined

  return (
    <div className={css.root} data-git-details-surface="">
      {repository !== undefined && repository !== null && (
        <div className={css.context}>
          <span className={css.repoName} title={repository.root}>{repoFolderName(repository.root)}</span>
          {branchLabel !== undefined && <span className={css.branchName}>{branchLabel}</span>}
          <div className={css.actions}>
            {state.desktopAvailable && (
              <Button size="sm" variant="ghost" onClick={() => { void controller.reveal() }}>{t('details.reveal')}</Button>
            )}
            <Button size="sm" variant="outline" disabled={state.loading} onClick={() => { void controller.refresh() }}>
              {t('details.refresh')}
            </Button>
          </div>
        </div>
      )}
      <nav className={css.tabs} aria-label={t('details.tabs')}>
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
        {state.loading && repository === undefined && <p className={css.empty}>{t('details.loading')}</p>}
        {!state.loading && state.workspacePath === undefined && <p className={css.empty}>{t('details.noWorkspace')}</p>}
        {!state.loading && repository === null && <p className={css.empty}>{t('details.notRepository')}</p>}
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
    </div>
  )
}
