/** Package invariant companion for the portable Theme Studio plugin. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh-electron/dsh-theme-studio'

export const name = 'dsh-theme-studio-invariant'
export const inject = ['invariants']

/** No runtime invariant: ThemeRuntime owns overlay layers; settings owns durability. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
