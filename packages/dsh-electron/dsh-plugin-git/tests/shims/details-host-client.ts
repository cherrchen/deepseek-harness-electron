import { materializeClientBundle } from '../setup/module-loader.ts'

const detailsHost = materializeClientBundle('@dsh-electron/dsh-client-ui-details-host')

export const DETAILS_HOST_PRIORITY = detailsHost.DETAILS_HOST_PRIORITY as number
export const DETAILS_SURFACE_SLOT = detailsHost.DETAILS_SURFACE_SLOT as string
export const ShellDetailsService = detailsHost.ShellDetailsService as new (...args: never[]) => unknown
export const apply = detailsHost.apply as (ctx: unknown) => void
export const inject = detailsHost.inject as readonly string[]
