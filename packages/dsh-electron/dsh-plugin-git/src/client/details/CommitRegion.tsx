/**
 * Fixed commit region inside the Git Changes surface: editable message,
 * optional AI proposal, staged summary, and the commit action. Generation
 * only fills the editable input — it never stages, commits, or pushes.
 */
import type { ReactNode } from 'react'
import type { GitRepositorySnapshot } from '../../types.ts'
import type { GitClientController } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { formatLocale } from '../locales.ts'
import { splitRepoPath } from '../path-display.ts'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from '../GitDetailsSurface.module.css'

/** Render the commit region for the staged index. */
export function CommitRegion({ repository, controller, t, error, commitMessage, generating, generationAvailable, generationError }: {
  repository: GitRepositorySnapshot
  controller: GitClientController
  t: (key: GitLocaleKey) => string
  error: string | undefined
  commitMessage: string
  generating: boolean
  generationAvailable: boolean
  generationError: string | undefined
}): ReactNode {
  const stagedCount = repository.staged.length
  const canCommit = commitMessage.trim() !== '' && stagedCount > 0 && !generating
  const canGenerate = generationAvailable && stagedCount > 0 && !generating
  return (
    <div className={css.tabBody} data-git-commit-region="">
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      <p className={css.stagedSummary}>
        {formatLocale(t('details.stagedCount'), { count: stagedCount })}
      </p>
      <label className={css.field}>
        <span>{t('details.commitPlaceholder')}</span>
        <textarea
          value={commitMessage}
          onChange={(event) => { controller.setCommitMessage(event.target.value) }}
          placeholder={t('details.commitPlaceholder')}
        />
      </label>
      <div className={css.commitActions}>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canGenerate}
          title={!generationAvailable
            ? t('details.generateUnavailable')
            : stagedCount === 0 ? t('details.generateNeedsStaged') : undefined}
          onClick={() => { void controller.generateCommitMessage() }}
        >
          {generating ? t('details.generating') : t('details.generate')}
        </Button>
        <Button
          variant="primary"
          disabled={!canCommit}
          onClick={() => { void controller.commit(commitMessage) }}
        >
          {t('details.commit')}
        </Button>
      </div>
      {generationError !== undefined && <p className={css.error} role="alert">{t('details.generateFailed')}</p>}
      <ul className={css.commitList}>
        {repository.staged.map((change) => {
          const { name } = splitRepoPath(change.path)
          return <li key={change.path}><code>{change.status.trim()}</code> {name}</li>
        })}
      </ul>
    </div>
  )
}
