/**
 * Details column occupant: tab bar chrome, the Launcher page, and the active
 * `shell.details.surface` contribution. Panel visibility and width stay with
 * `ctx.layout`; the global close button lives in the AppFrame header toggle,
 * not here — tabs close individually.
 */
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_SURFACE_SLOT,
  SHELL_DETAILS_LOCALE_NS,
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
  & PropsLocale<typeof SHELL_DETAILS_LOCALE_NS>
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

type LauncherTranslate = PropsLocale<typeof SHELL_DETAILS_LOCALE_NS>['t']

function LauncherPage(props: {
  entries: readonly DetailsLauncherContribution[]
  onOpen: (request: ShellDetailsOpenRequest) => void
  t: LauncherTranslate
}) {
  const { entries, onOpen, t } = props
  return (
    <div className={css.launcher} data-details-launcher="">
      <h3 className={css.launcherTitle}>{t('launcher.title')}</h3>
      <p className={css.launcherHint}>{t('launcher.hint')}</p>
      {entries.length === 0
        ? <p className={css.launcherEmpty}>{t('launcher.empty')}</p>
        : (
          <div className={css.launcherGrid}>
            {entries.map(entry => (
              <Tooltip key={entry.id} label={entry.description ?? entry.title} side="top">
                <Button
                  variant="outline"
                  type="button"
                  className={css.card}
                  onClick={() => { onOpen(entry.open()) }}
                >
                  {entry.icon !== undefined && <span className={css.cardIcon}>{entry.icon}</span>}
                  <span className={css.cardTitle}>{entry.title}</span>
                  {entry.description !== undefined && (
                    <span className={css.cardDescription}>{entry.description}</span>
                  )}
                </Button>
              </Tooltip>
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
  t,
}: DetailsHostProps) {
  const snapshot: DetailsHostState = useDetailsHost((state: DetailsHostState) => state)
  const { tabs, activeInstance, launcherVisible, openFolder, workspacePath } = snapshot
  const [folderError, setFolderError] = useState<string | null>(null)
  const [openingFolder, setOpeningFolder] = useState(false)
  const openWorkspace = async () => {
    if (!openFolder || !workspacePath || openingFolder) return
    setOpeningFolder(true)
    setFolderError(null)
    try {
      await openFolder(workspacePath)
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : String(error))
    } finally {
      setOpeningFolder(false)
    }
  }
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
        <div className={css.tabbar} role="tablist" aria-label={t('tabs.aria')} onKeyDown={onTablistKeyDown}>
          {tabs.map((tab: DetailsSurfaceInstance) => (
            <TabChip
              key={tab.instanceId}
              tab={tab}
              active={tab.instanceId === activeId && !launcherPage}
              onActivate={activate}
              onClose={closeTab}
              t={t}
            />
          ))}
          <Tooltip label={t('tab.open')} side="bottom">
            <button
              type="button"
              className={css.addTab}
              onClick={showLauncher}
              aria-label={t('tab.open')}
            >
              <PlusGlyph />
            </button>
          </Tooltip>
          <div className={css.hostActions} data-details-host-actions="">
            <Tooltip label={t('actions.openFolder')} side="bottom">
              <button type="button" className={css.headerAction} aria-label={t('actions.openFolder')} aria-disabled={!openFolder || !workspacePath || openingFolder || undefined} onClick={() => { void openWorkspace() }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 9V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1M5 20h13a2 2 0 0 0 2-1.6l2-8.4H6l-3 8a1.5 1.5 0 0 0 2 2Z" />
                </svg>
              </button>
            </Tooltip>
          </div>
          {!launcherPage && activeInstance !== null && (
            <div className={css.tabbarTrailing} data-details-header-actions="">
              {renderSlot(DETAILS_HEADER_ACTIONS_SLOT, { detailsInstance: activeInstance }, { only: activeInstance.surfaceId })}
            </div>
          )}
        </div>
      )}
      <div className={css.body}>
        {folderError !== null && <p role="alert">{folderError}</p>}
        {launcherPage
          ? <LauncherPage entries={launcherEntries} onOpen={openRequest} t={t} />
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
  t: LauncherTranslate
}) {
  const { tab, active, onActivate, onClose, t } = props
  return (
    <div className={css.tabWrap} data-active={active || undefined}>
      <Tooltip label={tab.label} side="bottom">
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className={css.tab}
          onClick={() => { onActivate(tab.instanceId) }}
        >
          <span className={css.tabLabel}>{tab.label}</span>
        </button>
      </Tooltip>
      {tab.closable !== false && (
        <Tooltip label={t('tab.close', { label: tab.label })} side="bottom">
          <button
            type="button"
            className={css.tabClose}
            onClick={() => { onClose(tab.instanceId) }}
            aria-label={t('tab.close', { label: tab.label })}
          >
            <CloseGlyph />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
