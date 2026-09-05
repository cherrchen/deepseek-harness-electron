/**
 * Git Graph surface: commit history visualization. Data flows through the
 * controller (paged `git log` with a history scope) and the pure layout
 * engine (active lanes, logical lane identities, visual columns); the rail
 * itself is one canvas layer in a continuous coordinate space, the rows are
 * plain DOM for text and hover. Refs are decorations rendered as badges in
 * the description area — they never own a graph lane.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitLogScope } from '../../types.ts'
import type { GitClientController } from '../controller.ts'
import { GIT_GRAPH_LANE_GAP } from '../graph-geometry.ts'
import { GitGraphCanvas } from '../GitGraphCanvas.tsx'
import { useGitWorkspace, type GitSessionsHook } from '../use-git-workspace.ts'
import css from '../GitGraphSurface.module.css'

/** Full composed props for the Git Graph surface registration. */
export type GitGraphSurfaceProps = PropsRuntime<'shell.details.surface'> & PropsLocale<'git'>
  & { controller: GitClientController }

const GRAPH_SCOPES: readonly GitLogScope[] = ['auto', 'all', 'first-parent']

/** Locale key of one scope's label. */
function scopeLabelKey(scope: GitLogScope): 'graph.scope.auto' | 'graph.scope.all' | 'graph.scope.firstParent' {
  if (scope === 'all') return 'graph.scope.all'
  if (scope === 'first-parent') return 'graph.scope.firstParent'
  return 'graph.scope.auto'
}

/** Render the Git Graph surface body. */
export function GitGraphSurface({ controller, t, useSessions, sessionId }: GitGraphSurfaceProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const sessions = useSessions as GitSessionsHook
  const workspacePath = sessions(list => list.byId[String(sessionId)]?.cwd)
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | undefined>(undefined)

  useGitWorkspace(controller, workspacePath)

  // Load the first page once a repository is bound.
  useEffect(() => {
    if (state.repository && state.graph.length === 0 && !state.graphLoading) {
      void controller.loadGraph(true)
    }
  }, [controller, state.repository, state.graph.length, state.graphLoading])

  const laneArea = Math.max(state.graphLaneCount, 1) * GIT_GRAPH_LANE_GAP

  return (
    <div className={css.root} data-git-graph-surface="">
      <div className={css.scopeBar} role="tablist" aria-label={t('details.tabs')}>
        {GRAPH_SCOPES.map(scope => (
          <button
            key={scope}
            type="button"
            role="tab"
            aria-selected={state.graphScope === scope}
            className={css.scopeButton}
            data-scope={scope}
            data-active={state.graphScope === scope || undefined}
            disabled={state.graphLoading}
            onClick={() => { void controller.setGraphScope(scope) }}
          >
            {t(scopeLabelKey(scope))}
          </button>
        ))}
      </div>
      <div className={css.body}>
        {!state.graphLoading && state.workspacePath === undefined && <p className={css.empty}>{t('details.noWorkspace')}</p>}
        {!state.graphLoading && state.repository === null && <p className={css.empty}>{t('details.notRepository')}</p>}
        {state.graphError !== undefined && <p className={css.error} role="alert">{state.graphError}</p>}
        {state.repository !== undefined && state.repository !== null && state.graphRows.length === 0 && !state.graphLoading && (
          <p className={css.empty}>{t('graph.empty')}</p>
        )}
        <div className={css.rowsWrap}>
          <GitGraphCanvas rows={state.graphRows} laneCount={state.graphLaneCount} hoveredRowIndex={hoveredRowIndex} className={css.canvas} />
          <ol
            className={css.rows}
            style={{ paddingLeft: laneArea + 8 }}
            onMouseLeave={() => { setHoveredRowIndex(undefined) }}
          >
            {state.graphRows.map((row, index) => (
              <li
                key={row.commit.hash}
                className={css.row}
                data-row=""
                onMouseEnter={() => { setHoveredRowIndex(index) }}
              >
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
