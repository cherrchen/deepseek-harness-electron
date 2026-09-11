/** Package invariant companion for the portable Git plugin. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh-electron/dsh-plugin-git'

export const name = 'dsh-plugin-git-invariant'
export const inject = ['invariants']

/** No runtime invariant: Cordis owns service, RPC registration, and child-fiber lifetimes. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
