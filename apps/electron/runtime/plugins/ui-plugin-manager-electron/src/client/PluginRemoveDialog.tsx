import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { PluginLifecycleEntry } from '@dsh-electron/dsh-electron-desktop-capabilities/client'
import type { PluginManagerTabProps } from './PluginManagerTab.tsx'
import { pluginDisplayName } from './PluginManagerTab.tsx'

/** Confirmation dialog for removing one direct profile dependency. */
export function PluginRemoveDialog({ plugin, pending, onClose, onRemove, t }: {
  plugin: PluginLifecycleEntry | undefined
  pending: boolean
  onClose: () => void
  onRemove: (name: string) => void
  t: PluginManagerTabProps['t']
}): ReactNode {
  return (
    <Modal
      open={plugin !== undefined}
      onClose={onClose}
      title={plugin === undefined ? t('removePlugin') : t('removePluginName', { plugin: pluginDisplayName(plugin) })}
      closeLabel={t('close')}
      {...(plugin === undefined ? {} : { description: t('removeDescription', { plugin: plugin.name }) })}
      footer={(
        <>
          <Button variant="outline" disabled={pending} onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={pending || plugin === undefined} onClick={() => {
            if (plugin !== undefined) onRemove(plugin.name)
          }}>{pending ? t('removing') : t('remove')}</Button>
        </>
      )}
    >
      {plugin === undefined ? null : <p>{t(plugin.kind === 'bundle' ? 'removeBundleWarning' : 'removeRuntimeWarning')}</p>}
    </Modal>
  )
}
