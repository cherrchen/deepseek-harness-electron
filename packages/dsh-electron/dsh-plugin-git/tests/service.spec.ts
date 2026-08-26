import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
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
})
