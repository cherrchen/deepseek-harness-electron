/**
 * Normalize clipboard text for Main-process write.
 * @param text - Candidate string from the renderer.
 * @returns The string when valid.
 * @throws When the value is not a string.
 */
export function requireClipboardText(text: unknown): string {
  if (typeof text !== 'string') {
    throw new Error('desktop clipboard: text must be a string')
  }
  return text
}
