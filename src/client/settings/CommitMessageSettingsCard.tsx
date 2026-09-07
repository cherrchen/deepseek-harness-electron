/**
 * Plugin configuration card for commit-message generation: session-model
 * inherit vs a pinned provider route, plus the system-prompt override.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { CommitMessageSettingsCardController } from './commit-message-card-controller.ts'
import { commitMessageModelKey } from './commit-message-card-controller.ts'
import css from './CommitMessageSettingsCard.module.css'

/** Props the renderer binds for the commit-message settings card. */
export type CommitMessageSettingsCardProps =
  PropsLocale<'git'>
  & { controller: CommitMessageSettingsCardController }

/**
 * Render the Git commit-message generation card.
 * @param props - locale copy and the staged card controller.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function CommitMessageSettingsCard(props: CommitMessageSettingsCardProps): ReactNode {
  const { controller, t } = props
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [open, setOpen] = useState(false)
  const saveStarted = useRef(false)
  useEffect(() => {
    if (state.saving) {
      saveStarted.current = true
      return
    }
    if (!saveStarted.current) return
    saveStarted.current = false
    if (!state.dirty && !state.failed) setOpen(false)
  }, [state.dirty, state.failed, state.saving])
  if (!state.available) return null
  const title = t('settings.title')
  const disabled = !state.writable || state.saving
  const blocked = !state.dirty || state.invalid || state.saving
  const selectedKey = state.provider !== '' && state.model !== ''
    ? commitMessageModelKey({ provider: state.provider, model: state.model })
    : ''
  const grouped: Array<{ provider: string; name: string; candidates: Array<(typeof state.candidates)[number]> }> = []
  for (const candidate of state.candidates) {
    if (!candidate.available) continue
    const group = grouped.find(entry => entry.provider === candidate.provider)
    if (group === undefined) grouped.push({ provider: candidate.provider, name: candidate.providerName, candidates: [candidate] })
    else group.candidates.push(candidate)
  }
  const unavailable = state.candidates.filter(candidate => !candidate.available)
  return (
    <li className={open ? `${css.card} ${css.cardOpen}` : css.card} data-git-commit-message-settings="">
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{title}</span>
          <span className={css.description}>{t('settings.description')}</span>
        </span>
        {state.dirty ? <span className={css.pending}>{t('settings.unsaved')}</span> : null}
        <IconChevronDownOutline14 className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly} role="status">{t('settings.readOnly')}</p> : null}
            <div className={css.field}>
              <span className={css.label} id="git-commit-message-model">{t('settings.model')}</span>
              <div className={css.modes} role="radiogroup" aria-labelledby="git-commit-message-model">
                <label className={css.mode}>
                  <input
                    type="radio"
                    name="git-commit-message-mode"
                    checked={state.mode === 'inherit'}
                    disabled={disabled}
                    onChange={() => { controller.setMode('inherit') }}
                  />
                  {t('settings.modelInherit')}
                </label>
                <label className={css.mode}>
                  <input
                    type="radio"
                    name="git-commit-message-mode"
                    checked={state.mode === 'custom'}
                    disabled={disabled}
                    onChange={() => { controller.setMode('custom') }}
                  />
                  {t('settings.modelCustom')}
                </label>
              </div>
              <p className={css.hint}>{t('settings.modelHint')}</p>
            </div>
            {state.mode === 'custom'
              ? (
                <div className={css.field}>
                  <label className={css.label} htmlFor="git-commit-message-model-select">{t('settings.modelSelect')}</label>
                  {state.catalogStatus === 'loading'
                    ? <p className={css.notice} role="status">{t('settings.catalogLoading')}</p>
                    : null}
                  {state.catalogStatus === 'error'
                    ? (
                      <div className={css.catalogError} role="alert">
                        <span>{t('settings.catalogFailed')}</span>
                        <button type="button" className={css.retry} disabled={state.saving} onClick={() => { controller.retryCatalog() }}>
                          {t('settings.catalogRetry')}
                        </button>
                      </div>
                    )
                    : null}
                  {state.candidates.length > 0
                    ? (
                      <select
                        id="git-commit-message-model-select"
                        className={css.select}
                        value={selectedKey}
                        disabled={disabled}
                        onChange={(event) => { controller.setModel(event.target.value) }}
                      >
                        {selectedKey === ''
                          ? <option value="">{t('settings.modelSelectPlaceholder')}</option>
                          : null}
                        {[...grouped].map(group => (
                          <optgroup key={group.provider} label={group.name}>
                            {group.candidates.map(candidate => (
                              <option key={candidate.key} value={candidate.key}>
                                {`${candidate.modelName} (${candidate.provider}/${candidate.model})`}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {unavailable.map(candidate => (
                          <option key={candidate.key} value={candidate.key}>
                            {`${candidate.modelName} (${t('settings.modelUnavailable')})`}
                          </option>
                        ))}
                      </select>
                    )
                    : state.catalogStatus === 'ready'
                      ? (
                        <>
                          <p className={css.notice}>{t('settings.catalogEmpty')}</p>
                          <label className={css.label} htmlFor="git-commit-message-provider">{t('settings.provider')}</label>
                          <input
                            id="git-commit-message-provider"
                            className={css.input}
                            value={state.provider}
                            disabled={disabled}
                            onChange={(event) => { controller.setProviderText(event.target.value) }}
                          />
                          <label className={css.label} htmlFor="git-commit-message-model-id">{t('settings.modelId')}</label>
                          <input
                            id="git-commit-message-model-id"
                            className={css.input}
                            value={state.model}
                            disabled={disabled}
                            onChange={(event) => { controller.setModelText(event.target.value) }}
                          />
                        </>
                      )
                      : null}
                  {state.invalid ? <p className={css.invalid}>{t('settings.customRequired')}</p> : null}
                </div>
              )
              : null}
            <div className={css.field}>
              <label className={css.label} htmlFor="git-commit-message-system">{t('settings.systemPrompt')}</label>
              <textarea
                id="git-commit-message-system"
                className={css.textarea}
                value={state.systemPrompt}
                placeholder={t('settings.systemPromptPlaceholder')}
                disabled={disabled}
                onChange={(event) => { controller.setSystemPrompt(event.target.value) }}
              />
              <p className={css.hint}>{t('settings.systemPromptHint')}</p>
            </div>
            <div className={css.footer}>
              {state.failed ? <p className={css.failed} role="status">{t('settings.saveFailed')}</p> : null}
              <button
                type="button"
                className={css.discard}
                disabled={!state.dirty || state.saving}
                onClick={() => { controller.discard() }}
              >
                {t('settings.discard')}
              </button>
              <button
                type="button"
                className={css.save}
                disabled={blocked}
                onClick={() => { controller.save() }}
              >
                {t(state.saving ? 'settings.saving' : 'settings.save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
