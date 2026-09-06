import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it } from 'vitest'
import { GitService } from '../src/service.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function service(executable = 'git'): Promise<{ dispose: () => Promise<void>; git: GitService }> {
  const ctx = new Context()
  const fiber = ctx.plugin(LocalSubprocessRuntime)
  await fiber.await()
  return {
    dispose: () => fiber.dispose(),
    git: new GitService(ctx.subprocess, { executable, maxOutputBytes: 1024 * 1024, graceMs: 1000 }),
  }
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-git-'))
  roots.push(root)
  execFileSync('git', ['init', '-b', 'main'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Git Plugin Test'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'git-plugin@example.invalid'], { cwd: root })
  writeFileSync(join(root, 'tracked.txt'), 'initial\n')
  execFileSync('git', ['add', 'tracked.txt'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root })
  return root
}

describe('portable Git service', () => {
  it('detects non-repositories and reads clean repositories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-git-empty-'))
    roots.push(root)
    const { dispose, git } = await service()
    expect(await git.discover(root)).toBeNull()
    const repo = repository()
    const snapshot = await git.status(repo)
    expect(snapshot.root).toBe(realpathSync(repo))
    expect(snapshot.branch).toBe('main')
    expect(snapshot.staged).toEqual([])
    expect(snapshot.unstaged).toEqual([])
    expect(snapshot.untracked).toEqual([])
    await dispose()
  })

  it('stages, unstages, commits, creates branches, switches, and reads diffs', async () => {
    const repo = repository()
    const { dispose, git } = await service()
    writeFileSync(join(repo, 'tracked.txt'), 'changed\n')
    writeFileSync(join(repo, 'new.txt'), 'new\n')
    let snapshot = await git.status(repo)
    expect(snapshot.unstaged.map(change => change.path)).toContain('tracked.txt')
    expect(snapshot.untracked).toContain('new.txt')
    expect((await git.diff(repo, false, 'tracked.txt')).text).toContain('+changed')
    snapshot = await git.stage(repo, 'tracked.txt')
    expect(snapshot.staged.map(change => change.path)).toContain('tracked.txt')
    snapshot = await git.unstage(repo, 'tracked.txt')
    expect(snapshot.unstaged.map(change => change.path)).toContain('tracked.txt')
    await git.stage(repo)
    expect((await git.diff(repo, true)).text).toContain('+changed')
    snapshot = await git.commit(repo, 'update files')
    expect(snapshot.staged).toEqual([])
    snapshot = await git.createBranch(repo, 'feature/test')
    expect(snapshot.branches.map(branch => branch.name)).toContain('feature/test')
    snapshot = await git.switchBranch(repo, 'feature/test')
    expect(snapshot.branch).toBe('feature/test')
    await dispose()
  })

  it('reports an invalid Git executable', async () => {
    const repo = repository()
    const { dispose, git } = await service('definitely-not-a-git-executable')
    await expect(git.status(repo)).rejects.toThrow()
    await dispose()
  })

  it('represents a detached HEAD without inventing a branch', async () => {
    const repo = repository()
    execFileSync('git', ['checkout', '--detach', 'HEAD'], { cwd: repo })
    const { dispose, git } = await service()
    const snapshot = await git.status(repo)
    expect(snapshot.branch).toBeNull()
    expect(snapshot.head).toMatch(/^[0-9a-f]{40}$/u)
    await dispose()
  })

  it('reports an empty branch list after git init before the first commit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-git-unborn-'))
    roots.push(root)
    execFileSync('git', ['init', '-b', 'main'], { cwd: root })
    const { dispose, git } = await service()
    const snapshot = await git.status(root)
    expect(snapshot.branch).toBe('main')
    expect(snapshot.head).toBeNull()
    expect(snapshot.branches).toEqual([])
    await expect(git.createBranch(root, 'feature')).rejects.toThrow(/not a valid object name/iu)
    await dispose()
  })

  it('preserves Git command failures instead of reporting a missing repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-git-failing-'))
    roots.push(root)
    const executable = join(root, 'failing-git')
    writeFileSync(executable, '#!/bin/sh\nprintf permission-denied >&2\nexit 42\n')
    chmodSync(executable, 0o755)
    const { dispose, git } = await service(executable)
    await expect(git.discover(root)).rejects.toMatchObject({ exitCode: 42, stderr: 'permission-denied' })
    await dispose()
  })

  it('reads paged history and discards unstaged changes', async () => {
    const { dispose, git } = await service()
    try {
      const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-git-log-'))
      roots.push(root)
      execFileSync('git', ['init', '-b', 'main'], { cwd: root })
      execFileSync('git', ['config', 'user.name', 'Git Plugin Test'], { cwd: root })
      execFileSync('git', ['config', 'user.email', 'git-plugin@example.invalid'], { cwd: root })
      execFileSync('git', ['commit', '--allow-empty', '-m', 'first'], { cwd: root })
      execFileSync('git', ['commit', '--allow-empty', '-m', 'second'], { cwd: root })

      const page = await git.log(root, 10, 0)
      expect(page.map(commit => commit.subject)).toEqual(['second', 'first'])
      const skipped = await git.log(root, 10, 1)
      expect(skipped.map(commit => commit.subject)).toEqual(['first'])

      writeFileSync(join(root, 'tracked.txt'), 'initial\nchanged\n')
      execFileSync('git', ['add', 'tracked.txt'], { cwd: root })
      await git.discard(root, 'tracked.txt')
      const snapshot = await git.status(root)
      expect(snapshot.unstaged).toEqual([])
      expect(snapshot.staged.map(change => change.path)).toEqual(['tracked.txt'])
    } finally {
      await dispose()
    }
  })

  it('applies the history scope to the log command', async () => {
    const { dispose, git } = await service()
    try {
      const root = repository()
      execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: root })
      writeFileSync(join(root, 'feature.txt'), 'feature\n')
      execFileSync('git', ['add', 'feature.txt'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'feature work'], { cwd: root })
      execFileSync('git', ['checkout', '-q', 'main'], { cwd: root })
      writeFileSync(join(root, 'main.txt'), 'main\n')
      execFileSync('git', ['add', 'main.txt'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'main work'], { cwd: root })
      execFileSync('git', ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'], { cwd: root })

      const auto = await git.log(root, 10, 0)
      expect(auto.map(commit => commit.subject)).toEqual(['merge feature', 'main work', 'feature work', 'initial'])
      // First-parent scope mirrors `git log --first-parent`: the side branch
      // commit is not part of the queried history at all.
      const firstParent = await git.log(root, 10, 0, 'first-parent')
      expect(firstParent.map(commit => commit.subject)).toEqual(['merge feature', 'main work', 'initial'])
      // All-refs scope keeps both parents' ancestry (and stays valid).
      const all = await git.log(root, 10, 0, 'all')
      expect(all.map(commit => commit.subject)).toEqual(['merge feature', 'main work', 'feature work', 'initial'])
    } finally {
      await dispose()
    }
  })

  it.skipIf(process.platform === 'win32')('discards one magic pathspec filename without resetting other files', async () => {
    // Windows rejects `:` in a basename, so this Git magic filename cannot be created there.
    const { dispose, git } = await service()
    try {
      const root = repository()
      const magicName = ':(glob)*.txt'
      writeFileSync(join(root, magicName), 'magic\n')
      writeFileSync(join(root, 'other.txt'), 'other\n')
      execFileSync('git', ['add', '--', magicName, 'other.txt'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'special names'], { cwd: root })
      writeFileSync(join(root, magicName), 'magic-changed\n')
      writeFileSync(join(root, 'other.txt'), 'other-changed\n')

      await git.discard(root, magicName)
      expect(readFileSync(join(root, magicName), 'utf8')).toBe('magic\n')
      expect(readFileSync(join(root, 'other.txt'), 'utf8')).toBe('other-changed\n')
    } finally {
      await dispose()
    }
  })

  it('parses unmerged conflict paths without object hashes', async () => {
    const { dispose, git } = await service()
    try {
      const root = repository()
      writeFileSync(join(root, 'conflict.txt'), 'base\n')
      execFileSync('git', ['add', 'conflict.txt'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'base conflict'], { cwd: root })
      execFileSync('git', ['checkout', '-b', 'other'], { cwd: root })
      writeFileSync(join(root, 'conflict.txt'), 'other\n')
      execFileSync('git', ['commit', '-am', 'other'], { cwd: root })
      execFileSync('git', ['checkout', 'main'], { cwd: root })
      writeFileSync(join(root, 'conflict.txt'), 'main\n')
      execFileSync('git', ['commit', '-am', 'main'], { cwd: root })
      try {
        execFileSync('git', ['merge', '--no-ff', 'other'], { cwd: root })
      } catch {
        // The merge stops on the UU conflict under test.
      }

      const snapshot = await git.status(root)
      expect(snapshot.unstaged.map(change => change.path)).toEqual(['conflict.txt'])
    } finally {
      await dispose()
    }
  })
})
