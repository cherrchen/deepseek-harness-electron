/** Portable Git client slots with an optional structural Desktop enhancement. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  DETAILS_HEADER_ACTIONS_SLOT,
  DETAILS_SURFACE_SLOT,
} from '@dsh-electron/dsh-client-ui-details-host/client'
import type {} from '@dsh-electron/dsh-client-ui-details-host/client'
import { GitBranchControl } from './GitBranchControl.tsx'
import { GitDetailsHeaderActions } from './GitDetailsHeaderActions.tsx'
import { GitDetailsSurface } from './GitDetailsSurface.tsx'
import { GitClientController, type GitDesktopCapability } from './controller.ts'
import { GIT_DETAILS_SURFACE_ID, type GitDetailsTab } from './contract.ts'
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

export { GitBranchControl, GitDetailsHeaderActions, GitDetailsSurface, GitClientController }
export { GIT_DETAILS_SURFACE_ID, type GitDetailsTab, type GitDetailsPayload } from './contract.ts'
export type { GitDesktopCapability } from './controller.ts'

export const inject = ['slots', 'connection', 'locale', 'shellDetails']

/** Register portable UI first, then activate native enhancement in an optional child fiber. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new GitClientController(connection.rpc)
  const openDetails = (tab: GitDetailsTab = 'changes'): void => {
    ctx.shellDetails.open({
      surfaceId: GIT_DETAILS_SURFACE_ID,
      payload: { tab },
    })
  }
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'git: dictionaries')
  ctx.effect(() => ctx.shellDetails.registerSurface({
    id: GIT_DETAILS_SURFACE_ID,
  }), 'git: details descriptor')
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'git-context',
    locale: NS,
    inject: () => ({ controller, openDetails }),
  }, GitBranchControl))
  ctx.slots.inject(DETAILS_SURFACE_SLOT, () => ctx.slots.register({
    name: DETAILS_SURFACE_SLOT,
    id: GIT_DETAILS_SURFACE_ID,
    label: 'Git',
    locale: NS,
    inject: () => ({ controller }),
  }, GitDetailsSurface))
  ctx.slots.inject(DETAILS_HEADER_ACTIONS_SLOT, () => ctx.slots.register({
    name: DETAILS_HEADER_ACTIONS_SLOT,
    id: GIT_DETAILS_SURFACE_ID,
    locale: NS,
    inject: () => ({ controller }),
  }, GitDetailsHeaderActions))
  ctx.inject(['desktop'], (desktopCtx) => {
    controller.setDesktop(desktopCtx.desktop)
    return () => { controller.setDesktop(undefined) }
  })
}
