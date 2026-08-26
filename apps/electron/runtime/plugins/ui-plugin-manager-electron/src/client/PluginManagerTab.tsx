import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  DisclosureRow,
  IconCordisPluginOutline14,
  IconEllipsisOutline16,
  IconSearchOutline16,
  Input,
  Menu,
  StateDot,
  type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DesktopCapabilitiesContract,
  PluginLifecycleEntry,
  PluginRuntimeState,
} from '@dsh-electron/dsh-electron-desktop-capabilities/client'
import {
  PluginManagerController,
  type ActivePluginOperation,
  type PluginManagerState,
  type PluginOperationKind,
} from './plugin-manager-controller.ts'
import type { PluginManagerLocaleKey } from './locales.ts'
import css from './PluginManagerTab.module.css'
import { PluginInstallDialog } from './PluginInstallDialog.tsx'
import { PluginRemoveDialog } from './PluginRemoveDialog.tsx'

/** Lifecycle capability injected from `ctx.desktop`. */
export interface PluginManagerTabInjected {
  plugins: DesktopCapabilitiesContract['plugins']
  dialog: DesktopCapabilitiesContract['dialog']
}

/** Full props assembled by the upstream Plugins tab renderer. */
export type PluginManagerTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginManagerElectron'>
  & InjectFace<PluginManagerTabInjected>

const RUNTIME_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginRuntimeState, 'absent'>, PluginManagerLocaleKey>

const OPERATION_KEYS = {
  enable: 'enabling',
  disable: 'disabling',
  reload: 'reloading',
  update: 'updating',
  reinstall: 'reinstalling',
  remove: 'removing',
} satisfies Record<PluginOperationKind, PluginManagerLocaleKey>

const OPERATION_VERBS = {
  enable: 'operationEnable',
  disable: 'operationDisable',
  reload: 'operationReload',
  update: 'operationUpdate',
  reinstall: 'operationReinstall',
  remove: 'operationRemove',
} satisfies Record<PluginOperationKind, PluginManagerLocaleKey>

const SYSTEM_NAMES: Readonly<Record<string, string>> = {
  '@dsh-electron/dsh-plugin-git': 'Git',
  '@dsh-electron/dsh-client-ui-details-host': 'Details Host',
  '@dsh-electron/dsh-theme-studio': 'Theme Studio',
  '@dsh-electron/dsh-electron-desktop-capabilities': 'Desktop Capabilities',
  '@dsh-electron/dsh-electron-ui-brand': 'Brand Adapter',
  '@dsh-electron/dsh-electron-ui-directory-picker': 'Directory Picker Adapter',
  '@dsh-electron/dsh-electron-ui-plugin-manager': 'Plugin Manager',
}

/** Derive a readable title without hiding the canonical package name. */
export function pluginDisplayName(plugin: PluginLifecycleEntry): string {
  const known = SYSTEM_NAMES[plugin.name]
  if (known !== undefined) return known
  const packageName = plugin.name.split('/').at(-1) ?? plugin.name
  const stem = packageName
    .replace(/^dsh-electron-ui-/, '')
    .replace(/^dsh-electron-/, '')
    .replace(/^dsh-plugin-/, '')
  return stem.split('-').filter(Boolean)
    .map(part => part.length <= 3 ? part.toLocaleUpperCase() : `${part[0]?.toLocaleUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

/** Whether one plugin matches the local search query. */
export function matchesPlugin(plugin: PluginLifecycleEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [plugin.name, plugin.description ?? '', pluginDisplayName(plugin)]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Lifecycle label and dot presentation derived from Host truth plus user intent. */
function lifecyclePresentation(
  plugin: PluginLifecycleEntry,
  activeOperation: ActivePluginOperation | undefined,
  t: PluginManagerTabProps['t'],
): { label: string; dot?: StateDotState } {
  if (activeOperation?.plugin === plugin.name) {
    return { label: t(OPERATION_KEYS[activeOperation.kind]), dot: 'ongoing' }
  }
  if (plugin.runtime === undefined) {
    return plugin.health === 'reconcile-required'
      ? { label: t('installationIncomplete'), dot: 'error' as const }
      : { label: t(plugin.kind === 'bundle' ? 'packageInstalled' : 'installedDependency') }
  }
  if (plugin.runtime === 'absent') {
    return plugin.desiredEnabled ? { label: t('notRunning') } : { label: t('disabled') }
  }
  const dot = plugin.runtime === 'active'
    ? 'done'
    : plugin.runtime === 'failed'
      ? 'error'
      : 'ongoing'
  return { label: t(RUNTIME_KEYS[plugin.runtime]), dot }
}

/** Actions allowed by committed desired state and current Host runtime. */
export function availableActions(plugin: PluginLifecycleEntry): PluginOperationKind[] {
  if (!plugin.manageable || plugin.required) return []
  if (plugin.runtime === 'active') return ['reload', 'disable']
  if (plugin.runtime === 'failed' && plugin.desiredEnabled) return ['reload', 'disable']
  if (plugin.runtime === 'absent' && !plugin.desiredEnabled) return ['enable']
  return []
}

/** Render one bundled plugin with Host status and permitted commands. */
function PluginRow({ plugin, state, mutate, t, readOnly = false, onRemove, updateAvailable }: {
  plugin: PluginLifecycleEntry
  state: PluginManagerState
  mutate: (operation: ActivePluginOperation) => void
  t: PluginManagerTabProps['t']
  readOnly?: boolean
  onRemove?: (plugin: PluginLifecycleEntry) => void
  updateAvailable?: string | undefined
}): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false)
  const title = pluginDisplayName(plugin)
  const presentation = lifecyclePresentation(plugin, state.activeOperation, t)
  const actions = readOnly ? [] : availableActions(plugin)
  const globallyLocked = state.activeOperation !== undefined || state.snapshot?.activeOperation !== undefined
  const packageItems = readOnly ? [] : [
    ...(plugin.packageActions.update === false || updateAvailable !== undefined ? [] : [{ id: 'update', label: t(plugin.packageActions.update === 'registry' ? 'update' : 'refreshSource') }]),
    ...(plugin.packageActions.reinstall ? [{ id: 'reinstall', label: t(plugin.health === 'reconcile-required' ? 'repair' : 'reinstall') }] : []),
    ...(plugin.packageActions.remove ? [{ id: 'remove', label: t('remove'), danger: true }] : []),
  ]
  return (
    <li className={css.pluginRow} data-runtime={plugin.runtime ?? plugin.health} data-plugin={plugin.name}>
      <div className={css.pluginIdentity}>
        <strong>{title}</strong>
        <code>{plugin.name}</code>
        {plugin.description === undefined ? null : <p>{plugin.description}</p>}
        {plugin.requestedSpec === undefined ? null : <span className={css.sourceSpec}>{plugin.requestedSpec}</span>}
      </div>
      <div className={css.pluginControl}>
        <div className={css.pluginMeta}>
          <span className={css.lifecycle}>
            {presentation.dot === undefined ? null : <StateDot state={presentation.dot} />}
            <span>{presentation.label}</span>
          </span>
          <span className={css.version}>v{plugin.version}</span>
        </div>
        {updateAvailable === undefined ? null : <span className={css.updateAvailable}>{t('updateAvailable', { version: updateAvailable })}</span>}
        {actions.length === 0 && packageItems.length === 0 && updateAvailable === undefined ? null : (
          <div className={css.actions}>
            {updateAvailable === undefined ? null : (
              <Button size="sm" variant="primary" disabled={globallyLocked} onClick={() => { mutate({ plugin: plugin.name, kind: 'update' }) }}>
                {t('update')}
              </Button>
            )}
            {actions.map((kind) => {
              const retry = kind === 'reload' && plugin.runtime === 'failed'
              const label = retry ? t('retryPlugin') : t(kind)
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant={kind === 'enable' || retry ? 'primary' : kind === 'disable' ? 'outline' : 'ghost'}
                  disabled={globallyLocked}
                  onClick={() => { mutate({ plugin: plugin.name, kind }) }}
                >
                  {label}
                </Button>
              )
            })}
            {packageItems.length === 0 ? null : (
              <Menu
                open={menuOpen}
                onClose={() => { setMenuOpen(false) }}
                items={packageItems}
                onSelect={(id) => {
                  setMenuOpen(false)
                  if (id === 'remove') onRemove?.(plugin)
                  else if (id === 'update' || id === 'reinstall') mutate({ plugin: plugin.name, kind: id })
                }}
                portal
                anchor={(
                  <button type="button" className={css.moreButton} aria-label={t('packageActions', { plugin: title })} disabled={globallyLocked} onClick={() => { setMenuOpen(value => !value) }}>
                    <IconEllipsisOutline16 aria-hidden="true" />
                  </button>
                )}
              />
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** Installed plugin lifecycle view mounted lazily by the upstream Plugins section. */
export function PluginManagerTab({ plugins, dialog, t }: PluginManagerTabProps): ReactNode {
  const controllerRef = useRef<PluginManagerController>()
  const [state, setState] = useState<PluginManagerState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [systemOpen, setSystemOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [installPending, setInstallPending] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<PluginLifecycleEntry>()

  useEffect(() => {
    const controller = new PluginManagerController(plugins)
    controllerRef.current = controller
    const unsubscribe = controller.subscribe(setState)
    void controller.start()
    return () => {
      controllerRef.current = undefined
      unsubscribe()
      controller.dispose()
    }
  }, [plugins])

  const snapshot = state.snapshot
  const installed = snapshot?.entries.filter(plugin => plugin.manageable || plugin.ownership === 'profile') ?? []
  const system = snapshot?.entries.filter(plugin => !plugin.manageable && plugin.ownership !== 'profile') ?? []
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => installed.filter(plugin => matchesPlugin(plugin, normalizedQuery)),
    [installed, normalizedQuery],
  )
  const mutate = (operation: ActivePluginOperation): void => {
    void controllerRef.current?.mutate(operation)
  }
  const updateByName = new Map(state.updateInfo?.map(info => [info.name, info]) ?? [])
  const operationErrorPlugin = state.operationError === undefined
    ? undefined
    : snapshot?.entries.find(plugin => plugin.name === state.operationError?.plugin)

  return (
    <section className={css.section} aria-busy={state.status === 'loading'}>
      <p className={css.intro}>{t('intro')}</p>
      {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.loadFailure}>
          <p role="alert">{t('loadError')}</p>
          <Button size="sm" variant="outline" onClick={() => { void controllerRef.current?.retryLoad() }}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
      {state.status === 'ready' && snapshot !== undefined ? (
        <>
          {state.operationError === undefined ? null : (
            <div className={css.operationFailure} role="alert">
              <strong>{t('operationFailed', {
                operation: t(OPERATION_VERBS[state.operationError.kind]),
                plugin: operationErrorPlugin === undefined
                  ? state.operationError.plugin
                  : pluginDisplayName(operationErrorPlugin),
              })}</strong>
              <span>{state.packageError?.message ?? t('stateRestored')}</span>
            </div>
          )}
          {state.checkError === undefined ? null : (
            <div className={css.operationFailure} role="alert">
              <strong>{t('updateCheckFailed')}</strong>
              <span>{state.checkError}</span>
            </div>
          )}
          <Input
            className={css.search!}
            type="search"
            value={query}
            icon={<IconSearchOutline16 aria-hidden="true" />}
            placeholder={t('search')}
            aria-label={t('search')}
            onChange={(event) => { setQuery(event.currentTarget.value) }}
          />
          <div className={css.headingRow}>
            <h3>{t('installed')}</h3>
            <span>{filtered.length}</span>
            <span className={css.headingActions}>
              <Button
                size="sm"
                variant="outline"
                disabled={state.activeOperation !== undefined
                  || snapshot.activeOperation !== undefined
                  || state.checkingUpdates === true
                  || installPending}
                onClick={() => { void controllerRef.current?.checkUpdates() }}
              >
                {t(state.checkingUpdates === true ? 'checkingUpdates' : 'checkUpdates')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                className={css.installButton}
                disabled={state.activeOperation !== undefined || installPending}
                onClick={() => { setInstallOpen(true) }}
              >
                {t('installPlugin')}
              </Button>
            </span>
          </div>
          {snapshot.pendingRestart.length === 0 ? null : (
            <div className={css.restartBanner} role="status">
              <strong>{t('changesRequireRestart')}</strong>
              <ul>{snapshot.pendingRestart.map(change => <li key={change.name}>{t(`restart${change.operation[0]?.toUpperCase() ?? ''}${change.operation.slice(1)}` as PluginManagerLocaleKey, { plugin: change.name })}</li>)}</ul>
              <span>{t('restartInstruction')}</span>
            </div>
          )}
          {installed.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {installed.length > 0 && filtered.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {filtered.length === 0 ? null : (
            <ul className={css.pluginList}>
              {filtered.map(plugin => (
                <PluginRow
                  key={plugin.name}
                  plugin={plugin}
                  state={state}
                  mutate={mutate}
                  t={t}
                  readOnly={installPending}
                  onRemove={setRemoveTarget}
                  updateAvailable={updateByName.get(plugin.name)?.updateAvailable === true
                    ? updateByName.get(plugin.name)?.wantedVersion
                    : undefined}
                />
              ))}
            </ul>
          )}
          <div className={css.systemSection}>
            <DisclosureRow
              icon={<IconCordisPluginOutline14 aria-hidden="true" />}
              title={t('systemComponents')}
              open={systemOpen}
              expandable
              expandOnRowClick
              onToggle={() => { setSystemOpen(open => !open) }}
              collapsedContent={<span className={css.systemCount}>{t('componentCount', { count: system.length })}</span>}
            >
              <ul className={css.systemList}>
                {system.map(plugin => (
                  <PluginRow key={plugin.name} plugin={plugin} state={state} mutate={mutate} t={t} readOnly />
                ))}
              </ul>
            </DisclosureRow>
          </div>
          <PluginInstallDialog
            open={installOpen}
            plugins={plugins}
            dialog={dialog}
            t={t}
            onClose={() => { setInstallOpen(false) }}
            onPendingChange={setInstallPending}
            onInstalled={async () => { await controllerRef.current?.refresh() }}
          />
          <PluginRemoveDialog
            plugin={removeTarget}
            pending={state.activeOperation?.kind === 'remove' || snapshot.activeOperation?.kind === 'remove'}
            onClose={() => { setRemoveTarget(undefined) }}
            onRemove={(name) => {
              setRemoveTarget(undefined)
              mutate({ plugin: name, kind: 'remove' })
            }}
            t={t}
          />
        </>
      ) : null}
    </section>
  )
}
