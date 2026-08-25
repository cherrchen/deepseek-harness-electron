/**
 * Git panel-level Host header actions (Reveal / Refresh).
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitClientController } from './controller.ts'
import css from './GitDetailsHeaderActions.module.css'

/** Props for the Git contribution to `shell.details.header.actions`. */
export type GitDetailsHeaderActionsProps =
  & PropsRuntime<'shell.details.header.actions'>
  & PropsLocale<'git'>
  & { controller: GitClientController }

/**
 * Render Host-header controls for the Git details surface.
 * @param props - slot runtime, locale, and shared controller.
 * @returns Reveal (when Desktop is available) and Refresh.
 */
export function GitDetailsHeaderActions({ controller, t }: GitDetailsHeaderActionsProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return (
    <div className={css.root} data-git-details-header-actions="">
      {state.desktopAvailable && (
        <Button size="sm" variant="ghost" onClick={() => { void controller.reveal() }}>{t('details.reveal')}</Button>
      )}
      <Button size="sm" variant="outline" disabled={state.loading} onClick={() => { void controller.refresh() }}>
        {t('details.refresh')}
      </Button>
    </div>
  )
}
