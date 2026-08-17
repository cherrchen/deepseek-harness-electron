import type { UpdateChannel } from './preferences.ts'

/** GitHub repository coordinates used by the desktop updater. */
export interface UpdateRepository {
  owner: string
  repo: string
}

interface GitHubRelease {
  draft: boolean
  prerelease: boolean
  tag_name: string
}

/**
 * Resolve the exact GitHub release directory used as an electron-updater feed.
 * @param repository - GitHub owner and repository name.
 * @param channel - Stable-only or inclusive prerelease stream.
 * @param request - Fetch implementation, injectable for deterministic tests.
 * @returns Release download directory, or undefined when the channel has no release.
 */
export async function resolveUpdateFeed(
  repository: UpdateRepository,
  channel: UpdateChannel,
  request: typeof fetch = fetch,
): Promise<string | undefined> {
  const repositoryUrl = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/releases`
  const url = channel === 'stable' ? `${repositoryUrl}/latest` : `${repositoryUrl}?per_page=20`
  const response = await request(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  })
  if (channel === 'stable' && response.status === 404) return undefined
  if (!response.ok) throw new Error(`GitHub Releases request failed with HTTP ${String(response.status)}.`)
  const value: unknown = await response.json()
  const release = channel === 'stable'
    ? asPublishedRelease(value, false)
    : Array.isArray(value)
      ? value.map(item => asPublishedRelease(item)).find(item => item !== undefined)
      : undefined
  if (release === undefined) return undefined
  return `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/releases/download/${encodeURIComponent(release.tag_name)}`
}

function asPublishedRelease(value: unknown, prerelease?: boolean): GitHubRelease | undefined {
  if (!isRecord(value)
    || typeof value.draft !== 'boolean'
    || typeof value.prerelease !== 'boolean'
    || typeof value.tag_name !== 'string'
    || value.tag_name.length === 0
    || value.draft
    || (prerelease !== undefined && value.prerelease !== prerelease)) return undefined
  return {
    draft: value.draft,
    prerelease: value.prerelease,
    tag_name: value.tag_name,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
