/**
 * Repository controls rendered inside each Git frame.
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconFolderOpenOutline16, IconRefreshOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { DetailsHeaderAction } from '@dsh-electron/dsh-client-ui-details-host/client'
import type { GitClientController } from './controller.ts'
import css from './GitDetailsHeaderActions.module.css'

/** Props for the repository controls. */
export type GitDetailsHeaderActionsProps =
  & PropsLocale<'git'>
  & { controller: GitClientController }

/**
 * Render Host-header controls for the Git details surface: icon-only buttons
 * with the shared Details Host tooltip/aria treatment.
 * @param props - slot runtime, locale, and shared controller.
 * @returns Reveal (when Desktop is available) and Refresh.
 */
export function GitDetailsHeaderActions({ controller, t }: GitDetailsHeaderActionsProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return (
    <div className={css.root} data-git-details-header-actions="">
      {state.desktopAvailable && (
        <DetailsHeaderAction
          icon={<IconFolderOpenOutline16 size={14} />}
          label={t('details.reveal')}
          onTrigger={() => { void controller.reveal() }}
        />
      )}
      <DetailsHeaderAction
        icon={<IconRefreshOutline16 size={14} />}
        label={t('details.refresh')}
        onTrigger={() => { void controller.refresh() }}
        disabled={state.loading}
      />
    </div>
  )
}
