/**
 * Client plugin: fill ui-workspace directory-flow holes with Electron Main's chooser.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { ElectronDirectoryFlow, type ElectronFlowInjected } from './flow.ts'

/** Required services for slot registration. */
export const inject = ['slots']

/**
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const injected = (): ElectronFlowInjected => ({
    pick: async () => {
      const bridge = globalThis.window?.deepseekDesktop
      if (bridge === undefined) {
        throw new Error('desktop directory picker: window.deepseekDesktop is missing')
      }
      const result = await bridge.dialog.pickDirectory()
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
