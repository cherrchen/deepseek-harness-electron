import type { ReactNode } from 'react'
import type { GitRepositorySnapshot } from '../../types.ts'
import type { GitClientController } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { changedPathCount } from '../changed-path-count.ts'
import { BulkActions, ChangeSection } from './ChangeSection.tsx'
import css from '../GitDetailsSurface.module.css'

/** Render the Changes tab with staged, unstaged, and untracked sections. */
export function ChangesTab({ repository, controller, t, loading, error }: {
  repository: GitRepositorySnapshot
  controller: GitClientController
  t: (key: GitLocaleKey) => string
  loading: boolean
  error: string | undefined
}): ReactNode {
  const clean = changedPathCount(repository) === 0
  return (
    <div className={css.tabBody}>
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      {clean && <p className={css.empty}>{t('details.clean')}</p>}
      <ChangeSection
        title={t('details.staged')}
        changes={repository.staged}
        action={t('details.unstage')}
        onSelect={(path) => { void controller.selectDiff(path, true) }}
        onAction={(path) => { void controller.unstage(path) }}
      />
      <ChangeSection
        title={t('details.unstaged')}
        changes={repository.unstaged}
        action={t('details.stage')}
        onSelect={(path) => { void controller.selectDiff(path, false) }}
        onAction={(path) => { void controller.stage(path) }}
      />
      <ChangeSection
        title={t('details.untracked')}
        changes={repository.untracked.map(path => ({ path, status: '??' }))}
        action={t('details.stage')}
        onSelect={(path) => { void controller.selectDiff(path, false) }}
        onAction={(path) => { void controller.stage(path) }}
      />
      {!clean && (
        <BulkActions
          stageAllLabel={t('details.stageAll')}
          unstageAllLabel={t('details.unstageAll')}
          onStageAll={() => { void controller.stage() }}
          onUnstageAll={() => { void controller.unstage() }}
        />
      )}
      {loading && <p className={css.loadingHint}>{t('details.loading')}</p>}
    </div>
  )
}
