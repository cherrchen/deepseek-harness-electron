/** Portable Git client slots with an optional structural Desktop enhancement. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { GitBranchControl } from './GitBranchControl.tsx'
import { GitDetailsHeaderActions } from './GitDetailsHeaderActions.tsx'
import { GitChangesSurface } from './surfaces/GitChangesSurface.tsx'
import { GitDiffSurface } from './surfaces/GitDiffSurface.tsx'
import { GitPageTitle } from './GitPageTitle.tsx'
import { GitGraphSurface } from './surfaces/GitGraphSurface.tsx'
import { GitClientController, type GitDesktopCapability } from './controller.ts'
import {
  CommitMessageSettingsCardController,
  GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE,
  type CommitMessageCatalogGroup,
  type CommitMessageCatalogLoader,
} from './settings/commit-message-card-controller.ts'
import { CommitMessageSettingsCard } from './settings/CommitMessageSettingsCard.tsx'
import {
  GIT_CHANGES_ID,
  GIT_CHANGES_KIND,
  GIT_DIFF_ID,
  GIT_GRAPH_ID,
  gitDiffAddress,
} from './contract.ts'
import { changesDefinition, diffDefinition, graphDefinition } from './tab-definitions.ts'
import { en, NS, zh, type GitLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    git: GitLocaleKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktop: GitDesktopCapability
  }
}

export { GitBranchControl, GitDetailsHeaderActions, GitChangesSurface, GitDiffSurface, GitGraphSurface, GitClientController }
export {
  GIT_CHANGES_ID,
  GIT_CHANGES_KIND,
  GIT_DIFF_ID,
  GIT_DIFF_KIND,
  GIT_GRAPH_ID,
  GIT_GRAPH_KIND,
  gitDiffAddress,
  parseGitDiffAddress,
  type GitChangesPayload,
  type GitDiffMode,
  type GitDiffPayload,
  type GitGraphPayload,
} from './contract.ts'
export type { GitCommitFollowUp, GitCommitOptions, GitDesktopCapability } from './controller.ts'

export const inject = ['slots', 'connection', 'locale', 'sidebarRight', 'sidebarRightTabs']

/** Register portable UI first, then activate native enhancement in an optional child fiber. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new GitClientController(connection.rpc)

  // Unified navigation: every Git entry point (composer chip, changes rows,
  // guide) converges on the right sidebar. Changes and Graph are singleton
  // pages; a diff opens as a resource whose exact address is its tab identity,
  // so re-opening a file reveals its tab instead of duplicating it.
  const openChanges = (): void => {
    ctx.sidebarRight.openTab(GIT_CHANGES_KIND)
  }
  const openDiff = (path: string, staged: boolean): void => {
    ctx.sidebarRight.openResource(gitDiffAddress(path, staged), { params: { path, staged } })
  }
  controller.setDiffNavigator(openDiff)

  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'git: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(changesDefinition(t)), 'git: changes tab type')
  ctx.effect(() => ctx.sidebarRightTabs.register(diffDefinition()), 'git: diff tab type')
  ctx.effect(() => ctx.sidebarRightTabs.register(graphDefinition(t)), 'git: graph tab type')

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'git-context',
    locale: NS,
    inject: () => ({ controller, openDetails: openChanges }),
  }, GitBranchControl))

  // Stage two: one body per tab type, keyed by the definition id. The sidebar
  // tab bar dispatches every tab of a kind to its registered body.
  const bodies: ReadonlyArray<{ key: string; component: typeof GitChangesSurface }> = [
    { key: GIT_CHANGES_ID, component: GitChangesSurface },
    { key: GIT_DIFF_ID, component: GitDiffSurface },
    { key: GIT_GRAPH_ID, component: GitGraphSurface },
  ]
  for (const body of bodies) {
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: body.key,
      locale: NS,
      inject: () => ({ controller }),
    }, body.component)), `git: ${body.key} body`)
  }

  // Diff chips title themselves after the compared file — path text, language
  // neutral — so only the two page types need a live-title registration.
  const pageTitles: ReadonlyArray<{ key: string; label: GitLocaleKey }> = [
    { key: GIT_CHANGES_ID, label: 'tab.changes' },
    { key: GIT_GRAPH_ID, label: 'tab.graph' },
  ]
  for (const entry of pageTitles) {
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab.title',
      key: entry.key,
      locale: NS,
      inject: () => ({ labelKey: entry.label }),
    }, GitPageTitle)), `git: ${entry.key} title`)
  }

  ctx.inject(['desktop'], (desktopCtx) => {
    controller.setDesktop(desktopCtx.desktop)
    return () => { controller.setDesktop(undefined) }
  })

  ctx.inject(['settingsScope'], (settingsCtx) => {
    const loadCatalog: CommitMessageCatalogLoader = async () => {
      const session = settingsCtx.get('remote.session') as {
        modelCatalog?: () => Promise<
          | { ok: true; value: { groups: readonly CommitMessageCatalogGroup[]; failures: readonly unknown[] } }
          | { ok: false }
        >
      } | undefined
      if (session?.modelCatalog === undefined) return undefined
      const response = await session.modelCatalog()
      if (!response.ok) return undefined
      return { groups: response.value.groups, partial: response.value.failures.length > 0 }
    }
    const card = new CommitMessageSettingsCardController(
      settingsCtx.settingsScope.bind({ namespace: GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE }),
      loadCatalog,
    )
    settingsCtx.effect(() => () => { card.dispose() }, 'git: commit-message settings dispose')
    settingsCtx.effect(() => settingsCtx.slots.inject('settings.plugin.item', () => settingsCtx.slots.register({
      name: 'settings.plugin.item',
      key: GIT_COMMIT_MESSAGE_SETTINGS_NAMESPACE,
      locale: NS,
      inject: () => ({ controller: card }),
    }, CommitMessageSettingsCard)), 'git: commit-message settings card')
  })
}
