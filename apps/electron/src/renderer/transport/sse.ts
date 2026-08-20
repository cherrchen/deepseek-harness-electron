/**
 * Split SSE `data:` payloads. Retained for tests and optional diagnostics;
 * Host event streams in production use the MessagePort WebSocket bridge.
 */

/**
 * Split SSE `data:` payloads from a buffered event-stream body.
 * @param buffer - Unconsumed SSE text.
 * @returns Complete `data:` JSON strings and the remainder.
 */
export function parseSseDataFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = []
  let rest = buffer
  while (true) {
    const at = rest.indexOf('\n\n')
    if (at === -1) break
    const block = rest.slice(0, at)
    rest = rest.slice(at + 2)
    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) frames.push(line.slice(5).trimStart())
    }
  }
  return { frames, rest }
}
