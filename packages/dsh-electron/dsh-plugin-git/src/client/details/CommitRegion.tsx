/**
 * Fixed commit region inside the Git Changes surface: editable message,
 * optional AI proposal, and a split commit action. Generation only fills
 * the editable input — it never stages, commits, or pushes.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GitGenerationUnavailableReason, GitRepositorySnapshot } from '../../types.ts'
import type { GitClientController, GitCommitFollowUp } from '../controller.ts'
import type { GitLocaleKey } from '../locales.ts'
import { IconChevronDownOutline14, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconGitWand } from './GitActionIcons.tsx'
import css from '../GitDetailsSurface.module.css'

type CommitMode = 'commit' | 'amend' | 'commit-push' | 'commit-sync'

function fitTextareaToContent(el: HTMLTextAreaElement): void {
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}

function modeLabel(mode: CommitMode, t: (key: GitLocaleKey) => string): string {
  if (mode === 'amend') return t('details.commitAmend')
  if (mode === 'commit-push') return t('details.commitAndPush')
  if (mode === 'commit-sync') return t('details.commitAndSync')
  return t('details.commit')
}

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
  const hasMessage = commitMessage.trim() !== ''
  const hasHead = repository.head !== null
  const canCommit = hasMessage && stagedCount > 0 && !generating
  const canAmend = hasMessage && hasHead && !generating
  const canGenerate = generationAvailable && stagedCount > 0 && !generating
  const [mode, setMode] = useState<CommitMode>('commit')
  const [menuOpen, setMenuOpen] = useState(false)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const getAnchorRect = useCallback(() => chevronRef.current?.getBoundingClientRect() ?? null, [])
  const canRun = mode === 'amend' ? canAmend : canCommit
  useLayoutEffect(() => {
    if (messageRef.current !== null) fitTextareaToContent(messageRef.current)
  }, [commitMessage])
  useLayoutEffect(() => {
    if (!canRun) setMenuOpen(false)
  }, [canRun])
  const unavailableHint = generationReason === 'llm-unavailable'
    ? t('details.generateLlmUnavailable')
    : generationReason === 'default-model-missing'
      ? t('details.generateNoDefaultModel')
      : t('details.generateUnavailable')

  const items = useMemo((): readonly MenuEntry[] => [
    { id: 'commit', label: t('details.commit'), disabled: !canCommit },
    { id: 'amend', label: t('details.commitAmend'), disabled: !canAmend },
    { id: 'commit-push', label: t('details.commitAndPush'), disabled: !canCommit },
    { id: 'commit-sync', label: t('details.commitAndSync'), disabled: !canCommit },
  ], [canAmend, canCommit, t])

  const run = (next: CommitMode): void => {
    setMode(next)
    if (next === 'amend') {
      if (!canAmend) return
      void controller.commit(commitMessage, { amend: true })
      return
    }
    if (!canCommit) return
    const followUp: GitCommitFollowUp | undefined = next === 'commit-push'
      ? 'push'
      : next === 'commit-sync'
        ? 'sync'
        : undefined
    void controller.commit(commitMessage, followUp === undefined ? {} : { followUp })
  }

  return (
    <div className={css.commitRegion} data-git-commit-region="">
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      <div className={css.field}>
        <textarea
          ref={messageRef}
          aria-label={t('details.commitPlaceholder')}
          rows={1}
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
            <IconGitWand />
          </button>
        </Tooltip>
      </div>
      <div className={css.commitSplit}>
        <button
          type="button"
          className={css.commitMain}
          disabled={!canRun}
          onClick={() => { run(mode) }}
        >
          {modeLabel(mode, t)}
        </button>
        <div className={css.commitMenu}>
          <Menu
            open={menuOpen}
            items={items}
            selectedId={mode}
            align="end"
            side="bottom"
            portal
            getAnchorRect={getAnchorRect}
            onSelect={(id) => {
              setMenuOpen(false)
              run(id as CommitMode)
            }}
            onClose={() => { setMenuOpen(false) }}
            anchor={(
              <button
                ref={chevronRef}
                type="button"
                className={css.commitChevron}
                aria-label={t('details.commitOptions')}
                aria-expanded={menuOpen}
                disabled={!canRun}
                onClick={() => { setMenuOpen(open => !open) }}
              >
                <IconChevronDownOutline14 />
              </button>
            )}
          />
        </div>
      </div>
      {generationError !== undefined && (
        <p className={css.error} role="alert">
          {generationError === 'stage-changes-first' ? t('details.generateNeedsStaged') : generationError}
        </p>
      )}
    </div>
  )
}
