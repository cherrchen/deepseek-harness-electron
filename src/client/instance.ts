/**
 * Surface instance identity helpers. P0 keeps at most one active instance;
 * history and dedupe arrive in later gates.
 */
import type { DetailsSurfaceInstance } from './contract.ts'

let nextInstanceSerial = 0

/**
 * Allocate a Host-scoped unique instance id.
 * @returns a new opaque instance id string.
 */
export function createInstanceId(): string {
  nextInstanceSerial += 1
  return `details-instance-${String(nextInstanceSerial)}`
}

/**
 * Build a surface instance for an accepted open request.
 * @param surfaceId - registered `shell.details.surface` contribution id.
 * @param payload - open arguments for this instance.
 * @param label - resolved display label.
 * @param sessionId - current session id at creation time.
 * @returns a new instance record.
 */
export function createSurfaceInstance<P = unknown>(
  surfaceId: string,
  payload: P,
  label: string,
  sessionId: string,
): DetailsSurfaceInstance<P> {
  return {
    instanceId: createInstanceId(),
    surfaceId,
    payload,
    label,
    sessionId,
  }
}

/**
 * Reset the instance serial counter. Tests only.
 */
export function resetInstanceIdCounterForTests(): void {
  nextInstanceSerial = 0
}
