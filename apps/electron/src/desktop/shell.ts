/** Protocols the renderer may ask Main to open externally. */
export const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

/**
 * Whether a URL may be handed to the OS default handler.
 * @param value - Candidate URL string from the renderer or window-open handler.
 * @returns True only for allowlisted protocols with a parseable URL.
 */
export function isAllowedExternalUrl(value: string): boolean {
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

/**
 * Reject empty or null-byte paths before OS shell calls.
 * @param value - Candidate filesystem path.
 * @returns Trimmed path, or undefined when invalid.
 */
export function normalizeShellPath(value: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.includes('\0')) return undefined
  return trimmed
}
