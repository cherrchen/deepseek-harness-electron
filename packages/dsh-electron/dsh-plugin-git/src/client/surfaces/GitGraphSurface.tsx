/**
 * Git Graph surface: commit history visualization. Data flows through the
 * controller (paged `git log`) and the pure graph model (lanes and edges);
 * this view only renders rows and refs badges.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitClientController } from '../controller.ts'
import { computeGitGraph } from '../graph-model.ts'
import { useGitWorkspace, type GitSessionsHook } from '../use-git-workspace.ts'
import css from '../GitGraphSurface.module.css'

/** Full composed props for the Git Graph surface registration. */
export type GitGraphSurfaceProps = PropsRuntime<'shell.details.surface'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Lane colors, cycled by lane index (token-backed where available). */
const LANE_COLORS = [
  'var(--dsw-alias-fg-brand, #4c6fff)',
  '#c586c0',
  '#ce9178',
  '#4ec9b0',
  '#dcdcaa',
  '#9cdcfe',
]

/** Render one lane glyph column as inline SVG. */
function LaneGlyph({ lane, laneCount, edges, through }: {
  lane: number
  laneCount: number
  edges: ReadonlyArray<{ from: number; to: number }>
  through: readonly number[]
}): ReactNode {
  const columnWidth = 14
  const height = 28
  const x = (column: number): number => column * columnWidth + columnWidth / 2
  return (
    <svg
      className={css.lane}
      width={Math.max(laneCount, 1) * columnWidth}
      height={height}
      viewBox={`0 0 ${Math.max(laneCount, 1) * columnWidth} ${height}`}
      aria-hidden="true"
    >
      {through.map((column) => (
        <line
          key={`through-${column}`}
          x1={x(column)}
          x2={x(column)}
          y1={0}
          y2={height}
          stroke={LANE_COLORS[column % LANE_COLORS.length]}
          strokeWidth={1.5}
        />
      ))}
      {edges.map((edge, index) => (
        <line
          key={`edge-${index}`}
          x1={x(edge.from)}
          x2={x(edge.to)}
          y1={height / 2}
          y2={height}
          stroke={LANE_COLORS[edge.to % LANE_COLORS.length]}
          strokeWidth={1.5}
        />
      ))}
      <circle cx={x(lane)} cy={height / 2} r={4} fill={LANE_COLORS[lane % LANE_COLORS.length]} />
    </svg>
  )
}

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

  return (
    <div className={css.root} data-git-graph-surface="">
      <div className={css.body}>
        {!state.graphLoading && state.workspacePath === undefined && <p className={css.empty}>{t('details.noWorkspace')}</p>}
        {!state.graphLoading && state.repository === null && <p className={css.empty}>{t('details.notRepository')}</p>}
        {state.graphError !== undefined && <p className={css.error} role="alert">{state.graphError}</p>}
        {state.repository !== undefined && state.repository !== null && model.rows.length === 0 && !state.graphLoading && (
          <p className={css.empty}>{t('graph.empty')}</p>
        )}
        <ol className={css.rows}>
          {model.rows.map(row => (
            <li key={row.commit.hash} className={css.row} data-row="">
              <LaneGlyph lane={row.lane} laneCount={row.laneCount} edges={row.edges} through={row.through} />
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
