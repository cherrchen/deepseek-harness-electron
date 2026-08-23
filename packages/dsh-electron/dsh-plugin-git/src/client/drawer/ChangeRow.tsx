import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { splitRepoPath } from '../path-display.ts'
import css from '../GitDrawer.module.css'

/** Render one changed-file row with status, path, and action. */
export function ChangeRow({ status, path, action, onSelect, onAction }: {
  status: string
  path: string
  action: string
  onSelect: () => void
  onAction: () => void
}): ReactNode {
  const { name, dir } = splitRepoPath(path)
  return (
    <div className={css.changeRow}>
      <button type="button" className={css.pathButton} onClick={onSelect}>
        <code>{status.trim() || '?'}</code>
        <span className={css.pathMain}>
          <span className={css.fileName}>{name}</span>
          {dir !== '' && <span className={css.fileDir}>{dir}</span>}
        </span>
      </button>
      <Button size="sm" variant="ghost" onClick={onAction}>{action}</Button>
    </div>
  )
}
