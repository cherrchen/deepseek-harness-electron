import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DesktopCapabilitiesContract, DesktopNetworkDiagnostics,
  DesktopNetworkState, DesktopNetworkTestItem, DesktopNetworkTestResult,
} from '@dsh-electron/dsh-electron-desktop-capabilities/client'
import { draftErrors, draftFromState, inputFromDraft, type NetworkDraft } from './form.ts'
import type { NetworkLocaleKey } from './locales.ts'
import css from './NetworkSettingsSection.module.css'

const MODES = ['default', 'direct', 'system', 'manual'] as const
const KINDS = ['proxy', 'internet', 'github', 'llm'] as const
const HELP_URL = 'https://github.com/cherrchen/deepseek-harness-electron/blob/develop/docs/electron/network-settings.md'

/** Capabilities and current registered LLM providers injected by the plugin. */
export interface NetworkSettingsInjected {
  network: DesktopCapabilitiesContract['network']
  shell: DesktopCapabilitiesContract['shell']
  providers: () => Promise<Array<{ id: string; name: string }>>
}

/** Settings section props assembled by the shared Settings shell. */
export type NetworkSettingsProps = PropsRuntime<'settings.section'>
  & PropsLocale<'settings.networkElectron'> & InjectFace<NetworkSettingsInjected>

/** Format only sanitized route metadata. */
function routeText(route: { kind: string; host?: string; port?: number } | undefined): string {
  if (route === undefined) return '—'
  if (route.kind === 'direct') return 'DIRECT'
  return `${route.kind.toUpperCase()} ${route.host ?? '?'}:${route.port ?? '?'}`
}

/** Network settings, explicit diagnostics, and restart-only mutations. */
export function NetworkSettingsSection({ network, shell, providers: readProviders, t, close }: NetworkSettingsProps) {
  const [state, setState] = useState<DesktopNetworkState>()
  const [draft, setDraft] = useState<NetworkDraft>()
  const [initial, setInitial] = useState<NetworkDraft>()
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([])
  const [diagnostics, setDiagnostics] = useState<DesktopNetworkDiagnostics>()
  const [testResult, setTestResult] = useState<DesktopNetworkTestResult>()
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [help, setHelp] = useState(false)
  const [storagePrompt, setStoragePrompt] = useState(false)
  const [restorePrompt, setRestorePrompt] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let live = true
    void network.getState().then((value) => {
      if (!live) return
      setState(value)
      const next = draftFromState(value)
      setDraft(current => current ?? next)
      setInitial(current => current ?? next)
      setLoading(false)
    }).catch(() => { if (live) { setError(t('loadError')); setLoading(false) } })
    void readProviders().then((rows) => { if (live) setProviders(rows) }).catch(() => undefined)
    const dispose = network.subscribe((value) => { if (live) setState(value) })
    return () => { live = false; dispose() }
  }, [network])

  useEffect(() => {
    if (!advanced) return
    let live = true
    void network.getDiagnostics().then((value) => { if (live) setDiagnostics(value) })
      .catch(() => { if (live) setError(t('diagnosticsError')) })
    return () => { live = false }
  }, [advanced, network, state?.epoch?.id])

  const errors = useMemo(() => draft === undefined ? {} : draftErrors(draft), [draft])
  const dirty = draft !== undefined && initial !== undefined && JSON.stringify(draft) !== JSON.stringify(initial)
  const valid = Object.keys(errors).length === 0
  const update = (patch: Partial<NetworkDraft>) => {
    setDraft(current => current === undefined ? current : { ...current, ...patch })
    setError(undefined)
  }

  const save = async (discard = false) => {
    if (draft === undefined || !valid) return
    if (!discard && draft.passwordAction === 'replace' && !state?.secureStorage.persistent) {
      setStoragePrompt(true)
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      await network.saveAndRestart(inputFromDraft(draft), discard)
    } catch (cause) {
      const code = cause !== null && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
      if (code === 'SECURE_STORAGE_UNAVAILABLE' || code === 'SECURE_STORAGE_PLAINTEXT_BACKEND') setStoragePrompt(true)
      else setError(t('saveError'))
    } finally { setSaving(false) }
  }

  const test = async () => {
    if (draft === undefined) return
    setTesting(true)
    setTestResult(undefined)
    setError(undefined)
    try {
      setTestResult(await network.test({ tests: [...KINDS], overrides: {
        internet204Url: draft.internet204Url, githubUrl: draft.githubUrl,
        llm: { ...(draft.providerId === '' ? {} : { providerId: draft.providerId }),
          ...(draft.healthUrl === '' ? {} : { healthUrl: draft.healthUrl }) },
      } }))
      if (advanced) void network.getDiagnostics().then(setDiagnostics).catch(() => setError(t('diagnosticsError')))
    } catch { setError(t('testError')) }
    finally { setTesting(false) }
  }

  const reload = async () => {
    setError(undefined)
    try {
      await network.reloadSystemProxy()
      setDiagnostics(await network.getDiagnostics())
      setNotice(t('reloaded'))
    } catch { setError(t('reloadError')) }
  }

  const restore = async () => {
    setRestorePrompt(false)
    setSaving(true)
    try { await network.restoreDefaultAndRestart() }
    catch { setError(t('saveError')); setSaving(false) }
  }

  const retry = async () => {
    try {
      await network.retryLastFailure()
      setNotice(t('retryHint'))
    } catch { setError(t('reloadError')) }
  }

  if (loading) return <div className={css.section} role="status">{t('title')}…</div>
  if (draft === undefined) return <div className={css.section} role="alert">{error ?? t('loadError')}</div>
  const manual = state?.manual ?? state?.lastManual
  const hasPassword = manual !== undefined && manual.protocol !== 'socks5' && manual.hasPassword
  const resultFor = (kind: typeof KINDS[number]): DesktopNetworkTestItem | undefined => testResult?.results.find(item => item.kind === kind)
  return (
    <section className={css.section} aria-label={t('title')}>
      <header><h2>{t('title')}</h2><p>{t('intro')}</p></header>
      {state?.lastIncident !== undefined && state.lastIncident.resolvedAt === undefined && <div className={css.warning} role="status">
        <strong>{t('warning')}</strong><span>{state.lastIncident.failure.code}</span>
        <button type="button" onClick={() => { void retry() }}>{t('retry')}</button>
      </div>}
      {state?.preferencesWarning !== undefined && <div className={css.warning} role="status">{state.preferencesWarning.message}</div>}
      <fieldset className={css.fieldset}>
        <legend>{t('mode')}</legend>
        <div className={css.modeGrid}>{MODES.map(mode => (
          <label key={mode} className={css.modeCard} data-selected={draft.mode === mode}>
            <input type="radio" name="network-mode" value={mode} checked={draft.mode === mode}
              onChange={() => update({ mode })} />
            <span><strong>{t(mode)}</strong><small>{t(`${mode}Hint` as NetworkLocaleKey)}</small></span>
          </label>
        ))}</div>
      </fieldset>

      {draft.mode === 'manual' && <div className={css.card}>
        <fieldset className={css.fieldset}><legend>{t('protocol')}</legend>
          <div className={css.segment}>{(['http', 'https', 'socks5'] as const).map(protocol => (
            <label key={protocol} data-selected={draft.protocol === protocol}>
              <input type="radio" name="network-protocol" checked={draft.protocol === protocol} onChange={() => update({ protocol })} />
              {protocol.toUpperCase()}
            </label>
          ))}</div>
        </fieldset>
        <div className={css.fields}>
          <label>{t('host')}<input value={draft.host} onChange={event => update({ host: event.target.value })}
            aria-invalid={errors.host === true} aria-describedby={errors.host ? 'network-host-error' : undefined} placeholder="127.0.0.1" /></label>
          {errors.host && <span id="network-host-error" className={css.fieldError}>{t('hostError')}</span>}
          <label>{t('port')}<input type="text" inputMode="numeric" value={draft.port} onChange={event => update({ port: event.target.value })}
            aria-invalid={errors.port === true} aria-describedby={errors.port ? 'network-port-error' : undefined} placeholder={draft.protocol === 'socks5' ? '7891' : '7890'} /></label>
          {errors.port && <span id="network-port-error" className={css.fieldError}>{t('portError')}</span>}
          {draft.protocol !== 'socks5' && <>
            <label>{t('username')}<input value={draft.username} onChange={event => update({ username: event.target.value })} autoComplete="off" /></label>
            <label>{t('password')}<input type="password" value={draft.password} autoComplete="new-password"
              placeholder={hasPassword && draft.passwordAction === 'keep' ? '••••••••' : ''}
              onChange={event => update({ password: event.target.value, passwordAction: event.target.value === '' ? 'keep' : 'replace' })} /></label>
            {hasPassword && <div className={css.passwordStatus}><span>{draft.passwordAction === 'remove' ? t('passwordRemoved') : t('storedPassword')}</span>
              <button type="button" onClick={() => update({ password: '', passwordAction: 'remove' })}>{t('removePassword')}</button></div>}
            {!state?.secureStorage.persistent && <p className={css.muted}>{t('storageUnavailable')}</p>}
          </>}
        </div>
        <p className={css.muted}>{t(draft.protocol === 'https' ? 'httpsHint' : draft.protocol === 'socks5' ? 'socksHint' : 'manualHint')}</p>
      </div>}

      {(draft.mode === 'system' || draft.mode === 'manual') && <label className={css.toggle}>
        <input type="checkbox" checked={draft.proxyAgentTraffic} onChange={event => update({ proxyAgentTraffic: event.target.checked })} />
        <span><strong>{t('agent')}</strong><small>{t('agentHint')}</small></span>
      </label>}

      <div className={css.card}>
        <h3>{t('tests')}</h3><p className={css.muted}>{t('testHint')}</p>
        <ul className={css.testList}>{KINDS.map((kind) => {
          const item = resultFor(kind)
          const status = testing ? 'testing' : item?.status ?? (kind === 'llm' && providers.length === 0 ? 'notConfigured' : 'notTested')
          return <li key={kind}><strong>{t(kind)}</strong><span role="status">{t(status === 'not-configured' ? 'notConfigured' : status)}
            {item?.httpStatus === undefined ? '' : ` · HTTP ${item.httpStatus}`}
            {item?.latencyMs === undefined ? '' : ` · ${item.latencyMs} ms`}</span></li>
        })}</ul>
        {advanced && resultFor('proxy') !== undefined && <p className={css.muted}>
          {t('lastRoute')}: {routeText(resultFor('proxy')?.route)} · {t('handshakeStage')}: {resultFor('proxy')?.stage ?? '—'}
          {resultFor('proxy')?.error === undefined ? '' : ` · ${t('errorCode')}: ${resultFor('proxy')?.error?.code}`}
        </p>}
        <button type="button" onClick={() => { void test() }} disabled={testing || !!errors.internet204Url || !!errors.githubUrl || !!errors.healthUrl}>{t('testConnection')}</button>
      </div>

      <details className={css.card} open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}>
        <summary>{t('advanced')}</summary>
        <div className={css.advancedBody}>
          <dl className={css.diagnostics}>
            <dt>{t('activeMode')}</dt><dd>{state?.effectiveMode ?? '—'}</dd>
            <dt>{t('runtime')}</dt><dd>{diagnostics?.runtime.status ?? state?.runtime.status ?? '—'}</dd>
            <dt>{t('epoch')}</dt><dd>{diagnostics?.epoch?.id ?? state?.epoch?.id ?? '—'}</dd>
            <dt>{t('lastRoute')}</dt><dd>{routeText(diagnostics?.system?.selectedRoute ?? state?.lastIncident?.route)}</dd>
            <dt>{t('lastFailure')}</dt><dd>{diagnostics?.lastFailure?.failure.code ?? '—'}</dd>
            <dt>{t('failureTime')}</dt><dd>{diagnostics?.lastFailure?.createdAt ?? '—'}</dd>
            {draft.mode === 'system' && <>
              <dt>{t('backend')}</dt><dd>{diagnostics?.system?.backend ?? state?.runtime.systemBackend ?? '—'}</dd>
              <dt>{t('policySource')}</dt><dd>{diagnostics?.system?.policySource ?? '—'}</dd>
              <dt>{t('pac')}</dt><dd>{diagnostics?.system?.pac.state ?? '—'}</dd>
              <dt>{t('fingerprint')}</dt><dd className={css.fingerprint}>{diagnostics?.system?.policyFingerprint ?? '—'}</dd>
              <dt>{t('alternatives')}</dt><dd>{diagnostics?.system?.alternativeRoutes.map(routeText).join(', ') || '—'}<small>{t('alternativesHint')}</small></dd>
            </>}
          </dl>
          {draft.mode === 'system' && <div><button type="button" onClick={() => { void reload() }} disabled={state?.effectiveMode !== 'system'}>{t('reload')}</button><p className={css.muted}>{t('reloadHint')}</p></div>}
          <fieldset className={css.fieldset}><legend>{t('internetUrl')}</legend>
            <input value={draft.internet204Url} onChange={event => update({ internet204Url: event.target.value })}
              aria-invalid={errors.internet204Url === true} />
            {errors.internet204Url && <span className={css.fieldError}>{t('urlError')}</span>}</fieldset>
          <fieldset className={css.fieldset}><legend>{t('githubUrl')}</legend>
            <input value={draft.githubUrl} onChange={event => update({ githubUrl: event.target.value })}
              aria-invalid={errors.githubUrl === true} />
            {errors.githubUrl && <span className={css.fieldError}>{t('urlError')}</span>}</fieldset>
          <label>{t('provider')}<select value={draft.providerId} onChange={event => update({ providerId: event.target.value })}>
            <option value="">{t('providerNone')}</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select></label>
          <label>{t('healthUrl')}<input value={draft.healthUrl} onChange={event => update({ healthUrl: event.target.value })} aria-invalid={errors.healthUrl === true} /></label>
          {errors.healthUrl && <span className={css.fieldError}>{t('urlError')}</span>}
        </div>
      </details>

      <details className={css.card} open={help} onToggle={event => setHelp(event.currentTarget.open)}><summary>{t('help')}</summary>
        <div className={css.help}><p>{t('helpDefault')}</p><p>{t('helpSystem')}</p><p>{t('helpLimits')}</p><p>{t('helpTests')}</p>
          <button type="button" className={css.link} onClick={() => { void shell.openExternal(HELP_URL) }}>{t('docs')}</button></div>
      </details>

      {storagePrompt && <div className={css.warning} role="alert"><strong>{t('storageTitle')}</strong><p>{t('storageWarning')}</p>
        <div className={css.actions}><button type="button" onClick={() => setStoragePrompt(false)}>{t('cancel')}</button>
          <button type="button" onClick={() => { setStoragePrompt(false); void save(true) }}>{t('discardPassword')}</button></div></div>}
      {restorePrompt && <div className={css.warning} role="alert"><p>{t('restoreConfirm')}</p><div className={css.actions}>
        <button type="button" onClick={() => setRestorePrompt(false)}>{t('cancel')}</button>
        <button type="button" onClick={() => { void restore() }}>{t('restore')}</button></div></div>}
      {notice && <p role="status" className={css.muted}>{notice}</p>}
      {error && <p role="alert" className={css.fieldError}>{error}</p>}
      <footer className={css.footer}><button type="button" onClick={() => setRestorePrompt(true)} disabled={saving}>{t('restore')}</button>
        <div className={css.actions}><button type="button" onClick={close}>{t('cancel')}</button>
          <button type="button" className={css.primary} disabled={!dirty || !valid || saving} onClick={() => { void save() }}>{saving ? t('saving') : t('save')}</button></div>
      </footer>
    </section>
  )
}
