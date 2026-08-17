import { describe, expect, it, vi } from 'vitest'
import { resolveUpdateFeed } from '../src/update-feed.ts'

const repository = { owner: 'owner', repo: 'desktop' }

describe('Electron update feed discovery', () => {
  it('lets the prerelease channel receive the newest published prerelease or stable release', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response([
      { draft: true, prerelease: false, tag_name: 'draft' },
      { draft: false, prerelease: true, tag_name: 'electron-dsh-v1.2.0-rc.1' },
      { draft: false, prerelease: false, tag_name: 'electron-dsh-v1.1.0' },
    ]))
    await expect(resolveUpdateFeed(repository, 'prerelease', request)).resolves.toBe(
      'https://github.com/owner/desktop/releases/download/electron-dsh-v1.2.0-rc.1',
    )
    expect(request).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/desktop/releases?per_page=20',
      expect.any(Object),
    )
  })

  it('uses GitHub latest so the stable channel cannot receive a prerelease', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({
      draft: false,
      prerelease: false,
      tag_name: 'electron-dsh-v1.1.0',
    }))
    await expect(resolveUpdateFeed(repository, 'stable', request)).resolves.toBe(
      'https://github.com/owner/desktop/releases/download/electron-dsh-v1.1.0',
    )
    expect(request).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/desktop/releases/latest',
      expect.any(Object),
    )
  })

  it('reports an empty stable channel without treating the missing release as a network failure', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({}, 404))
    await expect(resolveUpdateFeed(repository, 'stable', request)).resolves.toBeUndefined()
  })

  it('rejects GitHub failures without exposing response bodies', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ secret: 'body' }, 503))
    await expect(resolveUpdateFeed(repository, 'prerelease', request)).rejects.toThrow(
      'GitHub Releases request failed with HTTP 503.',
    )
  })
})

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
