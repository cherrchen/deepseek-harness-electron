/**
 * Details column occupant: header chrome plus the active `shell.details.surface`
 * contribution. Panel width stays with `ctx.layout`.
 */
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_SURFACE_SLOT,
  type DetailsHostInjected,
} from './contract.ts'
import css from './DetailsHost.module.css'

/** Full composed props for the DetailsHost `details` registration. */
export type DetailsHostProps =
  & PropsRuntime<'details'>
  & PropsRenderSlots<'shell.details.surface' | 'shell.details.header.actions'>
  & InjectFace<DetailsHostInjected>

/**
 * Render the hosted details column for the active surface.
 * @param props - slot runtime, child render, and injected controller face.
 * @returns the hosted column, or null while no surface is active.
 */
export function DetailsHost({ renderSlot, useDetailsHost, close, back }: DetailsHostProps) {
  const { activeId, activeInstance, label, canGoBack } = useDetailsHost(state => state)
  if (activeId === null || activeInstance === null) return null
  const owner = { detailsInstance: activeInstance }
  return (
    <div className={css.root} data-details-host="">
      <div className={css.header}>
        <div className={css.headerLeading}>
          {canGoBack && (
            <button type="button" className={css.back} onClick={back} aria-label="Back">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M9.78 3.22a.75.75 0 0 1 0 1.06L6.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0"
                />
              </svg>
            </button>
          )}
          <h2 className={css.title}>{label ?? activeId}</h2>
        </div>
        <div className={css.headerTrailing}>
          <div className={css.actions} data-details-header-actions="">
            {renderSlot(DETAILS_HEADER_ACTIONS_SLOT, owner, { only: activeInstance.surfaceId })}
          </div>
          <button type="button" className={css.close} onClick={close} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3.22 3.22a.75.75 0 0 1 1.06 0L8 6.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L9.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L8 9.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L6.94 8 3.22 4.28a.75.75 0 0 1 0-1.06"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className={css.body}>
        {renderSlot(DETAILS_SURFACE_SLOT, owner, { only: activeInstance.surfaceId })}
      </div>
    </div>
  )
}
