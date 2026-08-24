import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  DisclosureRow,
  IconCordisPluginOutline14,
  IconSearchOutline16,
  Input,
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

/** Lifecycle capability injected from `ctx.desktop`. */
export interface PluginManagerTabInjected {
  plugins: DesktopCapabilitiesContract['plugins']
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
} satisfies Record<PluginOperationKind, PluginManagerLocaleKey>

const OPERATION_VERBS = {
  enable: 'operationEnable',
  disable: 'operationDisable',
  reload: 'operationReload',
} satisfies Record<PluginOperationKind, PluginManagerLocaleKey>

const SYSTEM_NAMES: Readonly<Record<string, string>> = {
  '@dsh-electron/dsh-plugin-git': 'Git',
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
function PluginRow({ plugin, state, mutate, t, readOnly = false }: {
  plugin: PluginLifecycleEntry
  state: PluginManagerState
  mutate: (operation: ActivePluginOperation) => void
  t: PluginManagerTabProps['t']
  readOnly?: boolean
}): ReactNode {
  const title = pluginDisplayName(plugin)
  const presentation = lifecyclePresentation(plugin, state.activeOperation, t)
  const actions = readOnly ? [] : availableActions(plugin)
  const globallyLocked = state.activeOperation !== undefined
  return (
    <li className={css.pluginRow} data-runtime={plugin.runtime} data-plugin={plugin.name}>
      <div className={css.pluginIdentity}>
        <strong>{title}</strong>
        <code>{plugin.name}</code>
        {plugin.description === undefined ? null : <p>{plugin.description}</p>}
      </div>
      <div className={css.pluginControl}>
        <div className={css.pluginMeta}>
          <span className={css.lifecycle}>
            {presentation.dot === undefined ? null : <StateDot state={presentation.dot} />}
            <span>{presentation.label}</span>
          </span>
          <span className={css.version}>v{plugin.version}</span>
        </div>
        {actions.length === 0 ? null : (
          <div className={css.actions}>
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
          </div>
        )}
      </div>
    </li>
  )
}

/** Installed plugin lifecycle view mounted lazily by the upstream Plugins section. */
export function PluginManagerTab({ plugins, t }: PluginManagerTabProps): ReactNode {
  const controllerRef = useRef<PluginManagerController>()
  const [state, setState] = useState<PluginManagerState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [systemOpen, setSystemOpen] = useState(false)

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
  const manageable = snapshot?.entries.filter(plugin => plugin.manageable) ?? []
  const system = snapshot?.entries.filter(plugin => !plugin.manageable) ?? []
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => manageable.filter(plugin => matchesPlugin(plugin, normalizedQuery)),
    [manageable, normalizedQuery],
  )
  const mutate = (operation: ActivePluginOperation): void => {
    void controllerRef.current?.mutate(operation)
  }
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
              <span>{t('stateRestored')}</span>
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
          </div>
          {manageable.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {manageable.length > 0 && filtered.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {filtered.length === 0 ? null : (
            <ul className={css.pluginList}>
              {filtered.map(plugin => (
                <PluginRow key={plugin.name} plugin={plugin} state={state} mutate={mutate} t={t} />
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
        </>
      ) : null}
    </section>
  )
}
