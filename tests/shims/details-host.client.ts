import { materializeClientBundle } from '../setup/module-loader.client.ts'

const detailsHost = materializeClientBundle('@dsh-electron/dsh-client-ui-details-host')

export const DETAILS_HOST_PRIORITY = detailsHost.DETAILS_HOST_PRIORITY as number
export const DETAILS_HOST_ENTRY_ID = detailsHost.DETAILS_HOST_ENTRY_ID as string
export const DETAILS_SURFACE_SLOT = detailsHost.DETAILS_SURFACE_SLOT as string
export const DETAILS_HEADER_ACTIONS_SLOT = detailsHost.DETAILS_HEADER_ACTIONS_SLOT as string
export const SHELL_DETAILS_API_VERSION = detailsHost.SHELL_DETAILS_API_VERSION as number
export const SHELL_DETAILS_ENABLED_FEATURES = detailsHost.SHELL_DETAILS_ENABLED_FEATURES as readonly string[]
export const SHELL_DETAILS_P0_FEATURES = detailsHost.SHELL_DETAILS_P0_FEATURES as readonly string[]
export const ShellDetailsService = detailsHost.ShellDetailsService as new (...args: never[]) => unknown
export const DetailsSurfaceNotFoundError = detailsHost.DetailsSurfaceNotFoundError as typeof Error
export const DetailsSurfaceDuplicateError = detailsHost.DetailsSurfaceDuplicateError as typeof Error
export const DetailsTakeoverConflictError = detailsHost.DetailsTakeoverConflictError as typeof Error
export const apply = detailsHost.apply as (ctx: unknown) => void
export const inject = detailsHost.inject as readonly string[]
