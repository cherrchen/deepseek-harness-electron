/** Portable Git client slots with an optional structural Desktop enhancement. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { GitAction } from './GitAction.tsx'
import { GitPanel } from './GitPanel.tsx'
import { GitClientController, type GitDesktopCapability } from './controller.ts'
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

export { GitAction, GitPanel, GitClientController }
export type { GitDesktopCapability } from './controller.ts'

export const inject = ['slots', 'connection', 'locale']

/** Register portable UI first, then activate native enhancement in an optional child fiber. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new GitClientController(connection.rpc)
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'git: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'git',
    locale: NS,
    inject: () => ({ controller }),
  }, GitAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'git',
    locale: NS,
    inject: () => ({ controller }),
  }, GitPanel))
  ctx.inject(['desktop'], (desktopCtx) => {
    controller.setDesktop(desktopCtx.desktop)
    return () => { controller.setDesktop(undefined) }
  })
}
