/**
 * Details column occupant: tab bar chrome, the Launcher page, and the active
 * `shell.details.surface` contribution. Panel visibility and width stay with
 * `ctx.layout`; the global close button lives in the AppFrame header toggle,
 * not here — tabs close individually.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_SURFACE_SLOT,
  type DetailsHostInjected,
  type DetailsHostState,
  type DetailsLauncherContribution,
  type DetailsSurfaceInstance,
  type ShellDetailsOpenRequest,
} from './contract.ts'
import { SurfaceErrorBoundary } from './SurfaceErrorBoundary.tsx'
import css from './DetailsHost.module.css'

/** Full composed props for the DetailsHost `details` registration. */
export type DetailsHostProps =
  & PropsRuntime<'details'>
  & PropsRenderSlots<'shell.details.surface' | 'shell.details.header.actions'>
  & InjectFace<DetailsHostInjected>

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.22 3.22a.75.75 0 0 1 1.06 0L8 6.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L9.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L8 9.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L6.94 8 3.22 4.28a.75.75 0 0 1 0-1.06"
      />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 2.75a.75.75 0 0 1 .75.75v3.75h3.75a.75.75 0 0 1 0 1.5H8.75v3.75a.75.75 0 0 1-1.5 0V8.75H3.5a.75.75 0 0 1 0-1.5h3.75V3.5A.75.75 0 0 1 8 2.75"
      />
    </svg>
  )
}

function LauncherPage(props: {
  entries: readonly DetailsLauncherContribution[]
  onOpen: (request: ShellDetailsOpenRequest) => void
}) {
  const { entries, onOpen } = props
  return (
    <div className={css.launcher} data-details-launcher="">
      <h3 className={css.launcherTitle}>Open a tab</h3>
      <p className={css.launcherHint}>Choose a panel to open in the details dock.</p>
      {entries.length === 0
        ? <p className={css.launcherEmpty}>No panels are available. Plugins contribute panels here.</p>
        : (
          <div className={css.launcherGrid}>
            {entries.map(entry => (
              <button
                key={entry.id}
                type="button"
                className={css.card}
                onClick={() => { onOpen(entry.open()) }}
              >
                {entry.icon !== undefined && <span className={css.cardIcon}>{entry.icon}</span>}
                <span className={css.cardTitle}>{entry.title}</span>
                {entry.description !== undefined && (
                  <span className={css.cardDescription}>{entry.description}</span>
                )}
              </button>
            ))}
          </div>
        )}
    </div>
  )
}

/**
 * Render the hosted details column: tab bar, launcher, and active surface.
 * @param props - slot runtime, child render, and injected controller face.
 * @returns the hosted column.
 */
export function DetailsHost({
  renderSlot,
  useDetailsHost,
  launcherEntries,
  reportDockVisible,
  activate,
  closeTab,
  showLauncher,
  openRequest,
}: DetailsHostProps) {
  const snapshot: DetailsHostState = useDetailsHost((state: DetailsHostState) => state)
  const { tabs, activeInstance, launcherVisible } = snapshot
  const launcherPage = launcherVisible || tabs.length === 0
  const activeId = activeInstance?.instanceId ?? null

  // The dock keeps this subtree mounted while the layout closes the column
  // (width 0), so the host measures its own box: this is the dock-visibility
  // source for the header toggle and the launcher-on-reveal behavior. The
  // callback rides a ref: the inject face identity changes every render.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const reportRef = useRef(reportDockVisible)
  reportRef.current = reportDockVisible
  useEffect(() => {
    const el = rootRef.current
    if (el === null) return
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      reportRef.current(width > 1)
    })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])

  const onTablistKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (tabs.length < 2) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentIndex = tabs.findIndex((tab: DetailsSurfaceInstance) => tab.instanceId === activeId)
    const step = event.key === 'ArrowLeft' ? -1 : 1
    const nextIndex = ((currentIndex === -1 ? 0 : currentIndex + step) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    if (next !== undefined) activate(next.instanceId)
  }, [activate, activeId, tabs])

  return (
    <div ref={rootRef} className={css.root} data-details-host="">
      {tabs.length > 0 && (
        <div className={css.tabbar} role="tablist" aria-label="Details tabs" onKeyDown={onTablistKeyDown}>
          {tabs.map((tab: DetailsSurfaceInstance) => (
            <TabChip
              key={tab.instanceId}
              tab={tab}
              active={tab.instanceId === activeId && !launcherPage}
              onActivate={activate}
              onClose={closeTab}
            />
          ))}
          <button
            type="button"
            className={css.addTab}
            onClick={showLauncher}
            aria-label="Open a tab"
            title="Open a tab"
          >
            <PlusGlyph />
          </button>
          {!launcherPage && activeInstance !== null && (
            <div className={css.tabbarTrailing} data-details-header-actions="">
              {renderSlot(DETAILS_HEADER_ACTIONS_SLOT, { detailsInstance: activeInstance }, { only: activeInstance.surfaceId })}
            </div>
          )}
        </div>
      )}
      <div className={css.body}>
        {launcherPage
          ? <LauncherPage entries={launcherEntries} onOpen={openRequest} />
          : activeInstance !== null && (
            <div className={css.bodyScroll} role="tabpanel" aria-label={activeInstance.label}>
              <SurfaceErrorBoundary key={activeInstance.instanceId} surfaceId={activeInstance.surfaceId}>
                <SurfaceBody renderSlot={renderSlot} instance={activeInstance} />
              </SurfaceErrorBoundary>
            </div>
          )}
      </div>
    </div>
  )
}

/**
 * Render one surface body. Rendered inside the error boundary so a throwing
 * contribution is caught as a child render error.
 */
function SurfaceBody({ renderSlot, instance }: {
  renderSlot: DetailsHostProps['renderSlot']
  instance: DetailsSurfaceInstance
}) {
  return renderSlot(DETAILS_SURFACE_SLOT, { detailsInstance: instance }, { only: instance.surfaceId })
}

function TabChip(props: {
  tab: DetailsSurfaceInstance
  active: boolean
  onActivate: (instanceId: string) => void
  onClose: (instanceId: string) => void
}) {
  const { tab, active, onActivate, onClose } = props
  return (
    <div className={css.tabWrap} data-active={active || undefined}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={css.tab}
        onClick={() => { onActivate(tab.instanceId) }}
        title={tab.label}
      >
        <span className={css.tabLabel}>{tab.label}</span>
      </button>
      {tab.closable !== false && (
        <button
          type="button"
          className={css.tabClose}
          onClick={() => { onClose(tab.instanceId) }}
          aria-label={`Close ${tab.label}`}
        >
          <CloseGlyph />
        </button>
      )}
    </div>
  )
}
