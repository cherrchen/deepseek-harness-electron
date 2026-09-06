import type { UserConfig } from 'tsdown'
import { clientConfig, nodeConfig } from './tsdown.standalone.config.ts'

export default ({ env }: Pick<UserConfig, 'env'>): UserConfig[] => {
  const face = env?.DSH_BUILD_FACE
  if (face === 'host') return [nodeConfig]
  if (face === 'client') return [clientConfig]
  if (face === undefined) return [nodeConfig, clientConfig]
  throw new Error(`DSH_BUILD_FACE must be host or client, received ${String(face)}`)
}
