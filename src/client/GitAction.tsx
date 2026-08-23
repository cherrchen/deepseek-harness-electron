import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { GitClientController } from './controller.ts'
import css from './GitPanel.module.css'

export type GitActionProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps
  & PropsLocale<'git'> & { controller: GitClientController }

/** Render the source-control entry in the existing Sidebar footer action slot. */
export function GitAction({ controller, useWorkspaces, wide, t }: GitActionProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const workspaces = useWorkspaces(value => value)
  const current = workspaces.items.find(item => item.workspaceId === workspaces.recentWorkspaceId)
  return (
    <button
      type="button"
      className={css.sidebarAction}
      aria-label={t('action.open')}
      aria-pressed={state.open}
      onClick={() => { void controller.open(current?.path) }}
    >
      <IconBranchOutline16 size={16} />
      {wide && <span>{t('action.open')}</span>}
    </button>
  )
}
