import type { ReactNode } from 'react'
import type { GitRepositorySnapshot } from '../../types.ts'
import type { GitClientController } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { changedPathCount } from '../changed-path-count.ts'
import { BulkActions, ChangeSection } from './ChangeSection.tsx'
import css from '../GitDrawer.module.css'

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
      {clean && <p className={css.empty}>{t('drawer.clean')}</p>}
      <ChangeSection
        title={t('drawer.staged')}
        changes={repository.staged}
        action={t('drawer.unstage')}
        onSelect={(path) => { void controller.selectDiff(path, true) }}
        onAction={(path) => { void controller.unstage(path) }}
      />
      <ChangeSection
        title={t('drawer.unstaged')}
        changes={repository.unstaged}
        action={t('drawer.stage')}
        onSelect={(path) => { void controller.selectDiff(path, false) }}
        onAction={(path) => { void controller.stage(path) }}
      />
      <ChangeSection
        title={t('drawer.untracked')}
        changes={repository.untracked.map(path => ({ path, status: '??' }))}
        action={t('drawer.stage')}
        onSelect={(path) => { void controller.selectDiff(path, false) }}
        onAction={(path) => { void controller.stage(path) }}
      />
      {!clean && (
        <BulkActions
          stageAllLabel={t('drawer.stageAll')}
          unstageAllLabel={t('drawer.unstageAll')}
          onStageAll={() => { void controller.stage() }}
          onUnstageAll={() => { void controller.unstage() }}
        />
      )}
      {loading && <p className={css.loadingHint}>{t('drawer.loading')}</p>}
    </div>
  )
}
