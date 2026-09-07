/**
 * Compile-time coverage for DetailsSurfacePayloadMap augmentation against the
 * public `./client` entry. Runtime assertions only prove the types evaluated.
 */
import { describe, expect, it } from 'vitest'
import type {
  DetailsSurfaceId,
  DetailsSurfacePayload,
  ShellDetailsOpenRequest,
} from '../src/client/index.ts'

declare module '../src/client/index.ts' {
  interface DetailsSurfacePayloadMap {
    'test.compile': {
      tab?: 'changes' | 'diff'
      path?: string
    }
  }
}

describe('DetailsSurfacePayloadMap', () => {
  it('accepts augmented payloads in open requests', () => {
    const request: ShellDetailsOpenRequest<DetailsSurfacePayload<'test.compile'>> = {
      surfaceId: 'test.compile' satisfies DetailsSurfaceId,
      payload: { tab: 'diff', path: 'src/app.tsx' },
    }
    expect(request.surfaceId).toBe('test.compile')
    expect(request.payload?.tab).toBe('diff')
  })
})
