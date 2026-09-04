/**
 * Git Changes surface: repository context row, the staged/unstaged/untracked
 * sections, and the fixed commit region. One of three Git surfaces hosted by
 * the Details Host tab bar.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitClientController } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { repoFolderName } from '../path-display.ts'
import { useGitWorkspace, type GitSessionsHook } from '../use-git-workspace.ts'
import { ChangesTab } from '../details/ChangesTab.tsx'
import { CommitRegion } from '../details/CommitRegion.tsx'
import css from '../GitDetailsSurface.module.css'

/** Full composed props for the Git Changes surface registration. */
export type GitChangesSurfaceProps = PropsRuntime<'shell.details.surface'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Render the Git Changes surface body. */
export function GitChangesSurface({ controller, t, useSessions, sessionId, detailsInstance }: GitChangesSurfaceProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const sessions = useSessions as unknown as GitSessionsHook
  const workspacePath = sessions((list) => list.byId[String(sessionId)]?.cwd)

  useEffect(() => {
    void controller.refresh()
  }, [controller])

  useGitWorkspace(controller, workspacePath)

  const repository = state.repository
  const branchLabel = repository !== undefined && repository !== null
    ? (repository.branch ?? repository.head?.slice(0, 8) ?? 'HEAD')
    : undefined

  return (
    <div className={css.root} data-git-changes-surface="">
      {repository !== undefined && repository !== null && (
        <div className={css.context}>
          <span className={css.repoName} title={repository.root}>{repoFolderName(repository.root)}</span>
          {branchLabel !== undefined && <span className={css.branchName}>{branchLabel}</span>}
        </div>
      )}
      <div className={css.body}>
        {state.loading && repository === undefined && <p className={css.empty}>{t('details.loading')}</p>}
        {!state.loading && workspacePath === undefined && <p className={css.empty}>{t('details.noWorkspace')}</p>}
        {!state.loading && repository === null && <p className={css.empty}>{t('details.notRepository')}</p>}
        {repository !== undefined && repository !== null && (
          <>
            <ChangesTab repository={repository} controller={controller} t={t as (key: GitLocaleKey) => string} loading={state.loading} error={state.error} />
            <CommitRegion
              repository={repository}
              controller={controller}
              t={t as (key: GitLocaleKey) => string}
              error={state.error}
              commitMessage={state.commitMessage}
              generating={state.generating}
              generationAvailable={state.generationAvailable}
              generationError={state.generationError}
            />
          </>
        )}
      </div>
    </div>
  )
}
