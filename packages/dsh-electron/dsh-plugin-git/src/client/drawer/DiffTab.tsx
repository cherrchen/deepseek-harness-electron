import type { ReactNode } from 'react'
import type { GitDiff, GitRepositorySnapshot } from '../../types.ts'
import type { GitSelectedDiff } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { splitRepoPath } from '../path-display.ts'
import css from '../GitDrawer.module.css'

function DiffLine({ line }: { line: string }): ReactNode {
  let className = css.diffPlain
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) className = css.diffMeta
  else if (line.startsWith('+')) className = css.diffAdd
  else if (line.startsWith('-')) className = css.diffDel
  return <div className={className}>{line}</div>
}

/** Render the Diff tab for the selected changed file. */
export function DiffTab({ repository, selectedDiff, diff, clean, t, error }: {
  repository: GitRepositorySnapshot
  selectedDiff: GitSelectedDiff | undefined
  diff: GitDiff | undefined
  clean: boolean
  t: (key: GitLocaleKey) => string
  error: string | undefined
}): ReactNode {
  if (clean) return <p className={css.empty}>{t('drawer.noChangesDiff')}</p>
  if (selectedDiff === undefined) return <p className={css.empty}>{t('drawer.noDiff')}</p>
  const untracked = repository.untracked.includes(selectedDiff.path)
  if (untracked) return <p className={css.empty}>{t('drawer.untrackedDiff')}</p>
  const { name, dir } = splitRepoPath(selectedDiff.path)
  const mode = selectedDiff.staged ? t('drawer.stagedLabel') : t('drawer.workingTree')
  return (
    <div className={css.tabBody}>
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      <header className={css.diffHeader}>
        <strong>{name}</strong>
        <span>{dir !== '' ? `${dir}${name}` : name}</span>
        <span className={css.diffMode}>{mode}</span>
      </header>
      <div className={css.diffBody}>
        {diff === undefined
          ? <p className={css.empty}>{t('drawer.loading')}</p>
          : diff.text === ''
            ? <p className={css.empty}>{t('drawer.clean')}</p>
            : diff.text.split('\n').map((line, index) => <DiffLine key={`${index}:${line}`} line={line} />)}
      </div>
    </div>
  )
}
