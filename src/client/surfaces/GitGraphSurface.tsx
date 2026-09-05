/**
 * Git Graph surface: commit history visualization. Data flows through the
 * controller (paged `git log`) and the pure graph model (lanes and edges);
 * the rail itself is one canvas layer in a continuous coordinate space, the
 * rows are plain DOM for text and hover.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitClientController } from '../controller.ts'
import { computeGitGraph } from '../graph-model.ts'
import { GIT_GRAPH_COLUMN_WIDTH } from '../graph-geometry.ts'
import { GitGraphCanvas } from '../GitGraphCanvas.tsx'
import { useGitWorkspace, type GitSessionsHook } from '../use-git-workspace.ts'
import css from '../GitGraphSurface.module.css'

/** Full composed props for the Git Graph surface registration. */
export type GitGraphSurfaceProps = PropsRuntime<'shell.details.surface'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Render the Git Graph surface body. */
export function GitGraphSurface({ controller, t, useSessions, sessionId }: GitGraphSurfaceProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const sessions = useSessions as GitSessionsHook
  const workspacePath = sessions(list => list.byId[String(sessionId)]?.cwd)

  useGitWorkspace(controller, workspacePath)

  // Load the first page once a repository is bound.
  useEffect(() => {
    if (state.repository && state.graph.length === 0 && !state.graphLoading) {
      void controller.loadGraph(true)
    }
  }, [controller, state.repository, state.graph.length, state.graphLoading])

  const model = useMemo(() => computeGitGraph(state.graph), [state.graph])
  // The lane area width and the canvas share one coordinate space; rows
  // reserve it via the CSS variable so text always starts after the rail.
  const laneArea = `${Math.max(model.laneCount, 1) * GIT_GRAPH_COLUMN_WIDTH}px`

  return (
    <div className={css.root} data-git-graph-surface="">
      <div className={css.body}>
        {!state.graphLoading && state.workspacePath === undefined && <p className={css.empty}>{t('details.noWorkspace')}</p>}
        {!state.graphLoading && state.repository === null && <p className={css.empty}>{t('details.notRepository')}</p>}
        {state.graphError !== undefined && <p className={css.error} role="alert">{state.graphError}</p>}
        {state.repository !== undefined && state.repository !== null && model.rows.length === 0 && !state.graphLoading && (
          <p className={css.empty}>{t('graph.empty')}</p>
        )}
        <div className={css.rowsWrap}>
          <GitGraphCanvas model={model} className={css.canvas} />
          <ol className={css.rows} style={{ paddingLeft: Math.max(model.laneCount, 1) * GIT_GRAPH_COLUMN_WIDTH + 8 }}>
            {model.rows.map(row => (
              <li key={row.commit.hash} className={css.row} data-row="">
                <div className={css.commitCell}>
                  <div className={css.subjectLine}>
                    <span className={css.subject} title={row.commit.subject}>{row.commit.subject}</span>
                    {row.commit.refs.map(ref => (
                      <span key={ref} className={css.refBadge} data-ref={ref === 'HEAD' ? 'head' : ref.startsWith('tag: ') ? 'tag' : 'branch'}>
                        {ref.startsWith('tag: ') ? ref.slice('tag: '.length) : ref}
                      </span>
                    ))}
                  </div>
                  <span className={css.meta}>
                    {row.commit.shortHash} · {row.commit.author} · {row.commit.date.slice(0, 10)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {state.graphHasMore && state.repository !== null && state.repository !== undefined && (
          <button
            type="button"
            className={css.loadMore}
            disabled={state.graphLoading}
            onClick={() => { void controller.loadMoreGraph() }}
          >
            {t('graph.loadMore')}
          </button>
        )}
        {state.graphLoading && <p className={css.loadingHint}>{t('details.loading')}</p>}
      </div>
    </div>
  )
}
