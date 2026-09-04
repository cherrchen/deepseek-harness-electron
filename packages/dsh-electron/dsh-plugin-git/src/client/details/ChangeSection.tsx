import { useState } from 'react'
import type { ReactNode } from 'react'
import type { GitFileChange } from '../../types.ts'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChangeRow } from './ChangeRow.tsx'
import css from '../GitDetailsSurface.module.css'

/**
 * Destructive action button with a two-step confirmation: the first click
 * arms the row, the second executes, and focus loss disarms it.
 */
export function ConfirmAction({ label, confirmLabel, onConfirm }: {
  label: string
  confirmLabel: string
  onConfirm: () => void
}): ReactNode {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <Button size="sm" variant="ghost" onClick={() => { setArmed(true) }}>{label}</Button>
    )
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      autoFocus
      onBlur={() => { setArmed(false) }}
      onClick={() => { setArmed(false); onConfirm() }}
    >
      {confirmLabel}
    </Button>
  )
}

/** Render one change section with title, count, and rows. */
export function ChangeSection({ title, changes, action, onSelect, onAction, onDiscard, discardLabel, discardConfirmLabel }: {
  title: string
  changes: readonly GitFileChange[]
  action: string
  onSelect: (path: string) => void
  onAction: (path: string) => void
  /** Optional destructive discard handler; present renders the confirm control. */
  onDiscard?: (path: string) => void
  discardLabel?: string
  discardConfirmLabel?: string
}): ReactNode {
  if (changes.length === 0) return null
  return (
    <section className={css.changeSection}>
      <h3>{title}<span>{changes.length}</span></h3>
      {changes.map(change => (
        <ChangeRow
          key={`${change.status}:${change.path}`}
          status={change.status}
          path={change.path}
          action={action}
          onSelect={() => { onSelect(change.path) }}
          onAction={() => { onAction(change.path) }}
          trailing={onDiscard !== undefined
            ? (
              <ConfirmAction label={discardLabel ?? ''} confirmLabel={discardConfirmLabel ?? ''} onConfirm={() => { onDiscard(change.path) }} />
            )
            : undefined}
        />
      ))}
    </section>
  )
}

/** Render stage-all and unstage-all controls. */
export function BulkActions({ stageAllLabel, unstageAllLabel, onStageAll, onUnstageAll }: {
  stageAllLabel: string
  unstageAllLabel: string
  onStageAll: () => void
  onUnstageAll: () => void
}): ReactNode {
  return (
    <div className={css.bulkActions}>
      <Button size="sm" variant="ghost" onClick={onStageAll}>{stageAllLabel}</Button>
      <Button size="sm" variant="ghost" onClick={onUnstageAll}>{unstageAllLabel}</Button>
    </div>
  )
}
