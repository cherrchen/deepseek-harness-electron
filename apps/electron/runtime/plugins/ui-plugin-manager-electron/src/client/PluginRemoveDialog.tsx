import { useEffect, useState, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DesktopCapabilitiesContract,
  PluginLifecycleEntry,
  PluginPackageMutationResult,
} from '@dsh-electron/dsh-electron-desktop-capabilities/client'
import type { PluginManagerTabProps } from './PluginManagerTab.tsx'
import { pluginDisplayName } from './PluginManagerTab.tsx'
import css from './PluginInstallDialog.module.css'

type RemoveState = 'confirm' | 'removing' | 'success' | 'error'

/** Confirmation and outcome dialog for removing one direct profile dependency. */
export function PluginRemoveDialog({ plugin, plugins, app, onClose, onRemoved, onPendingChange, t }: {
  plugin: PluginLifecycleEntry | undefined
  plugins: DesktopCapabilitiesContract['plugins']
  app: DesktopCapabilitiesContract['app']
  onClose: () => void
  onRemoved: () => Promise<void>
  onPendingChange: (pending: boolean) => void
  t: PluginManagerTabProps['t']
}): ReactNode {
  const [status, setStatus] = useState<RemoveState>('confirm')
  const [result, setResult] = useState<PluginPackageMutationResult>()
  const [failure, setFailure] = useState<{ message: string; details?: string }>()
  const pending = status === 'removing'
  useEffect(() => { onPendingChange(pending) }, [onPendingChange, pending])
  useEffect(() => {
    if (plugin === undefined) {
      setStatus('confirm')
      setResult(undefined)
      setFailure(undefined)
    }
  }, [plugin])

  const close = (): void => {
    if (pending) return
    setStatus('confirm')
    setResult(undefined)
    setFailure(undefined)
    onClose()
  }
  const remove = async (): Promise<void> => {
    if (plugin === undefined || pending) return
    setStatus('removing')
    setFailure(undefined)
    setResult(undefined)
    try {
      const removed = await plugins.remove(plugin.name)
      await onRemoved()
      if (removed.restartRequired) {
        setResult(removed)
        setStatus('success')
        return
      }
      setStatus('confirm')
      setResult(undefined)
      setFailure(undefined)
      onClose()
    } catch (error) {
      const value = error as Error & { details?: string; recovery?: string }
      try {
        await onRemoved()
      } catch {
        // Catalog refresh failure must not hide the remove failure.
      }
      setFailure({
        message: value.message,
        ...(value.details === undefined ? {} : { details: value.details }),
      })
      setStatus('error')
    }
  }

  return (
    <Modal
      open={plugin !== undefined}
      onClose={close}
      title={plugin === undefined
        ? t('removePlugin')
        : status === 'success'
          ? t('removalSucceeded')
          : t('removePluginName', { plugin: pluginDisplayName(plugin) })}
      closeLabel={t('close')}
      {...(plugin === undefined || status === 'success' || status === 'error'
        ? {}
        : { description: t('removeDescription', { plugin: plugin.name }) })}
      footer={(
        <>
          <Button variant="outline" disabled={pending} onClick={close}>
            {t(status === 'success' || status === 'error' ? 'done' : 'cancel')}
          </Button>
          {status === 'success' ? (
            <Button variant="primary" onClick={() => {
              void app.relaunch().catch((error) => {
                console.error('plugin manager: relaunch failed', error)
              })
            }}>{t('restartNow')}</Button>
          ) : status === 'error' ? null : (
            <Button variant="primary" disabled={pending || plugin === undefined} onClick={() => { void remove() }}>
              {pending ? t('removing') : t('remove')}
            </Button>
          )}
        </>
      )}
    >
      {plugin === undefined ? null : status === 'success' && result !== undefined ? (
        <div className={css.success} role="status">
          <strong>{t('removalSucceeded')}</strong>
          <span>{t('removedRestart', { plugin: result.name })}</span>
        </div>
      ) : status === 'error' && failure !== undefined ? (
        <div className={css.failure} role="alert">
          <strong>{t('removalFailed')}</strong>
          <span>{failure.message}</span>
          {failure.details === undefined ? null : (
            <details><summary>{t('technicalDetails')}</summary><pre>{failure.details}</pre></details>
          )}
        </div>
      ) : (
        <p>{t(plugin.kind === 'bundle' ? 'removeBundleWarning' : 'removeRuntimeWarning')}</p>
      )}
    </Modal>
  )
}
