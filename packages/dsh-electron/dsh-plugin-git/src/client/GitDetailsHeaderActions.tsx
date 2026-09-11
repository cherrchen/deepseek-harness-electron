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
  & { controller: GitClientController; compact?: boolean }

/**
 * Render Host-header controls for the Git details surface: icon-only buttons
 * with the shared Details Host tooltip/aria treatment. Compact (Changes branch
 * row, Graph scope bar, and Diff top-right overlay) is refresh-only.
 * @param props - slot runtime, locale, and shared controller.
 * @returns Reveal (when Desktop is available and not compact) and Refresh.
 */
export function GitDetailsHeaderActions({ controller, t, compact }: GitDetailsHeaderActionsProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return (
    <div className={compact === true ? `${css.root} ${css.compact}` : css.root} data-git-details-header-actions="">
      {compact !== true && state.desktopAvailable && (
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
