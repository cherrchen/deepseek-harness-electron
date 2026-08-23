import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitFileChange } from '../types.ts'
import type { GitClientController } from './controller.ts'
import css from './GitPanel.module.css'

export type GitPanelProps = PropsRuntime<'shell.overlay'> & PropsLocale<'git'>
  & { controller: GitClientController }

/** Render the repository workspace as a modal over the shared application frame. */
export function GitPanel({ controller, t }: GitPanelProps): ReactNode {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [message, setMessage] = useState('')
  const [branch, setBranch] = useState('')
  const repository = state.repository
  const clean = repository !== undefined && repository !== null
    && repository.staged.length + repository.unstaged.length + repository.untracked.length === 0
  return (
    <Modal
      open={state.open}
      onClose={() => { controller.close() }}
      title={t('panel.title')}
      closeLabel={t('panel.close')}
      className={css.dialog ?? ''}
      contentClassName={css.content ?? ''}
    >
      <div className={css.toolbar}>
        {repository !== undefined && repository !== null && (
          <span className={css.identity}><strong>{repository.branch ?? repository.head?.slice(0, 8) ?? 'HEAD'}</strong><span>{repository.root}</span></span>
        )}
        <span className={css.toolbarActions}>
          {state.desktopAvailable && repository !== undefined && repository !== null && (
            <Button size="sm" variant="ghost" onClick={() => { void controller.reveal() }}>{t('panel.reveal')}</Button>
          )}
          <Button size="sm" variant="outline" disabled={state.loading} onClick={() => { void controller.refresh() }}>{t('panel.refresh')}</Button>
        </span>
      </div>
      {state.error !== undefined && <p className={css.error} role="alert">{state.error}</p>}
      {state.loading && repository === undefined && <p className={css.empty}>{t('panel.loading')}</p>}
      {!state.loading && state.workspacePath === undefined && <p className={css.empty}>{t('panel.noWorkspace')}</p>}
      {!state.loading && repository === null && <p className={css.empty}>{t('panel.notRepository')}</p>}
      {repository !== undefined && repository !== null && (
        <div className={css.workspace}>
          <div className={css.changes}>
            {clean && <p className={css.clean}>{t('panel.clean')}</p>}
            <ChangeSection title={t('panel.staged')} changes={repository.staged} action={t('panel.unstage')} onSelect={path => controller.selectDiff(path, true)} onAction={path => controller.unstage(path)} />
            <ChangeSection title={t('panel.unstaged')} changes={repository.unstaged} action={t('panel.stage')} onSelect={path => controller.selectDiff(path, false)} onAction={path => controller.stage(path)} />
            <ChangeSection title={t('panel.untracked')} changes={repository.untracked.map(path => ({ path, status: '??' }))} action={t('panel.stage')} onSelect={() => Promise.resolve()} onAction={path => controller.stage(path)} />
            <div className={css.bulkActions}>
              <Button size="sm" variant="ghost" onClick={() => { void controller.stage() }}>{t('panel.stageAll')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { void controller.unstage() }}>{t('panel.unstageAll')}</Button>
            </div>
            <label className={css.field}>
              <span>{t('panel.commitPlaceholder')}</span>
              <textarea value={message} onChange={(event) => { setMessage(event.target.value) }} />
            </label>
            <Button variant="primary" disabled={message.trim() === '' || repository.staged.length === 0 || state.loading} onClick={() => { void controller.commit(message).then(() => { setMessage('') }) }}>{t('panel.commit')}</Button>
            <div className={css.branchControls}>
              <label className={css.field}>
                <span>{t('panel.branch')}</span>
                <select value={repository.branch ?? ''} onChange={(event) => { void controller.switchBranch(event.target.value) }}>
                  {repository.branches.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
                </select>
              </label>
              <label className={css.field}>
                <span>{t('panel.createBranchPlaceholder')}</span>
                <input value={branch} onChange={(event) => { setBranch(event.target.value) }} />
              </label>
              <Button size="sm" variant="outline" disabled={branch.trim() === '' || state.loading} onClick={() => { void controller.createBranch(branch).then(() => { setBranch('') }) }}>{t('panel.createBranch')}</Button>
            </div>
          </div>
          <section className={css.diff} aria-label={t('panel.diff')}>
            <h3>{t('panel.diff')}</h3>
            {state.diff === undefined
              ? <p>{t('panel.noDiff')}</p>
              : <pre>{state.diff.text || t('panel.clean')}</pre>}
          </section>
        </div>
      )}
    </Modal>
  )
}

function ChangeSection({ title, changes, action, onSelect, onAction }: {
  title: string
  changes: readonly GitFileChange[]
  action: string
  onSelect: (path: string) => Promise<void>
  onAction: (path: string) => Promise<void>
}): ReactNode {
  if (changes.length === 0) return null
  return (
    <section className={css.changeSection}>
      <h3>{title}<span>{changes.length}</span></h3>
      {changes.map(change => (
        <div className={css.changeRow} key={`${change.status}:${change.path}`}>
          <button type="button" className={css.path} onClick={() => { void onSelect(change.path) }}><code>{change.status}</code><span>{change.path}</span></button>
          <Button size="sm" variant="ghost" onClick={() => { void onAction(change.path) }}>{action}</Button>
        </div>
      ))}
    </section>
  )
}
