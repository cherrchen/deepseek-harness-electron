import type { ReactNode } from 'react'
import type { GitRepositorySnapshot } from '../../types.ts'
import type { GitClientController } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { changedPathCount } from '../changed-path-count.ts'
import { ChangeSection } from './ChangeSection.tsx'
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
        kind="staged"
        changes={repository.staged}
        toggleLabel={t('details.unstage')}
        toggleAllLabel={t('details.unstageAll')}
        onSelect={(change) => { controller.openDiff(change.path, true) }}
        onToggle={(change) => { void controller.unstage(change) }}
        onToggleAll={() => { void controller.unstage() }}
        onDiscard={(change) => { void controller.discard(change, 'head') }}
        discardLabel={t('details.discard')}
        discardConfirmLabel={t('details.discardConfirm')}
      />
      <ChangeSection
        title={t('details.unstaged')}
        kind="unstaged"
        changes={repository.unstaged}
        toggleLabel={t('details.stage')}
        toggleAllLabel={t('details.stageAll')}
        onSelect={(change) => { controller.openDiff(change.path, false) }}
        onToggle={(change) => { void controller.stage(change) }}
        onToggleAll={() => { void controller.stage() }}
        onDiscard={(change) => { void controller.discard(change) }}
        onDiscardAll={() => { void controller.discard() }}
        discardLabel={t('details.discard')}
        discardConfirmLabel={t('details.discardConfirm')}
        discardAllLabel={t('details.discardAll')}
      />
      <ChangeSection
        title={t('details.untracked')}
        kind="untracked"
        changes={repository.untracked.map(path => ({ path, status: '??' }))}
        toggleLabel={t('details.stage')}
        toggleAllLabel={t('details.stageAll')}
        onSelect={(change) => { controller.openDiff(change.path, false) }}
        onToggle={(change) => { void controller.stage(change) }}
        onToggleAll={() => { void controller.stage() }}
        onDiscard={(change) => { void controller.discard(change, 'untracked') }}
        discardLabel={t('details.discard')}
        discardConfirmLabel={t('details.discardConfirm')}
      />
      {loading && <p className={css.loadingHint}>{t('details.loading')}</p>}
    </div>
  )
}
