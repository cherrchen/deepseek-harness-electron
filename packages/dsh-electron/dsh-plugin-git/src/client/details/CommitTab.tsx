import { useState } from 'react'
import type { ReactNode } from 'react'
import type { GitRepositorySnapshot } from '../../types.ts'
import type { GitClientController } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { formatLocale } from '../locales.ts'
import { splitRepoPath } from '../path-display.ts'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from '../GitDetailsSurface.module.css'

/** Render the Commit tab with message input and staged file list. */
export function CommitTab({ repository, controller, t, loading, error }: {
  repository: GitRepositorySnapshot
  controller: GitClientController
  t: (key: GitLocaleKey) => string
  loading: boolean
  error: string | undefined
}): ReactNode {
  const [message, setMessage] = useState('')
  const canCommit = message.trim() !== '' && repository.staged.length > 0 && !loading
  return (
    <div className={css.tabBody} key={repository.root}>
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      <p className={css.stagedSummary}>
        {formatLocale(t('details.stagedCount'), { count: repository.staged.length })}
      </p>
      <label className={css.field}>
        <span>{t('details.commitPlaceholder')}</span>
        <textarea
          value={message}
          onChange={(event) => { setMessage(event.target.value) }}
          placeholder={t('details.commitPlaceholder')}
        />
      </label>
      <ul className={css.commitList}>
        {repository.staged.map((change) => {
          const { name } = splitRepoPath(change.path)
          return <li key={change.path}><code>{change.status.trim()}</code> {name}</li>
        })}
      </ul>
      <div className={css.commitActions}>
        <Button
          variant="primary"
          disabled={!canCommit}
          onClick={() => { void controller.commit(message).then(() => { setMessage('') }) }}
        >
          {t('details.commit')}
        </Button>
      </div>
    </div>
  )
}
