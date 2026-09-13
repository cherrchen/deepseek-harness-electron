/**
 * A Git page tab's chip title. `t` arrives as a slot prop and the slot
 * framework re-renders the chip when the locale changes, so the title follows
 * the language for already-open tabs; without this seat registrant the chip
 * keeps the text captured when the tab was opened.
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitLocaleKey } from './locales.ts'

/** Props for one Git page tab title registration. */
export type GitPageTitleProps = PropsRuntime<'sidebar.right.pane.tab.title'>
  & PropsLocale<'git'>
  & { readonly labelKey: GitLocaleKey }

/** Render one Git page tab's live title chip. */
export function GitPageTitle({ t, labelKey }: GitPageTitleProps): ReactNode {
  return <>{t(labelKey)}</>
}
