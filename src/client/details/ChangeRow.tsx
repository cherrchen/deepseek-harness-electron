import { useState } from 'react'
import type { ReactNode } from 'react'
import { splitRepoPath } from '../path-display.ts'
import { statusLetter, statusLetterTone, type GitChangeKind } from '../status-letter.ts'
import { GitIconButton } from './GitIconButton.tsx'
import { IconGitMinus, IconGitPlus, IconGitUndo } from './GitActionIcons.tsx'
import css from '../GitDetailsSurface.module.css'

/**
 * Destructive icon with a two-step confirmation: the first click arms the
 * control, the second executes, and focus loss disarms it.
 */
export function ConfirmIconAction({ label, confirmLabel, onConfirm }: {
  label: string
  confirmLabel: string
  onConfirm: () => void
}): ReactNode {
  const [armed, setArmed] = useState(false)
  return (
    <GitIconButton
      label={armed ? confirmLabel : label}
      armed={armed}
      autoFocus={armed}
      onBlur={() => { setArmed(false) }}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        onConfirm()
      }}
    >
      <IconGitUndo />
    </GitIconButton>
  )
}

/** Render one changed-file row with path, icon actions, and a trailing status letter. */
export function ChangeRow({ status, path, kind, toggleLabel, onSelect, onToggle, onDiscard, discardLabel, discardConfirmLabel }: {
  status: string
  path: string
  kind: GitChangeKind
  toggleLabel: string
  onSelect: () => void
  onToggle: () => void
  onDiscard?: () => void
  discardLabel?: string
  discardConfirmLabel?: string
}): ReactNode {
  const { name, dir } = splitRepoPath(path)
  const letter = statusLetter(status, kind)
  return (
    <div className={css.changeRow}>
      <button type="button" className={css.pathButton} onClick={onSelect}>
        <span className={css.pathMain}>
          <span className={css.fileName}>{name}</span>
          {dir !== '' && <span className={css.fileDir}>{dir}</span>}
        </span>
      </button>
      <div className={css.rowActions}>
        {onDiscard === undefined ? null : (
          <ConfirmIconAction
            label={discardLabel ?? ''}
            confirmLabel={discardConfirmLabel ?? ''}
            onConfirm={onDiscard}
          />
        )}
        <GitIconButton label={toggleLabel} onClick={onToggle}>
          {kind === 'staged' ? <IconGitMinus /> : <IconGitPlus />}
        </GitIconButton>
        <span className={css.statusLetter} data-tone={statusLetterTone(letter)}>{letter}</span>
      </div>
    </div>
  )
}
