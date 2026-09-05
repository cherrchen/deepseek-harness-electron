/**
 * Git Diff surface: one changed path per tab, payload-driven. The open
 * payload decides the compared sides (worktree↔index or index↔HEAD).
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitClientController } from '../controller.ts'
import type { GitDiffPayload } from '../contract.ts'
import { useGitWorkspace, type GitSessionsHook } from '../use-git-workspace.ts'
import { DiffTab } from '../details/DiffTab.tsx'
import css from '../GitDetailsSurface.module.css'

/** Full composed props for the Git Diff surface registration. */
export type GitDiffSurfaceProps = PropsRuntime<'shell.details.surface'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Render one Git Diff surface body. */
export function GitDiffSurface({ controller, t, useSessions, sessionId, detailsInstance }: GitDiffSurfaceProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const sessions = useSessions as GitSessionsHook
  const workspacePath = sessions(list => list.byId[String(sessionId)]?.cwd)
  const payload = detailsInstance.payload as GitDiffPayload

  useGitWorkspace(controller, workspacePath)

  // Payload owns the compared file. The effect waits for the workspace
  // binding to settle (repository discovered) — mounting before the shared
  // controller has a repository must not fire a doomed request; once ready,
  // activation and every repository snapshot refresh refetch the diff.
  useEffect(() => {
    if (state.repository === undefined || state.repository === null) return
    void controller.showDiff(payload.path, payload.staged).catch(() => {})
  }, [controller, payload.path, payload.staged, state.repository])

  return (
    <div className={css.root} data-git-diff-surface="">
      <div className={css.body}>
        {state.workspacePath === undefined && <p className={css.empty}>{t('details.noWorkspace')}</p>}
        {state.repository === null && <p className={css.empty}>{t('details.notRepository')}</p>}
        {state.repository !== undefined && state.repository !== null && (
          <DiffTab
            repository={state.repository}
            selectedDiff={{ path: payload.path, staged: payload.staged }}
            diff={state.diff}
            clean={false}
            t={t}
            error={state.error}
          />
        )}
      </div>
    </div>
  )
}
