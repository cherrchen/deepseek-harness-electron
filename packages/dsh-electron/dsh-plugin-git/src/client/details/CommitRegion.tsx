/**
 * Fixed commit region inside the Git Changes surface: editable message,
 * optional AI proposal, staged summary, and the commit action. Generation
 * only fills the editable input — it never stages, commits, or pushes.
 */
import type { ReactNode } from 'react'
import type { GitGenerationUnavailableReason, GitRepositorySnapshot } from '../../types.ts'
import type { GitClientController } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { formatLocale } from '../locales.ts'
import { splitRepoPath } from '../path-display.ts'
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from '../GitDetailsSurface.module.css'

/** Render the commit region for the staged index. */
export function CommitRegion({ repository, controller, t, error, commitMessage, generating, generationAvailable, generationReason, generationError }: {
  repository: GitRepositorySnapshot
  controller: GitClientController
  t: (key: GitLocaleKey) => string
  error: string | undefined
  commitMessage: string
  generating: boolean
  generationAvailable: boolean
  generationReason: GitGenerationUnavailableReason | undefined
  generationError: string | undefined
}): ReactNode {
  const stagedCount = repository.staged.length
  const canCommit = commitMessage.trim() !== '' && stagedCount > 0 && !generating
  const canGenerate = generationAvailable && stagedCount > 0 && !generating
  const unavailableHint = generationReason === 'llm-unavailable'
    ? t('details.generateLlmUnavailable')
    : generationReason === 'default-model-missing'
      ? t('details.generateNoDefaultModel')
      : t('details.generateUnavailable')
  return (
    <div className={css.tabBody} data-git-commit-region="">
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      <p className={css.stagedSummary}>
        {formatLocale(t('details.stagedCount'), { count: stagedCount })}
      </p>
      <div className={css.field}>
        <textarea
          aria-label={t('details.commitPlaceholder')}
          rows={2}
          value={commitMessage}
          onChange={(event) => { controller.setCommitMessage(event.target.value) }}
          placeholder={t('details.commitPlaceholder')}
        />
        <Tooltip label={generating ? t('details.generating') : !generationAvailable ? unavailableHint : stagedCount === 0 ? t('details.generateNeedsStaged') : t('details.generate')} side="top">
          <button
            type="button"
            className={css.generateButton}
            aria-label={generating ? t('details.generating') : t('details.generate')}
            aria-disabled={!canGenerate || undefined}
            aria-busy={generating}
            onClick={() => { if (canGenerate) void controller.generateCommitMessage() }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 3 2.2 5.8L17 11l-5.8 2.2L9 19l-2.2-5.8L1 11l5.8-2.2L9 3Zm10 11 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" />
            </svg>
          </button>
        </Tooltip>
      </div>
      <div className={css.commitActions}>
        <Button
          variant="primary"
          disabled={!canCommit}
          onClick={() => { void controller.commit(commitMessage) }}
        >
          {t('details.commit')}
        </Button>
      </div>
      {generationError !== undefined && (
        <p className={css.error} role="alert">
          {generationError === 'stage-changes-first' ? t('details.generateNeedsStaged') : generationError}
        </p>
      )}
      <ul className={css.commitList}>
        {repository.staged.map((change) => {
          const { name } = splitRepoPath(change.path)
          return <li key={change.path}><code>{change.status.trim()}</code> {name}</li>
        })}
      </ul>
    </div>
  )
}
