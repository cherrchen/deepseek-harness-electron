/**
 * Git Diff surface: one changed path per tab. The tab's navigation carries
 * the compared sides (worktree↔index or index↔HEAD): `params` when the
 * opener supplied them, otherwise decoded from the resource address (which
 * session restore replays without params).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { GitDiff } from '../../types.ts'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitClientController } from '../controller.ts'
import { parseGitDiffAddress, type GitDiffPayload } from '../contract.ts'
import { GitDetailsHeaderActions } from '../GitDetailsHeaderActions.tsx'
import { useGitWorkspace, type GitSessionsHook } from '../use-git-workspace.ts'
import { DiffTab } from '../details/DiffTab.tsx'
import css from '../GitDetailsSurface.module.css'

/** Identity of one panel's diff result: repository root plus tab address. */
const keyOf = (root: string, address: string): string => `${root}\u0000${address}`

/** Full composed props for the Git Diff tab body. */
export type GitDiffSurfaceProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Render one Git Diff surface body. */
export function GitDiffSurface({ controller, t, useSessions, sessionId, useTabInfo }: GitDiffSurfaceProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const sessions = useSessions as GitSessionsHook
  const workspacePath = sessions(list => list.byId[String(sessionId)]?.cwd)
  const { tab } = useTabInfo()
  const { address, revision } = tab.navigation
  const opened = tab.navigation.params as GitDiffPayload | undefined
  const payload = typeof opened?.path === 'string' && opened.path.length > 0
    ? { path: opened.path, staged: opened.staged === true }
    : parseGitDiffAddress(address)

  useGitWorkspace(controller, workspacePath)

  // Each panel owns its diff result: split panes, float windows, and the
  // staged/worktree pair of one file never overwrite one another's body.
  // `revision` re-fires the fetch when a repeated open reveals this tab and
  // navigates in place. The effect waits for the workspace binding to settle
  // (repository discovered) — mounting before the shared controller has a
  // repository must not fire a doomed request; once ready, activation and
  // every repository snapshot refresh refetch the diff. A completion is
  // discarded when its key (repository root + address) no longer matches this
  // panel, so a stale response can never render.
  const [result, setResult] = useState<{ readonly key: string; readonly diff: GitDiff | undefined; readonly error: string | undefined } | undefined>(undefined)

  useEffect(() => {
    if (payload === undefined) return
    if (state.repository === undefined || state.repository === null) return
    if (state.repository.untracked.includes(payload.path)) return // DiffTab renders the untracked notice from `repository` alone
    const root = state.repository.root
    let active = true
    setResult({ key: keyOf(root, address), diff: undefined, error: undefined })
    void controller.fetchDiff(payload.path, payload.staged).then(
      (diff) => { if (active) setResult({ key: keyOf(root, address), diff, error: undefined }) },
      (error) => { if (active) setResult({ key: keyOf(root, address), diff: undefined, error: error instanceof Error ? error.message : String(error) }) },
    )
    return () => { active = false }
  }, [controller, address, revision, state.repository])

  return (
    <div className={`${css.root} ${css.diffRoot}`} data-git-diff-surface="">
      <div className={css.diffToolbar} data-git-diff-toolbar="">
        <GitDetailsHeaderActions controller={controller} t={t} compact />
      </div>
      <div className={css.body}>
        {payload === undefined && <p className={css.empty}>{t('details.missingDiff')}</p>}
        {state.workspacePath === undefined && <p className={css.empty}>{t('details.noWorkspace')}</p>}
        {state.repository === null && <p className={css.empty}>{t('details.notRepository')}</p>}
        {payload !== undefined && state.repository !== undefined && state.repository !== null && (
          state.repository.untracked.includes(payload.path) || result?.key === keyOf(state.repository.root, address)
        ) && (
          <DiffTab
            repository={state.repository}
            payload={{ path: payload.path, staged: payload.staged }}
            diff={result?.diff}
            clean={false}
            t={t}
            error={result?.error ?? state.error}
          />
        )}
      </div>
    </div>
  )
}
