import { useEffect, useState, type ReactNode } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DesktopCapabilitiesContract,
  PluginInstallRequest,
  PluginInstallResult,
} from '@dsh-electron/dsh-electron-desktop-capabilities/client'
import type { PluginManagerTabProps } from './PluginManagerTab.tsx'
import css from './PluginInstallDialog.module.css'

type InstallSource = PluginInstallRequest['source']
type InstallState = 'idle' | 'validating' | 'installing' | 'reconciling' | 'activating' | 'success' | 'error'

/** Registry, Git, and local package installation dialog. */
export function PluginInstallDialog({ open, plugins, dialog, onClose, onInstalled, onPendingChange, t }: {
  open: boolean
  plugins: DesktopCapabilitiesContract['plugins']
  dialog: DesktopCapabilitiesContract['dialog']
  onClose: () => void
  onInstalled: () => Promise<void>
  onPendingChange: (pending: boolean) => void
  t: PluginManagerTabProps['t']
}): ReactNode {
  const [source, setSource] = useState<InstallSource>('registry')
  const [packageName, setPackageName] = useState('')
  const [version, setVersion] = useState('')
  const [repository, setRepository] = useState('')
  const [reference, setReference] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [localMode, setLocalMode] = useState<'file' | 'link'>('file')
  const [status, setStatus] = useState<InstallState>('idle')
  const [failure, setFailure] = useState<{ message: string; details?: string }>()
  const [result, setResult] = useState<PluginInstallResult>()
  const pending = status !== 'idle' && status !== 'success' && status !== 'error'
  useEffect(() => { onPendingChange(pending) }, [onPendingChange, pending])

  const close = (): void => {
    if (pending) return
    setStatus('idle')
    setFailure(undefined)
    setResult(undefined)
    onClose()
  }
  const chooseFolder = async (): Promise<void> => {
    const picked = await dialog.pickDirectory({ title: t('choosePluginFolder') })
    if (picked !== null) setLocalPath(picked.path)
  }
  const install = async (): Promise<void> => {
    if (pending) return
    setStatus('validating')
    setFailure(undefined)
    setResult(undefined)
    const request: PluginInstallRequest = source === 'registry'
      ? { source, packageName, ...(version.trim() === '' ? {} : { version }) }
      : source === 'git'
        ? { source, repository, ...(reference.trim() === '' ? {} : { ref: reference }) }
        : { source, path: localPath, mode: localMode }
    try {
      setStatus('installing')
      const installed = await plugins.install(request)
      setStatus(installed.activation === 'activated' ? 'activating' : 'reconciling')
      await onInstalled()
      setResult(installed)
      setStatus('success')
    } catch (error) {
      const value = error as Error & { details?: string }
      setFailure({ message: value.message, ...(value.details === undefined ? {} : { details: value.details }) })
      setStatus('error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('installPlugin')}
      closeLabel={t('close')}
      description={t('installTrustWarning')}
      className={css.dialog!}
      footer={(
        <>
          <Button variant="outline" disabled={pending} onClick={close}>{t(status === 'success' ? 'done' : 'cancel')}</Button>
          {status === 'success' ? null : <Button variant="primary" disabled={pending} onClick={() => { void install() }}>{pending ? t('installing') : t('install')}</Button>}
        </>
      )}
    >
      <div className={css.tabs} role="tablist" aria-label={t('pluginSource')}>
        {(['registry', 'git', 'local'] as const).map(value => (
          <Button key={value} size="sm" variant={source === value ? 'primary' : 'ghost'} disabled={pending} onClick={() => { setSource(value) }}>
            {t(value === 'registry' ? 'registry' : value === 'git' ? 'git' : 'local')}
          </Button>
        ))}
      </div>
      {status === 'success' && result !== undefined ? <InstallSuccess result={result} t={t} /> : (
        <fieldset className={css.form} disabled={pending}>
          {source === 'registry' ? (
            <>
              <Field label={t('package')} value={packageName} onChange={setPackageName} placeholder="@scope/dsh-plugin-example" />
              <Field label={t('versionTag')} value={version} onChange={setVersion} placeholder="latest" />
            </>
          ) : null}
          {source === 'git' ? (
            <>
              <Field label={t('repository')} value={repository} onChange={setRepository} placeholder="https://github.com/owner/repository" />
              <Field label={t('reference')} value={reference} onChange={setReference} placeholder="main / v1.0.0 / commit" />
            </>
          ) : null}
          {source === 'local' ? (
            <>
              <label className={css.field}>
                <span>{t('localRepository')}</span>
                <span className={css.pathRow}>
                  <Input
                    aria-label={t('localRepository')}
                    value={localPath}
                    onChange={(event) => { setLocalPath(event.currentTarget.value) }}
                  />
                  <Button variant="outline" onClick={() => { void chooseFolder() }}>{t('chooseFolder')}</Button>
                </span>
              </label>
              <div className={css.field}>
                <span>{t('installMode')}</span>
                <label className={css.radio}>
                  <input type="radio" checked={localMode === 'file'} onChange={() => { setLocalMode('file') }} />
                  <span><strong>{t('standardInstall')}</strong><small>{t('standardInstallHelp')}</small></span>
                </label>
                <label className={css.radio}>
                  <input type="radio" checked={localMode === 'link'} onChange={() => { setLocalMode('link') }} />
                  <span><strong>{t('developmentLink')}</strong><small>{t('developmentLinkHelp')}</small></span>
                </label>
              </div>
            </>
          ) : null}
        </fieldset>
      )}
      {pending ? <p className={css.progress} role="status">{t(status === 'installing' ? 'installingPlugin' : 'reconcilingPlugin')}</p> : null}
      {failure === undefined ? null : (
        <div className={css.failure} role="alert">
          <strong>{t('installationFailed')}</strong><span>{failure.message}</span>
          {failure.details === undefined ? null : <details><summary>{t('technicalDetails')}</summary><pre>{failure.details}</pre></details>}
        </div>
      )}
    </Modal>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}): ReactNode {
  return (
    <label className={css.field}>
      <span>{label}</span>
      <Input value={value} placeholder={placeholder} onChange={(event) => { onChange(event.currentTarget.value) }} />
    </label>
  )
}

function InstallSuccess({ result, t }: { result: PluginInstallResult; t: PluginManagerTabProps['t'] }): ReactNode {
  const detail = result.activation === 'activated' ? 'installedActivated' : result.activation === 'restart-required' ? 'installedRestart' : 'installedDependencyMessage'
  return <div className={css.success} role="status"><strong>{t('installationSucceeded')}</strong><span>{t(detail, { plugin: result.name, version: result.version })}</span></div>
}
