import type { ReactNode } from 'react'
import type { GitFileChange } from '../../types.ts'
import type { GitChangeKind } from '../status-letter.ts'
import { ChangeRow, ConfirmIconAction } from './ChangeRow.tsx'
import { GitIconButton } from './GitIconButton.tsx'
import { IconGitMinus, IconGitPlus } from './GitActionIcons.tsx'
import css from '../GitDetailsSurface.module.css'

/** Render one change section with title, bulk icon actions, and rows. */
export function ChangeSection({ title, changes, kind, toggleLabel, toggleAllLabel, onSelect, onToggle, onToggleAll, onDiscard, onDiscardAll, discardLabel, discardConfirmLabel, discardAllLabel }: {
  title: string
  changes: readonly GitFileChange[]
  kind: GitChangeKind
  toggleLabel: string
  toggleAllLabel: string
  onSelect: (path: string) => void
  onToggle: (path: string) => void
  onToggleAll: () => void
  onDiscard?: (path: string) => void
  onDiscardAll?: () => void
  discardLabel?: string
  discardConfirmLabel?: string
  discardAllLabel?: string
}): ReactNode {
  if (changes.length === 0) return null
  return (
    <section className={css.changeSection}>
      <h3>
        <span className={css.sectionTitle}>{title}<span className={css.sectionCount}>{changes.length}</span></span>
        <span className={css.sectionActions}>
          {onDiscardAll === undefined ? null : (
            <ConfirmIconAction
              label={discardAllLabel ?? ''}
              confirmLabel={discardConfirmLabel ?? ''}
              onConfirm={onDiscardAll}
            />
          )}
          <GitIconButton label={toggleAllLabel} onClick={onToggleAll}>
            {kind === 'staged' ? <IconGitMinus /> : <IconGitPlus />}
          </GitIconButton>
        </span>
      </h3>
      {changes.map(change => (
        <ChangeRow
          key={`${change.status}:${change.path}`}
          status={change.status}
          path={change.path}
          kind={kind}
          toggleLabel={toggleLabel}
          onSelect={() => { onSelect(change.path) }}
          onToggle={() => { onToggle(change.path) }}
          {...(onDiscard === undefined ? {} : {
            onDiscard: () => { onDiscard(change.path) },
            discardLabel: discardLabel ?? '',
            discardConfirmLabel: discardConfirmLabel ?? '',
          })}
        />
      ))}
    </section>
  )
}
