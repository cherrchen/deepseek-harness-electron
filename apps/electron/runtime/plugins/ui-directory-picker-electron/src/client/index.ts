/**
 * Client plugin: fill ui-workspace directory-flow holes with Electron Main's chooser.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@dsh-electron/dsh-electron-desktop-capabilities/client'
import type { ShellDetailsService } from '@dsh-electron/dsh-client-ui-details-host/client'
import { ElectronDirectoryFlow, type ElectronFlowInjected } from './flow.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Details-column controller registered by ui-details-host. */
    shellDetails: ShellDetailsService
  }
}

/** Required services for slot registration. */
export const inject = ['slots', 'desktop']

/**
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.inject(['shellDetails'], ctx => ctx.effect(() =>
    ctx.shellDetails.registerFolderOpener((path: string) => ctx.desktop.shell.openPath(path)),
  ))
  const injected = (): ElectronFlowInjected => ({
    pick: async () => {
      const result = await ctx.desktop.dialog.pickDirectory()
      return result?.path ?? null
    },
  })
  ctx.slots.inject('conversation.hero.workspace.directoryFlow', () =>
    ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
      yield ctx.slots.register({
        name: 'conversation.hero.workspace.directoryFlow', inject: injected,
      }, ElectronDirectoryFlow)
      yield ctx.slots.register({
        name: 'sidebar.workspaces.directoryFlow', inject: injected,
      }, ElectronDirectoryFlow)
    }))
}
