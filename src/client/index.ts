/** Portable Git client slots with an optional structural Desktop enhancement. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_SURFACE_SLOT,
} from '@dsh-electron/dsh-client-ui-details-host/client'
import type {} from '@dsh-electron/dsh-client-ui-details-host/client'
import { GitBranchControl } from './GitBranchControl.tsx'
import { GitDetailsHeaderActions } from './GitDetailsHeaderActions.tsx'
import { GitChangesSurface } from './surfaces/GitChangesSurface.tsx'
import { GitDiffSurface } from './surfaces/GitDiffSurface.tsx'
import { GitGraphSurface } from './surfaces/GitGraphSurface.tsx'
import { GitClientController, type GitDesktopCapability } from './controller.ts'
import { createLauncherCards } from './launcher-cards.tsx'
import {
  GIT_CHANGES_SURFACE_ID,
  GIT_DIFF_SURFACE_ID,
  GIT_GRAPH_SURFACE_ID,
  gitDiffTabKey,
} from './contract.ts'
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
  GIT_CHANGES_SURFACE_ID,
  GIT_DIFF_SURFACE_ID,
  GIT_GRAPH_SURFACE_ID,
  gitDiffTabKey,
  type GitChangesPayload,
  type GitDiffMode,
  type GitDiffPayload,
  type GitGraphPayload,
} from './contract.ts'
export type { GitDesktopCapability } from './controller.ts'

export const inject = ['slots', 'connection', 'locale', 'shellDetails']

/** Register portable UI first, then activate native enhancement in an optional child fiber. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new GitClientController(connection.rpc)

  // Unified navigation: every Git entry point (composer chip, changes rows,
  // launcher cards) converges on details.open(...) create-or-reuse tabs.
  const openChanges = (): void => {
    ctx.shellDetails.open({ surfaceId: GIT_CHANGES_SURFACE_ID })
  }
  const openDiff = (path: string, staged: boolean): void => {
    ctx.shellDetails.open({ surfaceId: GIT_DIFF_SURFACE_ID, payload: { path, staged } })
  }
  const openGraph = (): void => {
    ctx.shellDetails.open({ surfaceId: GIT_GRAPH_SURFACE_ID })
  }
  controller.setDiffNavigator(openDiff)

  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'git: dictionaries')
  ctx.effect(() => ctx.shellDetails.registerSurface({
    id: GIT_CHANGES_SURFACE_ID,
    dedupeKey: () => `git:changes:${controller.getSnapshot().workspacePath ?? ''}`,
  }), 'git: changes descriptor')
  ctx.effect(() => ctx.shellDetails.registerSurface({
    id: GIT_DIFF_SURFACE_ID,
    dedupeKey: payload => gitDiffTabKeyOf(payload),
  }), 'git: diff descriptor')
  ctx.effect(() => ctx.shellDetails.registerSurface({
    id: GIT_GRAPH_SURFACE_ID,
    dedupeKey: () => `git:graph:${controller.getSnapshot().workspacePath ?? ''}`,
  }), 'git: graph descriptor')

  for (const card of createLauncherCards()) {
    ctx.effect(() => ctx.shellDetails.registerLauncher(card), `git: launcher ${card.id}`)
  }

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'git-context',
    locale: NS,
    inject: () => ({ controller, openDetails: openChanges }),
  }, GitBranchControl))

  // One surface entry per Details tab; the Details Host tab bar renders them
  // as tabs, so Git ships independent surfaces instead of a nested tab set.
  const surfaces: ReadonlyArray<{ id: typeof GIT_CHANGES_SURFACE_ID | typeof GIT_DIFF_SURFACE_ID | typeof GIT_GRAPH_SURFACE_ID; component: typeof GitChangesSurface }> = [
    { id: GIT_CHANGES_SURFACE_ID, component: GitChangesSurface },
    { id: GIT_DIFF_SURFACE_ID, component: GitDiffSurface },
    { id: GIT_GRAPH_SURFACE_ID, component: GitGraphSurface },
  ]
  for (const surface of surfaces) {
    ctx.slots.inject(DETAILS_SURFACE_SLOT, () => ctx.slots.register({
      name: DETAILS_SURFACE_SLOT,
      id: surface.id,
      label: surface.id === GIT_DIFF_SURFACE_ID ? 'Diff' : surface.id === GIT_GRAPH_SURFACE_ID ? 'Git Graph' : 'Git Changes',
      locale: NS,
      inject: () => ({ controller }),
    }, surface.component))
    ctx.slots.inject(DETAILS_HEADER_ACTIONS_SLOT, () => ctx.slots.register({
      name: DETAILS_HEADER_ACTIONS_SLOT,
      id: surface.id,
      locale: NS,
      inject: () => ({ controller }),
    }, GitDetailsHeaderActions))
  }

  ctx.inject(['desktop'], (desktopCtx) => {
    controller.setDesktop(desktopCtx.desktop)
    return () => { controller.setDesktop(undefined) }
  })
}

function gitDiffTabKeyOf(payload: unknown): string | undefined {
  const request = payload as { path?: unknown; staged?: unknown }
  if (typeof request?.path !== 'string' || request.path.length === 0) return undefined
  return gitDiffTabKey({ path: request.path, staged: request.staged === true })
}
