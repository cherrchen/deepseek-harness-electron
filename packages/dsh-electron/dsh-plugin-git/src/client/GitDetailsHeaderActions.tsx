/**
 * Repository controls rendered inside each Git frame.
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconFolderOpenOutline16, IconRefreshOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitClientController } from './controller.ts'
import { GitIconButton } from './details/GitIconButton.tsx'
import css from './GitDetailsHeaderActions.module.css'

/** Props for the repository controls. */
export type GitDetailsHeaderActionsProps =
  & PropsLocale<'git'>
  & { controller: GitClientController; compact?: boolean }

/**
 * Render header controls for the Git sidebar tab: icon-only buttons with the
 * shared tooltip/aria treatment. Compact (Changes branch row, Graph scope bar,
 * and Diff top-right overlay) is refresh-only.
 * @param props - locale and shared controller.
 * @returns Reveal (when Desktop is available and not compact) and Refresh.
 */
export function GitDetailsHeaderActions({ controller, t, compact }: GitDetailsHeaderActionsProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return (
    <div className={compact === true ? `${css.root} ${css.compact}` : css.root} data-git-details-header-actions="">
      {compact !== true && state.desktopAvailable && (
        <GitIconButton label={t('details.reveal')} onClick={() => { void controller.reveal() }}>
          <IconFolderOpenOutline16 size={14} />
        </GitIconButton>
      )}
      <GitIconButton label={t('details.refresh')} disabled={state.loading} onClick={() => { void controller.refresh() }}>
        <IconRefreshOutline16 size={14} />
      </GitIconButton>
    </div>
  )
}
