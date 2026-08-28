/**
 * Themes preference row registered into the General section item slot:
 * title, description, theme cards with preview/apply, and a preview action bar.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemePreview } from './types.ts'
import type { createThemeStudioRowStore } from './store.ts'
import { formatLocale, type ThemeStudioKey } from './locales.ts'
import css from './ThemeStudioRow.module.css'

/** Injected business face: overlay writes. Copy rides the locale seat. */
export interface ThemeStudioRowInjected {
  /** Start a transient preview; `null` previews Default. */
  previewTheme: (id: string | null) => void
  /** Persist a builtin theme, or Default when `id` is `null`. */
  activateTheme: (id: string | null) => void
  /** Drop the transient preview. */
  cancelPreview: () => void
  /** Persist the theme currently being previewed. */
  applyPreview: () => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type ThemeStudioRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createThemeStudioRowStore>>
  & PropsLocale<'settings.theme-studio'> & ThemeStudioRowInjected

const NAME_KEYS: Record<string, ThemeStudioKey> = {
  'dsh-theme-studio.graphite': 'graphite.name',
  'dsh-theme-studio.oled': 'oled.name',
  'dsh-theme-studio.nordic': 'nordic.name',
  'dsh-theme-studio.paper': 'paper.name',
  'dsh-theme-studio.warm': 'warm.name',
}

/**
 * Render the Themes row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function ThemeStudioRow({
  t, useStore, previewTheme, activateTheme, cancelPreview, applyPreview,
}: ThemeStudioRowComponentProps) {
  const cards = useStore(s => s.cards)
  const activeThemeId = useStore(s => s.activeThemeId)
  const previewThemeId = useStore(s => s.previewThemeId)
  const previewing = useStore(s => s.previewing)
  const settingsStatus = useStore(s => s.settingsStatus)
  const previewName = previewLabel(t, previewing, previewThemeId)

  return (
    <div className={css.group}>
      <div className={css.title}>{t('title')}</div>
      <p className={css.description}>{t('description')}</p>
      {settingsStatus === 'loading' ? <p className={css.status}>{t('status.loading')}</p> : null}
      {settingsStatus === 'unavailable' ? <p className={css.status}>{t('status.unavailable')}</p> : null}
      <div className={css.grid} role="list">
        {cards.map((card) => {
          const name = t(card.nameKey as ThemeStudioKey)
          const active = activeThemeId === card.id
          const cardPreviewing = previewing && previewThemeId === card.id
          const badge = active ? t('current') : cardPreviewing ? t('preview') : null
          return (
            <article key={card.id ?? 'default'} className={cardClass(css, active, cardPreviewing)} role="listitem">
              <div className={css.cardTop}>
                <Mosaic preview={card.preview.light} />
                <div className={css.cardMeta}>
                  <div className={css.name}>{name}</div>
                  {badge ? <div className={css.cardStatus}>{badge}</div> : null}
                </div>
              </div>
              <div className={css.actions}>
                <button
                  type="button"
                  className={css.action}
                  aria-pressed={cardPreviewing}
                  aria-label={formatLocale(t('previewNamed'), { name })}
                  onClick={() => { previewTheme(card.id) }}
                >
                  {t('preview')}
                </button>
                <button
                  type="button"
                  className={css.action}
                  aria-pressed={active && !previewing}
                  aria-label={formatLocale(t('applyNamed'), { name })}
                  onClick={() => { activateTheme(card.id) }}
                >
                  {t('apply')}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <div className={css.live} role="status" aria-live="polite">
        {previewing ? formatLocale(t('previewing'), { name: previewName }) : ''}
      </div>
      {previewing ? (
        <div className={css.bar}>
          <span>{formatLocale(t('previewing'), { name: previewName })}</span>
          <div className={css.actions}>
            <button type="button" className={css.action} onClick={() => { applyPreview() }}>
              {t('apply')}
            </button>
            <button type="button" className={css.action} onClick={() => { cancelPreview() }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Mosaic({ preview }: { preview: ThemePreview }) {
  return (
    <div className={css.mosaic} aria-hidden="true">
      <span style={{ background: preview.background }} />
      <span style={{ background: preview.surface }} />
      <span style={{ background: preview.foreground }} />
      <span style={{ background: preview.accent }} />
    </div>
  )
}

function cardClass(
  styles: Record<string, string>,
  active: boolean,
  previewing: boolean,
): string {
  const names = [styles['card'] ?? '']
  if (active) names.push(styles['active'] ?? '')
  if (previewing) names.push(styles['previewing'] ?? '')
  return names.filter(name => name.length > 0).join(' ')
}

function previewLabel(
  t: (key: ThemeStudioKey) => string,
  previewing: boolean,
  previewThemeId: string | null,
): string {
  if (!previewing) return ''
  if (previewThemeId === null) return t('default.name')
  return t(NAME_KEYS[previewThemeId] ?? 'default.name')
}
