import type { ReactNode } from 'react'
import type { GitFileChange } from '../../types.ts'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChangeRow } from './ChangeRow.tsx'
import css from '../GitDetailsSurface.module.css'

/** Render one change section with title, count, and rows. */
export function ChangeSection({ title, changes, action, onSelect, onAction }: {
  title: string
  changes: readonly GitFileChange[]
  action: string
  onSelect: (path: string) => void
  onAction: (path: string) => void
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
